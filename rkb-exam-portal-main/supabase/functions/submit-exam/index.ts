import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubmitExamData {
  session_id: string;
  is_auto_submit?: boolean;
}

// Valid exam statuses for submission
const SUBMITTABLE_STATUSES = ['in_progress', 'resumed'];

Deno.serve(async (req) => {
  console.log(`=== SUBMIT EXAM: ${req.method} ${req.url} ===`);

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
    console.log('[submit-exam] Using Database:', externalSupabase ? 'EXTERNAL' : 'INTERNAL');

    const data: SubmitExamData = await req.json();
    console.log('[submit-exam] Parsed Data:', { 
      session_id: data?.session_id, 
      is_auto: data?.is_auto_submit 
    });

    if (!data?.session_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing session_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get session with registration and exam details - now including exam_status
    const { data: session, error: sessionError } = await primaryClient
      .from('exam_sessions')
      .select(`
        id,
        registration_id,
        is_completed,
        is_auto_submitted,
        is_blocked,
        exam_status,
        start_time,
        registrations (
          id,
          student_id,
          exam_id,
          exams (
            id,
            total_marks,
            passing_marks,
            negative_marking,
            negative_mark_value,
            marks_per_question,
            marks_per_wrong
          )
        )
      `)
      .eq('id', data.session_id)
      .single();

    if (sessionError || !session) {
      console.error('Session not found:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Your exam session has expired. Please contact administration.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW: Check exam_status instead of just is_completed
    const currentStatus = session.exam_status || 'in_progress';
    console.log('[submit-exam] Current session status:', currentStatus);
    
    // If already finally_submitted, reject
    if (currentStatus === 'finally_submitted') {
      return new Response(
        JSON.stringify({ success: false, error: 'You have already submitted this exam. No further changes are allowed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If blocked (not resumed), reject
    if (currentStatus === 'blocked') {
      return new Response(
        JSON.stringify({ success: false, error: 'Your exam session is blocked due to violations. Please contact administration.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow submission for: in_progress, resumed, and auto_submitted (if admin allowed resume)
    if (!SUBMITTABLE_STATUSES.includes(currentStatus) && currentStatus !== 'auto_submitted') {
      // Check if is_completed is true (old logic fallback)
      if (session.is_completed) {
        return new Response(
          JSON.stringify({ success: false, error: 'You have already submitted this exam.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const registration = session.registrations as any;
    const exam = registration.exams;
    const defaultMarksPerQuestion = exam.marks_per_question || 4;
    const negativeMarksValue = exam.marks_per_wrong || exam.negative_mark_value || 1;

    console.log('Exam evaluation settings:', {
      examId: exam.id,
      totalMarks: exam.total_marks,
      passingMarks: exam.passing_marks,
      defaultMarksPerQuestion,
      negativeMarking: exam.negative_marking,
      negativeMarksValue,
      currentStatus
    });

    // Check if result already exists
    const { data: existingResult } = await primaryClient
      .from('results')
      .select('id')
      .eq('session_id', data.session_id)
      .single();

    // For resumed sessions, delete old result before creating new one
    if (existingResult && currentStatus === 'resumed') {
      console.log('Deleting old result for resumed session:', existingResult.id);
      await primaryClient.from('results').delete().eq('id', existingResult.id);
    } else if (existingResult && currentStatus !== 'resumed') {
      // If result exists and not resumed, this is already evaluated
      return new Response(
        JSON.stringify({ success: false, error: 'Your exam has already been evaluated.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all questions for this exam with section_name for section-wise scoring
    const questionsClient = externalSupabase || primaryClient;
    const { data: questions, error: questionsError } = await questionsClient
      .from('questions')
      .select('id, correct_option, correct_answer, marks, section_name, question_type')
      .eq('exam_id', exam.id);

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to load exam questions. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Total questions for exam:', questions?.length || 0);

    // Get student answers
    const { data: answers, error: answersError } = await primaryClient
      .from('student_answers')
      .select('question_id, selected_option, text_answer')
      .eq('session_id', data.session_id);

    if (answersError) {
      console.error('Error fetching answers:', answersError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to retrieve your answers. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Total student answers:', answers?.length || 0);

    // Create answer map - stores both option and text answer
    const answerMap = new Map();
    answers?.forEach(a => {
      answerMap.set(a.question_id, {
        option: a.selected_option,
        text: a.text_answer
      });
    });

    // Calculate results with section-wise breakdown
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let obtainedMarks = 0;

    const sectionScores: Record<string, { 
      correct: number; 
      wrong: number; 
      unanswered: number; 
      marks: number; 
      total_marks: number;
      total_questions: number;
    }> = {};

    for (const question of questions || []) {
      const section = question.section_name || 'General';
      const studentAnsData = answerMap.get(question.id);
      const questionMarks = question.marks || defaultMarksPerQuestion;
      const type = question.question_type || 'MCQ';
      
      // Initialize section if not exists
      if (!sectionScores[section]) {
        sectionScores[section] = { 
          correct: 0, 
          wrong: 0, 
          unanswered: 0, 
          marks: 0, 
          total_marks: 0,
          total_questions: 0
        };
      }
      
      sectionScores[section].total_marks += questionMarks;
      sectionScores[section].total_questions += 1;

      // Logic for determining correctness
      let isCorrect = false;
      let hasResponded = false;

      if (type === 'NUMERICAL') {
        const studentText = studentAnsData?.text?.toString().trim().toLowerCase();
        // Use correct_answer if available, otherwise fallback to correct_option
        const correctText = (question.correct_answer || question.correct_option)?.toString().trim().toLowerCase();
        hasResponded = !!studentText;
        isCorrect = hasResponded && studentText === correctText;
      } else {
        // MCQ / Standard
        hasResponded = !!studentAnsData?.option;
        isCorrect = hasResponded && studentAnsData?.option === question.correct_option;
      }

      // Log individual question evaluation
      console.log(`Q[${question.id.substring(0, 8)}] type=${type} correct=${question.correct_option} student=${type === 'NUMERICAL' ? studentAnsData?.text : studentAnsData?.option} isCorrect=${isCorrect}`);
      
      if (!hasResponded) {
        unansweredCount++;
        sectionScores[section].unanswered += 1;
      } else if (isCorrect) {
        correctCount++;
        obtainedMarks += questionMarks;
        sectionScores[section].correct += 1;
        sectionScores[section].marks += questionMarks;
      } else {
        wrongCount++;
        sectionScores[section].wrong += 1;
        if (exam.negative_marking) {
          const deduction = negativeMarksValue;
          obtainedMarks -= deduction;
          sectionScores[section].marks -= deduction;
        }
      }
    }

    // Ensure marks are not negative
    for (const section in sectionScores) {
      sectionScores[section].marks = Math.max(0, sectionScores[section].marks);
    }

    // Ensure obtained marks is not negative
    obtainedMarks = Math.max(0, obtainedMarks);

    const isPass = obtainedMarks >= (exam.passing_marks || 0);

    console.log('Final evaluation:', {
      correctCount,
      wrongCount,
      unansweredCount,
      obtainedMarks,
      passingMarks: exam.passing_marks,
      isPass,
      sectionScores
    });

    // Mark session as completed with new exam_status
    const { error: updateSessionError } = await primaryClient
      .from('exam_sessions')
      .update({
        is_completed: true,
        submitted_at: new Date().toISOString(),
        end_time: new Date().toISOString(),
        is_auto_submitted: data.is_auto_submit || false,
        is_blocked: false,
        exam_status: 'finally_submitted', // NEW: Set final status
      })
      .eq('id', data.session_id);

    if (updateSessionError) {
      console.error('Error updating session:', updateSessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save your submission. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Disable exam login
    const { error: disableLoginError } = await primaryClient
      .from('registrations')
      .update({ exam_login_enabled: false })
      .eq('id', registration.id);

    if (disableLoginError) {
      console.error('Error disabling login:', disableLoginError);
    }

    // Create result record
    const { data: result, error: resultError } = await primaryClient
      .from('results')
      .insert({
        exam_id: exam.id,
        student_id: registration.student_id,
        session_id: data.session_id,
        total_marks: exam.total_marks,
        obtained_marks: obtainedMarks,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: unansweredCount,
        is_pass: isPass,
        section_wise_scores: sectionScores,
      })
      .select('id')
      .single();

    if (resultError) {
      console.error('Error creating result:', resultError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to calculate results. Please contact administration.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Exam submitted successfully. Result ID:', result.id);

    return new Response(
      JSON.stringify({
        success: true,
        result_id: result.id,
        total_marks: exam.total_marks,
        obtained_marks: obtainedMarks,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: unansweredCount,
        passing_marks: exam.passing_marks,
        is_pass: isPass,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred. Please try again or contact administration.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
