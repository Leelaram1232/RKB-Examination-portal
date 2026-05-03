import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface EmailRequest {
  type: 'payment_success' | 'registration_approved' | 'exam_reminder';
  registration_id: string;
  force_resend?: boolean;
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
  console.log('[SMTP] Starting email send process');
  
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
      error: 'SMTP credentials not configured. Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD'
    };
  }

  let client;
  try {
    console.log(`[SMTP] Connecting to ${smtpHost}:${smtpPort} (TLS: ${smtpPort === '465'})`);
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

    console.log('[SMTP] Sending email...');
    await client.send({
      from: smtpFrom!,
      to: to,
      subject: subject,
      html: htmlBody,
    });

    console.log('[SMTP] Closing connection...');
    await client.close();
    console.log('[SMTP] Email sent successfully!');

    return {
      success: true,
      method: 'smtp',
      message_id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    };

  } catch (error: any) {
    console.error('[SMTP] Error occurred:', error);
    
    // Try to close client if it exists to avoid leaking connections
    try { if (client) await client.close(); } catch { /* ignore */ }

    let errorMessage = error.message || 'Unknown SMTP error';
    if (errorMessage.includes('authentication')) {
      errorMessage = 'SMTP Authentication failed';
    } else if (errorMessage.includes('connection')) {
      errorMessage = 'SMTP Connection failed';
    } else if (errorMessage.includes('invalid cmd')) {
      errorMessage = 'SMTP Protocol error (invalid command). Check if port/TLS settings match your provider.';
    } else if (errorMessage.includes('BadResource')) {
      errorMessage = 'SMTP TLS Error (BadResource). This is a known issue with STARTTLS on Port 587. Please change your SMTP_PORT to 465 in Supabase secrets and try again.';
    }

    return {
      success: false,
      method: 'smtp',
      error: errorMessage
    };
  }
}

// Fetch registration data from registrations + profiles tables
async function fetchRegistrationData(
  supabase: any, 
  registrationId: string
): Promise<RegistrationData | null> {
  
  console.log('[EMAIL] Fetching registration from registrations table...');
  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, registration_number, exam_id, student_id, payment_amount, transaction_id, exam_password, email_sent_payment, email_sent_approval')
    .eq('id', registrationId)
    .single();

  if (regError || !registration) {
    console.error('[EMAIL] Registration not found:', regError);
    return null;
  }

  // Fetch profile for student details
  console.log('[EMAIL] Fetching profile for student_id:', registration.student_id);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', registration.student_id)
    .single();

  if (profileError || !profile || !profile.email) {
    console.error('[EMAIL] Profile not found:', profileError);
    return null;
  }

  console.log('[EMAIL] Found registration:', registration.registration_number);
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

// Update email sent flag in registrations table
async function updateEmailSentFlag(
  supabase: any,
  registrationId: string,
  field: 'email_sent_payment' | 'email_sent_approval'
): Promise<void> {
  const { error } = await supabase
    .from('registrations')
    .update({ [field]: true })
    .eq('id', registrationId);

  if (error) {
    console.error(`[EMAIL] Failed to update ${field}:`, error);
  } else {
    console.log(`[EMAIL] Updated ${field} flag to true`);
  }
}

Deno.serve(async (req) => {
  console.log(`=== SEND NOTIFICATION EMAIL: ${req.method} ${req.url} ===`);
  console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    console.log('Raw body:', rawBody);
    
    if (!rawBody) {
      throw new Error('Empty request body');
    }

    const { type, registration_id, force_resend }: EmailRequest = JSON.parse(rawBody);

    console.log('[EMAIL] Request type:', type);
    console.log('[EMAIL] Registration ID:', registration_id);

    if (!type || !registration_id) {
      throw new Error('Missing type or registration_id');
    }

    // 1. Identify which Supabase client to use as primary (where registrations live)
    // If EXTERNAL_SUPABASE_URL is provided, we use that for the database
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const internalSupabase = createClient(internalUrl, internalKey);
    
    // Create external client if credentials exist
    let externalSupabase = null;
    if (externalUrl && externalKey) {
      externalSupabase = createClient(externalUrl, externalKey);
    }

    // Determine primary client for registrations table
    // Most users move registrations to the external DB
    const primaryClient = externalSupabase || internalSupabase;
    
    console.log('[EMAIL] Using Database:', externalSupabase ? 'EXTERNAL' : 'INTERNAL');

    // Fetch registration data from primary database
    const registration = await fetchRegistrationData(primaryClient, registration_id);


    if (!registration) {
      console.error('[EMAIL] Registration not found');
      throw new Error('Registration not found');
    }

    console.log('[EMAIL] Registration found:', registration.registration_number);

    // Check for duplicate email prevention
    if (type === 'payment_success' && registration.email_sent_payment) {
      console.warn('[EMAIL] Payment email already sent - preventing duplicate');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Payment confirmation email already sent',
          duplicate: true 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (type === 'registration_approved' && registration.email_sent_approval && !force_resend) {
      console.warn('[EMAIL] Approval email already sent - preventing duplicate');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Approval email already sent',
          duplicate: true 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[EMAIL] Student:', registration.full_name, '-', registration.email);

    // Fetch exam details from primary database (where exams usually are if using external)
    let exam: { exam_name: string; exam_date: string; exam_time: string } | null = null;
    
    if (registration.exam_id) {
      // Use external client if available, otherwise primary
      const examClient = externalSupabase || primaryClient;
      
      const { data: examData, error: examError } = await examClient
        .from('exams')
        .select('exam_name, exam_date, exam_time')
        .eq('id', registration.exam_id)
        .maybeSingle();

      if (examError) {
        console.error('[EMAIL] Exam query error:', examError);
      }
      
      exam = examData;
    }
    
    // If no exam found, use placeholder values
    if (!exam) {
      console.warn('[EMAIL] No exam associated with this registration, using placeholder values');
      exam = {
        exam_name: 'Scholarship Examination',
        exam_date: 'To be announced',
        exam_time: 'To be announced'
      };
    }

    console.log('[EMAIL] Exam:', exam.exam_name);

    // Format exam date only if it's a valid date string
    let examDateFormatted = exam.exam_date;
    if (exam.exam_date && exam.exam_date !== 'To be announced') {
      try {
        examDateFormatted = new Date(exam.exam_date).toLocaleDateString('en-IN', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        });
      } catch {
        examDateFormatted = exam.exam_date;
      }
    }

    let subject = '';
    let htmlBody = '';

    if (type === 'payment_success') {
      subject = `✓ Payment Confirmed - ${exam.exam_name}`;
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">✓</div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Payment Successful!</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
                Dear <strong>${registration.full_name}</strong>,
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                Your payment has been successfully processed. Thank you for registering for the examination.
              </p>
              
              <!-- Transaction Details Box -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                  <td>
                    <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px; border-bottom: 2px solid #4CAF50; padding-bottom: 8px;">Transaction Details</h3>
                    <table width="100%" cellpadding="5" cellspacing="0">
                      <tr><td style="color: #666; width: 40%;">Exam:</td><td style="color: #333; font-weight: 500;">${exam.exam_name}</td></tr>
                      <tr><td style="color: #666;">Registration No:</td><td style="color: #333; font-weight: 500;">${registration.registration_number || 'To be assigned'}</td></tr>
                      <tr><td style="color: #666;">Amount Paid:</td><td style="color: #4CAF50; font-weight: 700; font-size: 18px;">₹${registration.payment_amount}</td></tr>
                      <tr><td style="color: #666;">Transaction ID:</td><td style="color: #333; font-family: monospace;">${registration.transaction_id || 'N/A'}</td></tr>
                      <tr><td style="color: #666;">Exam Date:</td><td style="color: #333; font-weight: 500;">${examDateFormatted}</td></tr>
                      <tr><td style="color: #666;">Exam Time:</td><td style="color: #333; font-weight: 500;">${exam.exam_time}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
                📧 <strong>Note:</strong> You will receive another email with your exam login credentials once your registration is approved by the administrator.
              </p>

              <p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0;">
                Regards,<br/>
                <strong>Leela Ram Samavedam</strong><br/>
                Exam Coordinator<br/>
                RKB Teja Coaching Center<br/>
                Support Contact: 9640140444
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999;">This is an automated message. Please do not reply.</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">© ${new Date().getFullYear()} RKB Education Management System</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    } else if (type === 'registration_approved') {
      subject = `🎉 Registration Approved - ${exam.exam_name}`;
      
      // Calculate reporting time (15 mins before exam_time if possible)
      let reportingTime = exam.exam_time;
      if (exam.exam_time && typeof exam.exam_time === 'string' && exam.exam_time.includes(':')) {
        try {
          const [hoursStr, minutesStr] = exam.exam_time.split(':');
          let hours = parseInt(hoursStr);
          let minutes = parseInt(minutesStr);
          
          let date = new Date();
          date.setHours(hours, minutes, 0);
          date.setMinutes(date.getMinutes() - 15);
          
          let ampm = date.getHours() >= 12 ? 'PM' : 'AM';
          let h = date.getHours() % 12;
          h = h ? h : 12;
          let m = date.getMinutes().toString().padStart(2, '0');
          reportingTime = `${h}:${m} ${ampm}`;
        } catch(e) {
          reportingTime = '15 minutes before exam';
        }
      }

      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Registration Approved</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
                Dear <strong>${registration.full_name}</strong>,
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                This is to inform you that your application for the <strong>${exam.exam_name}</strong> has been <strong style="color: #4CAF50;">successfully approved</strong>.
              </p>
              
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 15px 0;">
                Please review your exam details carefully:
              </p>

              <!-- Student Info -->
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Student Information:</h3>
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #555; line-height: 1.8;">
                <li><strong>Name:</strong> ${registration.full_name}</li>
                <li><strong>Student ID:</strong> ${registration.registration_number}</li>
                <li><strong>Course/Batch:</strong> ${exam.exam_name}</li>
              </ul>

              <!-- Exam Schedule -->
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Exam Schedule:</h3>
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #555; line-height: 1.8;">
                <li><strong>Date:</strong> ${examDateFormatted}</li>
                <li><strong>Reporting Time:</strong> ${reportingTime}</li>
                <li><strong>Exam Start Time:</strong> ${exam.exam_time}</li>
                <li><strong>Duration:</strong> As per exam rules</li>
                <li><strong>Platform:</strong> Online Proctored Examination System</li>
              </ul>
              
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
                You are required to log in <strong style="color: #E65100;">before the reporting time</strong>. The exam window will begin strictly as scheduled, and <strong style="color: #E65100;">late access may result in disqualification from the exam</strong>.
              </p>

              <!-- Credentials Box -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background: #E3F2FD; border-radius: 8px; margin-bottom: 25px; border: 1px solid #90CAF9;">
                <tr>
                  <td>
                    <h3 style="margin: 0 0 15px 0; color: #1565C0; font-size: 16px; text-align: center;">🔐 Your Login Credentials</h3>
                    <table width="100%" cellpadding="5" cellspacing="0">
                      <tr>
                        <td style="color: #555; text-align: right; width: 50%; padding-right: 10px;">Login ID:</td>
                        <td style="font-family: monospace; font-weight: 700; font-size: 16px; color: #333;">${registration.registration_number}</td>
                      </tr>
                      <tr>
                        <td style="color: #555; text-align: right; width: 50%; padding-right: 10px;">Password:</td>
                        <td style="font-family: monospace; font-weight: 700; font-size: 16px; color: #333;">${registration.exam_password || 'Contact Admin'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Important Instructions:</h3>
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #555; line-height: 1.8;">
                <li>Keep your camera and microphone enabled throughout the exam.</li>
                <li>Ensure you are seated in a quiet, well-lit environment.</li>
                <li>Do not use any unauthorized devices or materials.</li>
                <li>Follow all proctoring guidelines during the exam.</li>
              </ul>

              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 15px 0;">
                This exam is an important assessment—please treat it with full seriousness and responsibility.
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                We recommend checking your device, internet connection, and login credentials in advance to avoid disruptions.
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                Wishing you success in your examination.
              </p>

              <p style="font-size: 15px; color: #333; line-height: 1.6; margin: 0;">
                Regards,<br/>
                <strong>Leela Ram Samavedam</strong><br/>
                Exam Coordinator<br/>
                RKB Teja Coaching Center<br/>
                Support Contact: 9640140444
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    } else if (type === 'exam_reminder') {
      subject = `⏰ Reminder: ${exam.exam_name} is starting soon`;
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Exam Reminder</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
                Dear <strong>${registration.full_name}</strong>,
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                This is a reminder that your <strong>${exam.exam_name}</strong> is scheduled <strong>today at ${exam.exam_time}</strong>.
              </p>
              
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 15px 0;">
                Please log in <strong>10–15 minutes early</strong> to avoid any last-minute issues.<br/>
                Late entry may not be allowed.
              </p>

              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                Be prepared and follow all exam guidelines.
              </p>

              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                All the best!
              </p>

              <p style="font-size: 15px; color: #333; line-height: 1.6; margin: 0;">
                Regards,<br/>
                <strong>RKB Teja Coaching Center</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    } else {
      throw new Error('Invalid email type');
    }

    console.log('[EMAIL] Sending email via SMTP...');
    
    // Send email using SMTP only
    const emailResult = await sendSmtpEmail(registration.email, subject, htmlBody);

    console.log('=== SEND NOTIFICATION EMAIL RESULT ===');
    console.log('[EMAIL] Success:', emailResult.success);
    console.log('[EMAIL] Method:', emailResult.method);
    console.log('[EMAIL] Message ID:', emailResult.message_id || 'N/A');
    console.log('[EMAIL] Error:', emailResult.error || 'None');

    // Update email sent flag ONLY if successful on the primary database
    if (emailResult.success) {
      const updateField = type === 'payment_success' ? 'email_sent_payment' : 'email_sent_approval';
      await updateEmailSentFlag(primaryClient, registration_id, updateField);
    }

    return new Response(
      JSON.stringify({ 
        success: emailResult.success,
        email_sent: emailResult.success,
        email_method: emailResult.method,
        message_id: emailResult.message_id,
        recipient: registration.email,
        error: emailResult.error
      }),
      { 
        status: emailResult.success ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('=== FATAL EDGE FUNCTION ERROR ===');
    console.error(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error?.message || 'Internal Server Error',
        details: 'Fatal exception in edge function'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
