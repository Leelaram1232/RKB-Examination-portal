import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoginRequest {
  email: string;
  password: string; // DOB in DDMMYY format
  exam_id: string;
}

// Generate DOB-based password (DDMMYY format), without timezone day shifts.
function generateDobPassword(dob: string): string {
  const raw = String(dob || '').trim();
  if (/^\d{6}$/.test(raw)) return raw;

  const mIso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (mIso) {
    const year4 = mIso[1];
    const month2 = mIso[2];
    const day2 = mIso[3];
    return `${day2}${month2}${year4.slice(-2)}`;
  }

  const mDmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (mDmy) {
    const day2 = mDmy[1];
    const month2 = mDmy[2];
    const year4 = mDmy[3];
    return `${day2}${month2}${year4.slice(-2)}`;
  }

  const date = new Date(raw);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

Deno.serve(async (req) => {
  console.log(`=== RESULT LOGIN: ${req.method} ${req.url} ===`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create clients
    const internalSupabase = createClient(internalUrl, internalKey);
    let externalSupabase = null;
    if (externalUrl && externalKey) {
      externalSupabase = createClient(externalUrl, externalKey);
    }

    // Determine primary client (where registrations vive)
    const primaryClient = externalSupabase || internalSupabase;
    console.log('[result-login] Using Database:', externalSupabase ? 'EXTERNAL' : 'INTERNAL');

    const rawBody = await req.text();
    if (!rawBody) throw new Error('Empty request body');
    const data: LoginRequest = JSON.parse(rawBody);
    
    console.log('[result-login] Request for exam:', data.exam_id, 'Email:', data.email);

    if (!data.email || !data.password || !data.exam_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize password (allow users to type DD-MM-YY etc)
    const enteredDigits = String(data.password || '').replace(/\D/g, '');
    // Validate password format (should be 6 digits)
    if (enteredDigits.length !== 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid password format. Use DDMMYY (e.g., 150100)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if exam exists and results are published
    const { data: exam, error: examError } = await primaryClient
      .from('exams')
      .select('id, exam_name, exam_code, exam_date, total_marks, passing_marks, results_published')
      .eq('id', data.exam_id)
      .single();

    if (examError || !exam) {
      console.error('Exam not found:', examError);
      return new Response(
        JSON.stringify({ success: false, error: 'Exam not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!exam.results_published) {
      return new Response(
        JSON.stringify({ success: false, error: 'Results have not been published yet' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find student by email
    const { data: profile, error: profileError } = await primaryClient
      .from('profiles')
      .select('id, full_name, email, date_of_birth')
      .eq('email', data.email.toLowerCase())
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'No account found with this email' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify DOB matches
    if (!profile.date_of_birth) {
      return new Response(
        JSON.stringify({ success: false, error: 'Date of birth not set for this account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert DOB to DDMMYY format
    const expectedPassword = generateDobPassword(profile.date_of_birth);

    if (enteredDigits !== expectedPassword) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid password. Please use your DOB (DDMMYY).' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get registration for this student and exam (include photo and signature)
    const { data: registration, error: regError } = await primaryClient
      .from('registrations')
      .select('id, registration_number, photo_url, signature_url')
      .eq('student_id', profile.id)
      .eq('exam_id', data.exam_id)
      .single();

    if (regError || !registration) {
      console.error('Registration not found:', regError);
      return new Response(
        JSON.stringify({ success: false, error: 'You did not register for this exam' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get result for this student and exam
    const { data: result, error: resultError } = await primaryClient
      .from('results')
      .select('id, obtained_marks, correct_count, wrong_count, unanswered_count, is_pass, section_wise_scores, calculated_at, rank')
      .eq('student_id', profile.id)
      .eq('exam_id', data.exam_id)
      .single();

    if (resultError || !result) {
      console.error('Result not found:', resultError);
      return new Response(
        JSON.stringify({ success: false, error: 'No result found. You may not have attempted this exam.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Result login successful for:', profile.email);

    return new Response(
      JSON.stringify({
        success: true,
        student: {
          full_name: profile.full_name,
          email: profile.email,
          date_of_birth: profile.date_of_birth,
          registration_number: registration.registration_number,
          photo_url: registration.photo_url || null,
          signature_url: registration.signature_url || null,
        },
        exam: {
          exam_name: exam.exam_name,
          exam_code: exam.exam_code,
          exam_date: exam.exam_date,
          total_marks: exam.total_marks,
          passing_marks: exam.passing_marks,
        },
        result: {
          obtained_marks: result.obtained_marks,
          correct_count: result.correct_count,
          wrong_count: result.wrong_count,
          unanswered_count: result.unanswered_count,
          is_pass: result.is_pass,
          section_wise_scores: result.section_wise_scores,
          calculated_at: result.calculated_at,
          rank: result.rank,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
