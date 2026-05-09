import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SaveAnswerRequest {
  session_id: string;
  question_id: string;
  selected_option: string | null;
  is_marked_for_review: boolean;
  text_answer?: string | null;
}

Deno.serve(async (req) => {
  console.log(`=== SAVE ANSWER: ${req.method} ${req.url} ===`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create primary client (where registrations live)
    const primaryClient = createClient(internalUrl, internalKey);
    console.log('[save-answer] Using Portal Database');

    const body: SaveAnswerRequest = await req.json();
    
    console.log('[save-answer] Parsed Data:', { 
      session_id: body?.session_id, 
      question_id: body?.question_id,
      selected: body?.selected_option 
    });

    if (!body?.session_id || !body?.question_id) {
      console.error('[save-answer] FAIL: Missing session_id or question_id');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Missing required fields: ${!body?.session_id ? 'session_id ' : ''}${!body?.question_id ? 'question_id' : ''}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Verify session is active
    console.log('[save-answer] Step 1: Verifying session:', body.session_id);
    const { data: session, error: sessionError } = await primaryClient
      .from('exam_sessions')
      .select('id, is_completed, is_blocked')
      .eq('id', body.session_id)
      .maybeSingle();

    if (sessionError) {
      console.error('[save-answer] ERROR: Session query failed:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Session query failed: ' + sessionError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      console.error('[save-answer] ERROR: Session not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Session not found. Please log in again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[save-answer] Session state:', JSON.stringify(session));

    if (session.is_completed) {
      console.error('ERROR: Exam already submitted');
      return new Response(
        JSON.stringify({ success: false, error: 'Exam already submitted' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.is_blocked) {
      console.error('ERROR: Session is blocked');
      return new Response(
        JSON.stringify({ success: false, error: 'Session is blocked' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Check if answer already exists
    console.log('[save-answer] Step 2: Checking for existing answer...');
    const { data: existingAnswers, error: existingError } = await primaryClient
      .from('student_answers')
      .select('id')
      .eq('session_id', body.session_id)
      .eq('question_id', body.question_id)
      .limit(1);

    if (existingError) {
      console.error('ERROR: Existing answer query failed:', existingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check existing answer: ' + existingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingAnswer = existingAnswers && existingAnswers.length > 0 ? existingAnswers[0] : null;

    const now = new Date().toISOString();

    // Step 3: Insert or update answer
    if (existingAnswer) {
      console.log('[save-answer] Step 3: Updating existing answer:', existingAnswer.id);
      const { error: updateError } = await primaryClient
        .from('student_answers')
        .update({
          selected_option: body.selected_option,
          text_answer: body.text_answer ?? null,
          is_marked_for_review: body.is_marked_for_review,
          answered_at: now,
        })
        .eq('id', existingAnswer.id);

      if (updateError) {
        console.error('ERROR: Update failed:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update answer: ' + updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Answer updated successfully');
    } else {
      console.log('[save-answer] Step 3: Inserting new answer...');
      const { error: insertError } = await primaryClient
        .from('student_answers')
        .insert({
          session_id: body.session_id,
          question_id: body.question_id,
          selected_option: body.selected_option,
          text_answer: body.text_answer ?? null,
          is_marked_for_review: body.is_marked_for_review,
          answered_at: now,
        });

      if (insertError) {
        console.error('ERROR: Insert failed:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save answer: ' + insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Answer inserted successfully');
    }

    console.log('=== SAVE ANSWER SUCCESS ===');

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('=== SAVE ANSWER ERROR ===');
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
