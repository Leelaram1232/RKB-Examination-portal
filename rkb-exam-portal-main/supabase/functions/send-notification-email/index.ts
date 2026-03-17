import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EmailRequest {
  type: 'payment_success' | 'registration_approved';
  registration_id: string;
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
  
  const smtpHost = Deno.env.get('SMTP_HOST');
  const smtpPort = Deno.env.get('SMTP_PORT') || '587';
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  const smtpFromRaw = Deno.env.get('SMTP_FROM_EMAIL') || smtpUser;
  
  // Format from address properly for denomailer
  const smtpFrom = smtpFromRaw?.includes('<') 
    ? smtpFromRaw 
    : `RKB Exam Portal <${smtpFromRaw}>`;

  console.log('[SMTP] Configuration check:');
  console.log('  - Host:', smtpHost);
  console.log('  - Port:', smtpPort);
  console.log('  - User:', smtpUser ? `${smtpUser.substring(0, 5)}...` : 'NOT SET');
  console.log('  - Password:', smtpPassword ? 'SET (hidden)' : 'NOT SET');
  console.log('  - From:', smtpFrom);
  console.log('  - To:', to);

  if (!smtpHost || !smtpUser || !smtpPassword) {
    console.error('[SMTP] ERROR: Missing required SMTP credentials');
    return {
      success: false,
      method: 'smtp',
      error: 'SMTP credentials not configured. Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD'
    };
  }

  try {
    console.log('[SMTP] Creating SMTP client...');
    
    const client = new SMTPClient({
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

    await client.close();

    console.log('[SMTP] Email sent successfully!');

    return {
      success: true,
      method: 'smtp',
      message_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

  } catch (error: any) {
    console.error('[SMTP] ERROR during email send:');
    console.error('[SMTP] Error name:', error.name);
    console.error('[SMTP] Error message:', error.message);
    console.error('[SMTP] Full error:', JSON.stringify(error, null, 2));

    let errorMessage = error.message;
    if (error.message?.includes('authentication')) {
      errorMessage = 'SMTP Authentication failed - check username and password';
    } else if (error.message?.includes('connection')) {
      errorMessage = `SMTP Connection failed to ${smtpHost}:${smtpPort}`;
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
  console.log('=== SEND NOTIFICATION EMAIL (SMTP ONLY) ===');
  console.log('[EMAIL] Timestamp:', new Date().toISOString());
  console.log('[EMAIL] Method: STRICT SMTP - No fallback providers');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, registration_id }: EmailRequest = await req.json();

    console.log('[EMAIL] Request type:', type);
    console.log('[EMAIL] Registration ID:', registration_id);

    if (!type || !registration_id) {
      throw new Error('Missing type or registration_id');
    }

    // Lovable Cloud Supabase client (where registrations + profiles live)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // External Supabase client for exams table
    const externalSupabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch registration data from registrations + profiles
    const registration = await fetchRegistrationData(supabase, registration_id);

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

    if (type === 'registration_approved' && registration.email_sent_approval) {
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

    // Fetch exam details from external DB
    let exam: { exam_name: string; exam_date: string; exam_time: string } | null = null;
    
    if (registration.exam_id) {
      const { data: examData, error: examError } = await externalSupabase
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
              
              <p style="font-size: 14px; color: #666; line-height: 1.6; margin: 0;">
                📧 You will receive another email with your exam login credentials once your registration is approved by the administrator.
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
              <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Registration Approved!</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
                Dear <strong>${registration.full_name}</strong>,
              </p>
              <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
                Congratulations! Your registration for the examination has been <strong style="color: #4CAF50;">approved</strong>. Please find your exam details and login credentials below.
              </p>
              
              <!-- Exam Details Box -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td>
                    <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px; border-bottom: 2px solid #2196F3; padding-bottom: 8px;">📋 Exam Details</h3>
                    <table width="100%" cellpadding="5" cellspacing="0">
                      <tr><td style="color: #666; width: 40%;">Exam Name:</td><td style="color: #333; font-weight: 500;">${exam.exam_name}</td></tr>
                      <tr><td style="color: #666;">Registration No:</td><td style="color: #333; font-weight: 600; font-family: monospace; font-size: 15px;">${registration.registration_number}</td></tr>
                      <tr><td style="color: #666;">Exam Date:</td><td style="color: #333; font-weight: 500;">${examDateFormatted}</td></tr>
                      <tr><td style="color: #666;">Exam Time:</td><td style="color: #333; font-weight: 500;">${exam.exam_time}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Credentials Box -->
              <table width="100%" cellpadding="20" cellspacing="0" style="background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%); border-radius: 8px; margin-bottom: 25px; border: 2px dashed #2196F3;">
                <tr>
                  <td align="center">
                    <h3 style="margin: 0 0 15px 0; color: #1565C0; font-size: 18px;">🔐 Your Login Credentials</h3>
                    <table cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="color: #555; text-align: right; padding-right: 10px;">Registration No:</td>
                        <td style="background: #fff; padding: 8px 15px; border-radius: 4px; font-family: monospace; font-weight: 700; font-size: 16px; color: #333;">${registration.registration_number}</td>
                      </tr>
                      <tr>
                        <td style="color: #555; text-align: right; padding-right: 10px;">Password:</td>
                        <td style="background: #fff; padding: 8px 15px; border-radius: 4px; font-family: monospace; font-weight: 700; font-size: 16px; color: #333;">${registration.exam_password || 'Contact Admin'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Instructions -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #FFF3E0; border-radius: 8px; border-left: 4px solid #FF9800;">
                <tr>
                  <td>
                    <h4 style="margin: 0 0 10px 0; color: #E65100;">⚠️ Important Instructions</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8;">
                      <li>Keep your credentials <strong>confidential</strong></li>
                      <li>Login <strong>15 minutes before</strong> the exam starts</li>
                      <li>Ensure stable <strong>internet connection</strong></li>
                      <li>Use a <strong>laptop/desktop with webcam</strong></li>
                      <li>Sit in a <strong>well-lit, quiet room</strong></li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 5px 0; font-size: 13px; color: #666;">For any queries, please contact the examination authority.</p>
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

    // Update email sent flag ONLY if successful
    if (emailResult.success) {
      const updateField = type === 'payment_success' ? 'email_sent_payment' : 'email_sent_approval';
      await updateEmailSentFlag(supabase, registration_id, updateField);
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
        status: emailResult.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('=== SEND NOTIFICATION EMAIL ERROR ===');
    console.error('[EMAIL] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, method: 'smtp' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
