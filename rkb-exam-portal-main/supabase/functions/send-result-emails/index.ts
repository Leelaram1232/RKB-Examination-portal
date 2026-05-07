import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface RequestBody {
  exam_id: string;
  student_id?: string;
  pdf_attachment?: string; // base64 string
  pdf_filename?: string;
}

async function sendSmtpEmail(to: string, subject: string, htmlBody: string, attachment?: { content: string, filename: string }) {
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
    throw new Error('SMTP credentials not configured');
  }

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

  try {
    const sendOptions: any = {
      from: smtpFrom!,
      to: to,
      subject: subject,
      html: htmlBody,
    };

    if (attachment) {
      sendOptions.attachments = [
        {
          filename: attachment.filename,
          content: attachment.content,
          encoding: 'base64',
        },
      ];
    }

    await client.send(sendOptions);
    await client.close();
    return true;
  } catch (error) {
    console.error(`[SMTP] Error sending to ${to}:`, error);
    try { await client.close(); } catch { /* ignore */ }
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exam_id, student_id, pdf_attachment, pdf_filename } = await req.json() as RequestBody;

    if (!exam_id) {
      throw new Error('Missing exam_id');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalSupabase = createClient(supabaseUrl, supabaseKey);

    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    const supabase = (externalUrl && externalKey) 
      ? createClient(externalUrl, externalKey) 
      : internalSupabase;

    // 1. Fetch Exam Details
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('exam_name, exam_code, total_marks')
      .eq('id', exam_id)
      .single();

    if (examError || !exam) {
      throw new Error('Exam not found');
    }

    // 2. Fetch registered student(s)
    let query = supabase
      .from('registrations')
      .select('student_id, registration_number')
      .eq('exam_id', exam_id);
    
    if (student_id) {
      query = query.eq('student_id', student_id);
    }

    const { data: registrations, error: regError } = await query;

    if (regError || !registrations || registrations.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No students found for the given criteria' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const studentIds = registrations.map(r => r.student_id);

    // Fetch profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);

    if (profileError || !profiles) {
      throw new Error('Failed to fetch student profiles');
    }

    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // 2.5 Fetch results
    let resultsQuery = supabase
      .from('results')
      .select('student_id, obtained_marks, rank, is_pass')
      .eq('exam_id', exam_id);
    
    if (student_id) {
      resultsQuery = resultsQuery.eq('student_id', student_id);
    }

    const { data: results, error: resultsError } = await resultsQuery;

    const resultMap = new Map(results?.map(r => [r.student_id, r]) || []);
    
    let sentCount = 0;
    let failCount = 0;

    const institutionName = "RKB Teja Coaching Center";
    const supportContact = "9640140444";

    // 3. Send emails
    for (const reg of registrations) {
      const profile = profileMap.get(reg.student_id);
      if (!profile || !profile.email) continue;

      const studentResult = resultMap.get(reg.student_id);

      const subject = `Results Published: ${exam.exam_name}`;
      const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px}.header{background:#f8f9fa;padding:20px;text-align:center;border-bottom:3px solid #1a73e8;border-radius:8px 8px 0 0}.content{padding:20px}.footer{font-size:12px;color:#777;margin-top:20px;border-top:1px solid #eee;padding-top:10px}.details-box{background:#f1f8ff;padding:20px;border-radius:8px;margin:20px 0;border:1px solid #cce5ff}.result-value{font-weight:bold;color:#1a73e8}.rank-value{font-weight:bold;color:#e67e22;font-size:18px}.status-pass{color:#28a745;font-weight:bold}.status-fail{color:#dc3545;font-weight:bold}</style></head><body><div class="container"><div class="header"><h2 style="margin:0;color:#1a73e8">Results Published</h2></div><div class="content"><p>Dear <strong>${profile.full_name}</strong>,</p><p>The results for <strong>${exam.exam_name}</strong> have been successfully <strong>published</strong>. You can now view your detailed performance report.</p><div class="details-box"><h3 style="margin-top:0;font-size:16px;color:#1a73e8;border-bottom:1px solid #cce5ff;padding-bottom:8px">Result Summary:</h3><table style="width:100%;border-collapse:collapse;margin-top:10px"><tr><td style="padding:8px 0;color:#555;width:40%">Student Name:</td><td style="padding:8px 0;font-weight:bold">${profile.full_name}</td></tr><tr><td style="padding:8px 0;color:#555">Registration No:</td><td style="padding:8px 0;font-weight:bold">${reg.registration_number || 'N/A'}</td></tr><tr><td style="padding:8px 0;color:#555">Marks Obtained:</td><td style="padding:8px 0;font-weight:bold;font-size:18px;color:#28a745">${studentResult?.obtained_marks ?? 'N/A'} / ${exam.total_marks || 'N/A'}</td></tr><tr><td style="padding:8px 0;color:#555">Rank Achieved:</td><td style="padding:8px 0"><span class="rank-value">${studentResult?.rank ? '#' + studentResult.rank : 'N/A'}</span></td></tr><tr><td style="padding:8px 0;color:#555">Result Status:</td><td style="padding:8px 0">${studentResult ? (studentResult.is_pass ? '<span class="status-pass">PASSED</span>' : '<span class="status-fail">FAILED</span>') : 'N/A'}</td></tr></table></div><p>${pdf_attachment ? 'Please find your detailed scorecard attached to this email.' : 'You can now log in to the portal to download your complete marksheet and view section-wise analysis.'}</p><p>Congratulations on your performance and wishing you continued success in your future endeavors.</p><p>Regards,<br/><strong>${institutionName}</strong><br/>Support Contact: ${supportContact}</p></div><div class="footer"><p>This is an automated message from RKB Education Management System. Please do not reply to this email.</p></div></div></body></html>`.trim();

      const attachment = (pdf_attachment && student_id === reg.student_id) ? {
        content: pdf_attachment,
        filename: pdf_filename || `${exam.exam_code}_Scorecard.pdf`
      } : undefined;

      const success = await sendSmtpEmail(profile.email, subject, htmlBody, attachment);
      if (success) sentCount++;
      else failCount++;
      
      // Small delay to avoid overwhelming SMTP server
      await new Promise(r => setTimeout(r, 100));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Emails processed: ${sentCount} sent, ${failCount} failed`,
      sent_count: sentCount,
      fail_count: failCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[ERROR]', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

