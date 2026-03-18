import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExamLoginData {
  exam_id: string;
  email: string;
  password: string; // DOB-based password (DDMMYY)
}

interface RegistrationData {
  id: string;
  registration_number: string | null;
  approval_status: string;
  exam_login_enabled: boolean;
  student_name: string;
  date_of_birth: string;
}

// Generate DOB-based password (DDMMYY format)
function generateDobPassword(dob: string): string {
  const date = new Date(dob);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

// Find registration using profiles + registrations tables
async function findRegistration(
  supabase: any,
  examId: string,
  email: string
): Promise<RegistrationData | null> {
  // Find profile by email
  console.log('[exam-login] Looking up profile by email:', email);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, date_of_birth')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (profileError || !profile) {
    console.log('[exam-login] Profile not found or error:', profileError?.message || 'Not found');
    return null;
  }

  console.log('[exam-login] Profile found ID:', profile.id);

  // Find registration for this profile + exam
  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, registration_number, approval_status, exam_login_enabled')
    .eq('student_id', profile.id)
    .eq('exam_id', examId)
    .maybeSingle();

  if (regError || !registration) {
    console.log('[exam-login] Registration not found or error:', regError?.message || 'Not found');
    return null;
  }

  console.log('[exam-login] Registration found:', registration.id, 'Status:', registration.approval_status);
  return {
    id: registration.id,
    registration_number: registration.registration_number,
    approval_status: registration.approval_status,
    exam_login_enabled: registration.exam_login_enabled ?? false,
    student_name: profile.full_name,
    date_of_birth: profile.date_of_birth,
  };
}

Deno.serve(async (req) => {
  console.log(`=== EXAM LOGIN: ${req.method} ${req.url} ===`);
  
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

    // Determine primary client (where registrations live)
    const primaryClient = externalSupabase || internalSupabase;
    console.log('[exam-login] Using Database:', externalSupabase ? 'EXTERNAL' : 'INTERNAL');

    const rawBody = await req.text();
    if (!rawBody) throw new Error('Empty request body');
    const data: ExamLoginData = JSON.parse(rawBody);
    
    console.log('[exam-login] Login attempt:', { 
      exam_id: data.exam_id, 
      email: data.email,
      has_password: !!data.password 
    });

    if (!data.exam_id || !data.email || !data.password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please fill in all required fields.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find registration in primary database
    const registration = await findRegistration(primaryClient, data.exam_id, data.email);

    if (!registration) {
      console.log('[exam-login] FAIL: Registration not found for', data.email);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email or registration. Please check your credentials.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify DOB-based password
    if (!registration.date_of_birth) {
      return new Response(
        JSON.stringify({ success: false, error: 'Your date of birth is not set in the system. Please contact administration.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expectedPassword = generateDobPassword(registration.date_of_birth);
    // Strict DDMMYY check – but ignore non-digit characters to avoid user typos like "25-08-05"
    const enteredRaw = data.password || '';
    const enteredDigits = enteredRaw.replace(/\D/g, '');

    if (enteredDigits !== expectedPassword) {
      console.log('[exam-login] Password mismatch', {
        entered: enteredRaw,
        normalized: enteredDigits,
        expected: expectedPassword,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email or password. Please use your DOB (DDMMYY).' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check approval status
    if (registration.approval_status !== 'approved') {
      return new Response(
        JSON.stringify({ success: false, error: 'Your registration is pending approval. Please wait for confirmation.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if exam login is enabled
    if (!registration.exam_login_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exam login is not enabled for your registration. Please contact administration.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch exam details from external DB (or primary if not split)
    const examClient = externalSupabase || primaryClient;
    const { data: exam, error: examError } = await examClient
      .from('exams')
      .select(`
        id,
        exam_name,
        exam_date,
        exam_time,
        duration_minutes,
        status,
        instructions,
        total_marks,
        negative_marking,
        negative_mark_value,
        proctoring_enabled,
        max_violations,
        auto_submit_on_violations,
        voice_monitoring_enabled,
        screen_recording_enabled,
        liberty_level
      `)
      .eq('id', data.exam_id)
      .single();

    if (examError || !exam) {
      console.error('[exam-login] Exam not found:', examError);
      return new Response(
        JSON.stringify({ success: false, error: 'Exam not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if exam status allows taking
    if (exam.status === 'draft' || exam.status === 'results_published') {
      return new Response(
        JSON.stringify({ success: false, error: 'This exam is not currently available for taking.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate exam is within time window (IST timezone)
    const [year, month, day] = exam.exam_date.split('-').map(Number);
    const [hours, minutes] = exam.exam_time.split(':').map(Number);
    
    // Create exam start time in UTC (subtract 5:30 from IST to get UTC)
    const examStartUTC = new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30, 0, 0));
    const examEndUTC = new Date(examStartUTC.getTime() + exam.duration_minutes * 60000);
    const now = new Date();

    console.log('[exam-login] Exam start (UTC):', examStartUTC.toISOString());
    console.log('[exam-login] Exam end (UTC):', examEndUTC.toISOString());
    console.log('[exam-login] Current time (UTC):', now.toISOString());

    if (now < examStartUTC || now > examEndUTC) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exam is not available at this time. Please check the exam schedule.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing session (Primary DB)
    const { data: existingSession } = await primaryClient
      .from('exam_sessions')
      .select('id, start_time, is_completed, is_blocked, exam_status')
      .eq('registration_id', registration.id)
      .maybeSingle();

    // Fetch questions from External DB (or primary if not split)
    const questionsClient = externalSupabase || primaryClient;
    const { data: questions, error: questionsError } = await questionsClient
      .from('questions')
      .select('id, question_number, question_text, option_a, option_b, option_c, option_d, section_name, marks, image_url, subject_id, question_type, correct_answer, subjects(id, name, code)')
      .eq('exam_id', data.exam_id)
      .order('subject_id', { nullsFirst: false })
      .order('question_number');

    if (questionsError) {
      console.error('[exam-login] Error fetching questions:', questionsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to load exam questions. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No questions are available for this exam. Please contact administration.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch option images from external DB
    const questionIds = questions.map((q: any) => q.id);
    const { data: optionImages } = await questionsClient
      .from('question_images')
      .select('question_id, option_key, image_url')
      .in('question_id', questionIds)
      .not('option_key', 'is', null);

    // Group option images by question_id
    const optionImagesByQuestion: Record<string, Record<string, string>> = {};
    if (optionImages) {
      for (const img of optionImages) {
        if (!optionImagesByQuestion[img.question_id]) {
          optionImagesByQuestion[img.question_id] = {};
        }
        optionImagesByQuestion[img.question_id][img.option_key!.toUpperCase()] = img.image_url;
      }
    }

    // Transform questions
    const transformedQuestions = questions.map((q: any) => {
      const optionImgs = optionImagesByQuestion[q.id] || {};
      return {
        id: q.id,
        question_number: q.question_number,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        section_name: q.subjects?.name || q.section_name,
        subject_name: q.subjects?.name || null,
        subject_id: q.subject_id,
        marks: q.marks,
        question_type: q.question_type || 'MCQ',
        image_url: q.image_url || null,
        option_a_image: optionImgs['A'] || null,
        option_b_image: optionImgs['B'] || null,
        option_c_image: optionImgs['C'] || null,
        option_d_image: optionImgs['D'] || null,
      };
    });

    // If image URLs are not publicly accessible (common for protected buckets),
    // create signed URLs on-demand so ExamInterface can render images.
    const IMAGE_BUCKET = 'question-uploads';
    const SIGN_EXPIRES_IN_SECONDS = 60 * 60 * 6; // 6 hours

    const extractObjectPath = (imageUrl: string | null | undefined): string | null => {
      if (!imageUrl) return null;
      const cleaned = String(imageUrl).split('?')[0];
      const re = new RegExp(`/storage/v1/object/(?:public|authenticated)/${IMAGE_BUCKET}/(.+)$`);
      const m = cleaned.match(re);
      if (m?.[1]) return m[1];

      // Fallback: last occurrence of `${bucket}/...`
      const idx = cleaned.lastIndexOf(`${IMAGE_BUCKET}/`);
      if (idx >= 0) return cleaned.slice(idx + IMAGE_BUCKET.length + 1);

      return null;
    };

    const allImageUrls: Array<string | null> = [];
    for (const q of transformedQuestions) {
      allImageUrls.push(q.image_url);
      allImageUrls.push(q.option_a_image);
      allImageUrls.push(q.option_b_image);
      allImageUrls.push(q.option_c_image);
      allImageUrls.push(q.option_d_image);
    }

    const uniquePaths = new Set<string>();
    for (const url of allImageUrls) {
      const path = extractObjectPath(url);
      if (path) uniquePaths.add(path);
    }

    const signedByPath: Record<string, string> = {};
    if (uniquePaths.size > 0) {
      const paths = Array.from(uniquePaths);
      const signedPairs = await Promise.all(
        paths.map(async (path) => {
          const { data, error } = await questionsClient.storage
            .from(IMAGE_BUCKET)
            .createSignedUrl(path, SIGN_EXPIRES_IN_SECONDS);
          if (error || !data?.signedUrl) return [path, null] as const;
          return [path, data.signedUrl] as const;
        })
      );

      for (const pair of signedPairs) {
        const [path, signedUrl] = pair;
        if (signedUrl) signedByPath[path] = signedUrl;
      }
    }

    const signUrlOrKeep = (url: string | null | undefined) => {
      const path = extractObjectPath(url);
      if (!path) return url ?? null;
      return signedByPath[path] ?? (url ?? null);
    };

    for (const q of transformedQuestions) {
      q.image_url = signUrlOrKeep(q.image_url);
      q.option_a_image = signUrlOrKeep(q.option_a_image);
      q.option_b_image = signUrlOrKeep(q.option_b_image);
      q.option_c_image = signUrlOrKeep(q.option_c_image);
      q.option_d_image = signUrlOrKeep(q.option_d_image);
    }

    if (existingSession) {
      // Check if exam was finally submitted
      if (existingSession.exam_status === 'finally_submitted' || (existingSession.is_completed && existingSession.exam_status !== 'resumed')) {
        return new Response(
          JSON.stringify({ success: false, error: 'You have already completed this exam.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if blocked (without admin resume)
      if (existingSession.is_blocked && existingSession.exam_status !== 'resumed') {
        return new Response(
          JSON.stringify({ success: false, error: 'Your exam session is blocked due to violations. Please contact administration.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[exam-login] Resuming existing session:', existingSession.id, 'status:', existingSession.exam_status);
      
      // Calculate remaining minutes
      const sessionStartTime = new Date(existingSession.start_time);
      const originalEndTime = new Date(sessionStartTime.getTime() + exam.duration_minutes * 60000);
      
      let remainingMinutes = Math.max(0, Math.floor((originalEndTime.getTime() - now.getTime()) / 60000));
      
      if (remainingMinutes <= 0 || existingSession.exam_status === 'resumed') {
        remainingMinutes = exam.duration_minutes;
        console.log('[exam-login] Granting full duration for resumed session:', remainingMinutes, 'minutes');
      }
      
      // Update session status to in_progress if resuming
      if (existingSession.exam_status === 'resumed') {
        await primaryClient
          .from('exam_sessions')
          .update({ 
            exam_status: 'in_progress',
            start_time: new Date().toISOString()
          })
          .eq('id', existingSession.id);
      }
      
      // Fetch existing answers (Primary DB)
      const { data: existingAnswers } = await primaryClient
        .from('student_answers')
        .select('question_id, selected_option, text_answer, is_marked_for_review')
        .eq('session_id', existingSession.id);

      return new Response(
        JSON.stringify({
          success: true,
          session_id: existingSession.id,
          is_resume: true,
          start_time: new Date().toISOString(),
          remaining_minutes: remainingMinutes,
          registration_id: registration.id,
          registration_number: registration.registration_number,
          student_name: registration.student_name,
          questions: transformedQuestions,
          existing_answers: existingAnswers || [],
          exam: {
            id: exam.id,
            exam_name: exam.exam_name,
            duration_minutes: exam.duration_minutes,
            instructions: exam.instructions,
            total_marks: exam.total_marks,
            negative_marking: exam.negative_marking,
            negative_mark_value: exam.negative_mark_value,
            proctoring_enabled: exam.proctoring_enabled,
            max_violations: exam.max_violations,
            auto_submit_on_violations: exam.auto_submit_on_violations,
            voice_monitoring_enabled: exam.voice_monitoring_enabled,
            screen_recording_enabled: exam.screen_recording_enabled,
            liberty_level: exam.liberty_level,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client info
    const userAgent = req.headers.get('user-agent') || '';
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';

    // Create new session (Primary DB)
    const { data: newSession, error: sessionError } = await primaryClient
      .from('exam_sessions')
      .insert({
        registration_id: registration.id,
        start_time: new Date().toISOString(),
        user_agent: userAgent,
        ip_address: ip,
        exam_status: 'in_progress',
      })
      .select('id, start_time')
      .single();

    if (sessionError) {
      console.error('[exam-login] Error creating session:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to start exam session. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[exam-login] New session created:', newSession.id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id: newSession.id,
        is_resume: false,
        start_time: newSession.start_time,
        registration_id: registration.id,
        registration_number: registration.registration_number,
        student_name: registration.student_name,
        questions: transformedQuestions,
        existing_answers: [],
        exam: {
          id: exam.id,
          exam_name: exam.exam_name,
          duration_minutes: exam.duration_minutes,
          instructions: exam.instructions,
          total_marks: exam.total_marks,
          negative_marking: exam.negative_marking,
          negative_mark_value: exam.negative_mark_value,
          proctoring_enabled: exam.proctoring_enabled,
          max_violations: exam.max_violations,
          auto_submit_on_violations: exam.auto_submit_on_violations,
          voice_monitoring_enabled: exam.voice_monitoring_enabled,
          screen_recording_enabled: exam.screen_recording_enabled,
          liberty_level: exam.liberty_level,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[exam-login] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred. Please try again or contact administration.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
