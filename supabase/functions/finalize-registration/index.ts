import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface EmailRequest {
  type: 'payment_success' | 'registration_approved' | 'exam_reminder' | 'verify';
  registration_id?: string;
  force_resend?: boolean;
  phone?: string;
  email?: string;
}

interface SmtpResult {
  success: boolean;
  method: string;
  message_id?: string;
  error?: string;
}

interface RegistrationData {
  id: string;
  registration_number: string | null;
  exam_id: string;
  full_name: string;
  email: string;
  payment_amount: number | null;
  transaction_id: string | null;
  exam_password: string | null;
  email_sent_payment: boolean;
  email_sent_approval: boolean;
}

async function sendSmtpEmail(to: string, subject: string, htmlBody: string): Promise<SmtpResult> {
  const smtpHostRaw = Deno.env.get('SMTP_HOST') || '';
  const smtpHost = smtpHostRaw.replace(/^(smtp|smtps):\/\//, '');
  const smtpPort = Deno.env.get('SMTP_PORT') || '587';
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  const smtpFromRaw = Deno.env.get('SMTP_FROM_EMAIL') || smtpUser;
  
  const smtpFrom = smtpFromRaw?.includes('<') 
    ? smtpFromRaw 
    : `RKB Exam Portal <${smtpFromRaw}>`;

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return {
      success: false,
      method: 'smtp',
      error: 'SMTP credentials not configured.'
    };
  }

  let client;
  try {
    client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: parseInt(smtpPort),
        tls: smtpPort === '465',
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: smtpFrom!,
      to: to,
      subject: subject,
      html: htmlBody,
    });

    await client.close();
    return {
      success: true,
      method: 'smtp',
      message_id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    };
  } catch (error: any) {
    try { if (client) await client.close(); } catch { /* ignore */ }
    return {
      success: false,
      method: 'smtp',
      error: error.message || 'SMTP Error'
    };
  }
}

async function fetchRegistrationData(supabase: any, registrationId: string): Promise<RegistrationData | null> {
  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, registration_number, exam_id, student_id, payment_amount, transaction_id, exam_password, email_sent_payment, email_sent_approval')
    .eq('id', registrationId)
    .single();

  if (regError || !registration) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', registration.student_id)
    .single();

  if (profileError || !profile || !profile.email) return null;

  return {
    id: registration.id,
    registration_number: registration.registration_number,
    exam_id: registration.exam_id,
    full_name: profile.full_name,
    email: profile.email,
    payment_amount: registration.payment_amount,
    transaction_id: registration.transaction_id,
    exam_password: registration.exam_password,
    email_sent_payment: registration.email_sent_payment || false,
    email_sent_approval: registration.email_sent_approval || false,
  };
}

async function updateEmailSentFlag(supabase: any, registrationId: string, field: string): Promise<void> {
  await supabase.from('registrations').update({ [field]: true }).eq('id', registrationId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { type, registration_id, force_resend, phone, email }: EmailRequest = await req.json();

    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const externalUrlRaw = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    // Strip /rest/v1 if present in external URL
    const externalUrl = externalUrlRaw ? externalUrlRaw.replace(/\/rest\/v1\/?$/, '') : null;

    const primaryClient = (externalUrl && externalKey) 
      ? createClient(externalUrl, externalKey) 
      : createClient(internalUrl, internalKey);

    // HANDLE VERIFICATION PROXY
    if (type === 'verify') {
      const response = await fetch('https://rkb-verification-api.onrender.com/api/check-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email })
      });
      const result = await response.json();
      return new Response(JSON.stringify(result), { 
        status: response.ok ? 200 : 400, 
        headers: corsHeaders 
      });
    }

    if (!registration_id) throw new Error('Registration ID required');
    const registration = await fetchRegistrationData(primaryClient, registration_id);
    if (!registration) throw new Error('Registration not found');

    if (type === 'payment_success' && registration.email_sent_payment && !force_resend) {
      return new Response(JSON.stringify({ success: false, error: 'Email already sent' }), { status: 400, headers: corsHeaders });
    }

    const { data: exam } = await primaryClient.from('exams').select('exam_name, exam_date, exam_time').eq('id', registration.exam_id).maybeSingle();
    const examData = exam || { exam_name: 'Examination', exam_date: 'TBA', exam_time: 'TBA' };

    let examDateFormatted = examData.exam_date;
    try { examDateFormatted = new Date(examData.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { }

    let subject = '';
    let htmlBody = '';

    if (type === 'payment_success') {
      subject = `✓ Payment Confirmed - ${examData.exam_name}`;
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f4"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><tr><td style="background:linear-gradient(135deg,#4CAF50 0%,#45a049 100%);padding:30px;text-align:center"><div style="font-size:48px;margin-bottom:10px;color:white">✓</div><h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600">Payment Successful!</h1></td></tr><tr><td style="padding:30px"><p style="font-size:16px;color:#333;margin:0 0 20px 0">Dear <strong>${registration.full_name}</strong>,</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">Your payment has been successfully processed. Thank you for registering for the examination.</p><table width="100%" cellpadding="15" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin-bottom:25px"><tr><td><h3 style="margin:0 0 15px 0;color:#333;font-size:16px;border-bottom:2px solid #4CAF50;padding-bottom:8px">Transaction Details</h3><table width="100%" cellpadding="5" cellspacing="0"><tr><td style="color:#666;width:40%">Exam:</td><td style="color:#333;font-weight:500">${examData.exam_name}</td></tr><tr><td style="color:#666">Registration No:</td><td style="color:#333;font-weight:500">${registration.registration_number || 'To be assigned'}</td></tr><tr><td style="color:#666">Amount Paid:</td><td style="color:#4CAF50;font-weight:700;font-size:18px">₹${registration.payment_amount}</td></tr><tr><td style="color:#666">Transaction ID:</td><td style="color:#333;font-family:monospace">${registration.transaction_id || 'N/A'}</td></tr><tr><td style="color:#666">Exam Date:</td><td style="color:#333;font-weight:500">${examDateFormatted}</td></tr><tr><td style="color:#666">Exam Time:</td><td style="color:#333;font-weight:500">${examData.exam_time}</td></tr></table></td></tr></table><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 20px 0">📧 <strong>Note:</strong> You will receive another email with your exam login credentials once your registration is approved by the administrator.</p><p style="font-size:14px;color:#333;line-height:1.6;margin:0">Regards,<br/><strong>Leela Ram Samavedam</strong><br/>Exam Coordinator<br/>RKB Teja Coaching Center<br/>Support Contact: 9640140444</p></td></tr><tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #eee"><p style="margin:0;font-size:12px;color:#999">This is an automated message. Please do not reply.</p><p style="margin:5px 0 0 0;font-size:12px;color:#999">© ${new Date().getFullYear()} RKB Education Management System</p></td></tr></table></td></tr></table></body></html>`.trim();
    } else if (type === 'registration_approved') {
      subject = `🎉 Registration Approved - ${examData.exam_name}`;
      let reportingTime = examData.exam_time;
      try {
        const [h, m] = examData.exam_time.split(':');
        const d = new Date(); d.setHours(parseInt(h), parseInt(m) - 15);
        reportingTime = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      } catch { }

      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f4"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><tr><td style="background:linear-gradient(135deg,#2196F3 0%,#1976D2 100%);padding:30px;text-align:center"><h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600">Registration Approved</h1></td></tr><tr><td style="padding:30px"><p style="font-size:16px;color:#333;margin:0 0 20px 0">Dear <strong>${registration.full_name}</strong>,</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">This is to inform you that your application for the <strong>${examData.exam_name}</strong> has been <strong style="color:#4CAF50">successfully approved</strong>.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 15px 0">Please review your exam details carefully:</p><h3 style="margin:0 0 10px 0;color:#333;font-size:16px">Student Information:</h3><ul style="margin:0 0 20px 0;padding-left:20px;color:#555;line-height:1.8"><li><strong>Name:</strong> ${registration.full_name}</li><li><strong>Student ID:</strong> ${registration.registration_number}</li><li><strong>Course/Batch:</strong> ${examData.exam_name}</li></ul><h3 style="margin:0 0 10px 0;color:#333;font-size:16px">Exam Schedule:</h3><ul style="margin:0 0 20px 0;padding-left:20px;color:#555;line-height:1.8"><li><strong>Date:</strong> ${examDateFormatted}</li><li><strong>Reporting Time:</strong> ${reportingTime}</li><li><strong>Exam Start Time:</strong> ${examData.exam_time}</li><li><strong>Duration:</strong> As per exam rules</li><li><strong>Platform:</strong> Online Proctored Examination System</li></ul><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 20px 0">You are required to log in <strong style="color:#E65100">before the reporting time</strong>. The exam window will begin strictly as scheduled, and <strong style="color:#E65100">late access may result in disqualification from the exam</strong>.</p><table width="100%" cellpadding="15" cellspacing="0" style="background:#E3F2FD;border-radius:8px;margin-bottom:25px;border:1px solid #90CAF9"><tr><td><h3 style="margin:0 0 15px 0;color:#1565C0;font-size:16px;text-align:center">🔐 Your Login Credentials</h3><table width="100%" cellpadding="5" cellspacing="0"><tr><td style="color:#555;text-align:right;width:50%;padding-right:10px">Login ID:</td><td style="font-family:monospace;font-weight:700;font-size:16px;color:#333">${registration.registration_number}</td></tr><tr><td style="color:#555;text-align:right;width:50%;padding-right:10px">Password:</td><td style="font-family:monospace;font-weight:700;font-size:16px;color:#333">${registration.exam_password || 'Contact Admin'}</td></tr></table></td></tr></table><h3 style="margin:0 0 10px 0;color:#333;font-size:16px">Important Instructions:</h3><ul style="margin:0 0 20px 0;padding-left:20px;color:#555;line-height:1.8"><li>Keep your camera and microphone enabled throughout the exam.</li><li>Ensure you are seated in a quiet, well-lit environment.</li><li>Do not use any unauthorized devices or materials.</li><li>Follow all proctoring guidelines during the exam.</li></ul><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 15px 0">This exam is an important assessment—please treat it with full seriousness and responsibility.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">We recommend checking your device, internet connection, and login credentials in advance to avoid disruptions.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">Wishing you success in your examination.</p><p style="font-size:15px;color:#333;line-height:1.6;margin:0">Regards,<br/><strong>Leela Ram Samavedam</strong><br/>Exam Coordinator<br/>RKB Teja Coaching Center<br/>Support Contact: 9640140444</p></td></tr></table></td></tr></table></body></html>`.trim();
    } else if (type === 'exam_reminder') {
      subject = `⏰ Reminder: ${examData.exam_name} is starting soon`;
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f4"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><tr><td style="background:linear-gradient(135deg,#FF9800 0%,#F57C00 100%);padding:30px;text-align:center"><h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600">Exam Reminder</h1></td></tr><tr><td style="padding:30px"><p style="font-size:16px;color:#333;margin:0 0 20px 0">Dear <strong>${registration.full_name}</strong>,</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">This is a reminder that your <strong>${examData.exam_name}</strong> is scheduled <strong>today at ${examData.exam_time}</strong>.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 15px 0">Please log in <strong>10–15 minutes early</strong> to avoid any last-minute issues.<br/>Late entry may not be allowed.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">Be prepared and follow all exam guidelines.</p><p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 25px 0">All the best!</p><p style="font-size:15px;color:#333;line-height:1.6;margin:0">Regards,<br/><strong>RKB Teja Coaching Center</strong></p></td></tr></table></td></tr></table></body></html>`.trim();
    }

    const emailResult = await sendSmtpEmail(registration.email, subject, htmlBody);
    if (emailResult.success) {
      const updateField = type === 'payment_success' ? 'email_sent_payment' : 'email_sent_approval';
      await updateEmailSentFlag(primaryClient, registration_id, updateField);
    }

    return new Response(JSON.stringify(emailResult), { status: emailResult.success ? 200 : 400, headers: corsHeaders });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
