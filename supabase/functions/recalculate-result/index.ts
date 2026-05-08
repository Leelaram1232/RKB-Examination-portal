import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecalculateData {
  session_id: string;
}

Deno.serve(async (req) => {
  // PANIC LOG: If you see this, the function is reaching the script!
  console.log(`[RECALCULATE-RESULT] === Request Started: ${new Date().toISOString()} ===`);
  console.log(`[RECALCULATE-RESULT] Method: ${req.method}, URL: ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const primaryClient = createClient(supabaseUrl, supabaseKey);
    console.log('[RECALCULATE-RESULT] Using Portal Database');

    const rawBody = await req.text();
    console.log('[RECALCULATE-RESULT] Raw Body:', rawBody);
    
    if (!rawBody) {
      throw new Error('Empty request body');
    }

    const data: RecalculateData = JSON.parse(rawBody);
    console.log('[RECALCULATE-RESULT] Recalculating Session ID:', data.session_id);

    if (!data.session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get session with registration and exam details
    const { data: session, error: sessionError } = await primaryClient
      .from('exam_sessions')
      .select(`
        id,
        registration_id,
        is_completed,
        start_time,
        registration:registrations!exam_sessions_registration_id_fkey (
          id,
          student_id,
          exam_id,
          exam:exams!registrations_exam_id_fkey (
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

    if (sessionError) {
      console.error('[recalculate-result] Database error fetching session:', sessionError);
      return new Response(
        JSON.stringify({ error: `Database error: ${sessionError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      console.error('[recalculate-result] Session ID not found in database:', data.session_id);
      return new Response(
        JSON.stringify({ error: 'Session not found. Please ensure the exam was started correctly.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const registration = (session as any).registration;
    if (!registration) {
      console.error('[recalculate-result] Registration record missing for session');
      return new Response(
        JSON.stringify({ error: 'Session lacks a valid registration. Scoring aborted.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const exam = registration.exam;
    if (!exam) {
      console.error('[recalculate-result] Exam record missing for registration');
      return new Response(
        JSON.stringify({ error: 'Exam settings not found for this session.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const defaultMarksPerQuestion = exam.marks_per_question || 1; // Default to 1 instead of 4 if missing
    const negativeMarksValue = exam.marks_per_wrong || exam.negative_mark_value || 0;

    console.log('[recalculate-result] Evaluation Context:', {
      examId: exam.id,
      defaultMarks: defaultMarksPerQuestion,
      negativeMarking: !!exam.negative_marking,
      negativeValue: negativeMarksValue,
      passingMarks: exam.passing_marks
    });

    // Delete existing result for this session
    const { error: deleteError } = await primaryClient
      .from('results')
      .delete()
      .eq('session_id', data.session_id);

    if (deleteError) {
      console.error('Error deleting existing result:', deleteError);
      // Continue anyway - result might not exist
    }

    // Get all questions for this exam - use external client if questions were uploaded there
    const { data: questions, error: questionsError } = await primaryClient
      .from('questions')
      .select('id, correct_option, correct_answer, question_type, marks, section_name')
      .eq('exam_id', exam.id);

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Total questions found:', questions?.length || 0);

    // Get student answers
    const { data: answers, error: answersError } = await primaryClient
      .from('student_answers')
      .select('question_id, selected_option, text_answer')
      .eq('session_id', data.session_id);

    if (answersError) {
      console.error('Error fetching answers:', answersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch answers' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Total answers found:', answers?.length || 0);

    // Create answer map
    const answerMap = new Map((answers || []).map(a => [a.question_id, a]));

    const normalizeText = (value: string | null | undefined): string => {
      if (!value) return '';
      return value.trim().toLowerCase().replace(/\s+/g, ' ');
    };

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
      const studentAns = answerMap.get(question.id) as { selected_option: string | null; text_answer?: string | null } | undefined;
      const questionMarks = question.marks || defaultMarksPerQuestion;
      
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
      
      const questionType = (question as any).question_type || 'MCQ';
      const correctAnswerText = ((question as any).correct_answer || (question as any).correct_option) as string | null;
      const selectedOption = studentAns?.selected_option;
      const textAnswer = studentAns?.text_answer || null;

      console.log('Evaluating question:', {
        questionId: question.id,
        section,
        questionType,
        correctOption: question.correct_option,
        correctAnswerText,
        selectedOption,
        textAnswer,
        questionMarks: questionMarks
      });

      const hasMcqAnswer = !!selectedOption;
      const hasTextAnswer = !!normalizeText(textAnswer);

      if (questionType === 'NUMERICAL') {
        if (!hasTextAnswer) {
          unansweredCount++;
          sectionScores[section].unanswered += 1;
        } else {
          const studentNorm = normalizeText(textAnswer);
          const correctNorm = normalizeText(correctAnswerText);

          if (studentNorm === correctNorm) {
            correctCount++;
            obtainedMarks += questionMarks;
            sectionScores[section].correct += 1;
            sectionScores[section].marks += questionMarks;
            console.log(`CORRECT (NUMERICAL): +${questionMarks} marks`);
          } else {
            wrongCount++;
            sectionScores[section].wrong += 1;
            if (exam.negative_marking) {
              const deduction = negativeMarksValue;
              obtainedMarks -= deduction;
              sectionScores[section].marks -= deduction;
              console.log(`WRONG (NUMERICAL): -${deduction} marks (negative marking)`);
            } else {
              console.log('WRONG (NUMERICAL): 0 marks (no negative marking)');
            }
          }
        }
      } else {
        if (!hasMcqAnswer) {
          unansweredCount++;
          sectionScores[section].unanswered += 1;
        } else if (selectedOption === question.correct_option) {
          correctCount++;
          obtainedMarks += questionMarks;
          sectionScores[section].correct += 1;
          sectionScores[section].marks += questionMarks;
          console.log(`CORRECT: +${questionMarks} marks`);
        } else {
          wrongCount++;
          sectionScores[section].wrong += 1;
          if (exam.negative_marking) {
            const deduction = negativeMarksValue;
            obtainedMarks -= deduction;
            sectionScores[section].marks -= deduction;
            console.log(`WRONG: -${deduction} marks (negative marking)`);
          } else {
            console.log('WRONG: 0 marks (no negative marking)');
          }
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

    console.log('Final calculation:', {
      correctCount,
      wrongCount,
      unansweredCount,
      obtainedMarks,
      isPass,
      sectionScores
    });

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
        JSON.stringify({ error: 'Failed to save results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Result recalculated successfully. Result ID:', result.id);

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
        section_wise_scores: sectionScores,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
