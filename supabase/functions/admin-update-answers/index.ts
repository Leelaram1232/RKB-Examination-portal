import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateAnswersRequest {
  session_id: string;
  changes: Array<{ 
    question_id: string; 
    selected_option?: string | null; 
    text_answer?: string | null;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    const useExternal = !!(externalUrl && externalKey && externalUrl !== internalUrl);
    const primaryClient = useExternal 
      ? createClient(externalUrl, externalKey) 
      : createClient(internalUrl, internalKey);

    // 1) Validate caller (Always use internal for auth)
    const authHeader = req.headers.get('Authorization') || '';
    const authClient = createClient(internalUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    console.log(`[admin-update-answers] Auth Check:`, { user: userData?.user?.id, error: userError });

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', details: userError?.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) Check role
    const { data: isAdmin, error: roleErr } = await primaryClient.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
    console.log(`[admin-update-answers] Role Check:`, { isAdmin, roleErr });

    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden', details: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- HANDLE GET (Fetch session details) ---
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
        return new Response(JSON.stringify({ error: 'Invalid sessionID provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[admin-update-answers] Fetching details for session: ${sessionId}`);

      // Fetch session with relations
      const { data: session, error: sErr } = await primaryClient
        .from('exam_sessions')
        .select(`
          id, 
          registration:registrations (
            registration_number, 
            exam_id, 
            student_id, 
            profiles (full_name), 
            exams (exam_name)
          )
        `)
        .eq('id', sessionId)
        .maybeSingle();

      if (sErr) {
        console.error('[admin-update-answers] Query error:', sErr);
        return new Response(JSON.stringify({ error: 'Database query failed', details: sErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!session) {
        console.warn(`[admin-update-answers] Session ${sessionId} not found.`);
        return new Response(JSON.stringify({ error: 'Session not found in master DB' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[admin-update-answers] Found session:`, session.id);

      const reg = (session as any).registration;
      if (!reg) {
        return new Response(JSON.stringify({ error: 'Registration data missing for session' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // Fetch Questions
      const { data: questions, error: qErr } = await primaryClient
        .from('questions')
        .select('id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, section_name, marks, question_type')
        .eq('exam_id', reg.exam_id)
        .order('question_number');

      if (qErr) console.error('[admin-update-answers] Questions error:', qErr);

      // Fetch Answers
      const { data: answers, error: aErr } = await primaryClient
        .from('student_answers')
        .select('question_id, selected_option, text_answer')
        .eq('session_id', sessionId);

      if (aErr) console.error('[admin-update-answers] Answers error:', aErr);

      return new Response(
        JSON.stringify({ success: true, debug_tag: 'v5', session, questions, answers }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- HANDLE POST (Update answers) ---
    const body: UpdateAnswersRequest = await req.json();
    if (!body?.session_id || !Array.isArray(body.changes)) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date().toISOString();
    for (const ch of body.changes) {
      await primaryClient.from('student_answers').upsert({
        session_id: body.session_id,
        question_id: ch.question_id,
        selected_option: ch.selected_option ?? null,
        text_answer: ch.text_answer ?? null,
        answered_at: now,
        is_marked_for_review: false,
      }, { onConflict: 'session_id,question_id' });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
