import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateAnswersRequest {
  session_id: string;
  changes: Array<{ question_id: string; selected_option: string | null }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) Validate caller
    const authHeader = req.headers.get('Authorization') || '';

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error('Unauthorized:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = userData.user.id;

    // 2) Use service client for privileged ops (bypass RLS)
    const service = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isAdmin, error: roleError } = await service.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Role check failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: UpdateAnswersRequest = await req.json();

    if (!body?.session_id || !Array.isArray(body.changes)) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id or changes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let updated = 0;
    let inserted = 0;
    let deleted = 0;

    for (const change of body.changes) {
      if (!change?.question_id) continue;

      if (change.selected_option === null) {
        const { error } = await service
          .from('student_answers')
          .delete()
          .eq('session_id', body.session_id)
          .eq('question_id', change.question_id);

        if (error) {
          console.error('Delete error:', { change, error });
          throw error;
        }
        deleted++;
        continue;
      }

      const now = new Date().toISOString();

      // Try update first
      const { data: updatedRows, error: updateError } = await service
        .from('student_answers')
        .update({
          selected_option: change.selected_option,
          answered_at: now,
          is_marked_for_review: false,
        })
        .eq('session_id', body.session_id)
        .eq('question_id', change.question_id)
        .select('id');

      if (updateError) {
        console.error('Update error:', { change, updateError });
        throw updateError;
      }

      if (updatedRows && updatedRows.length > 0) {
        updated++;
        continue;
      }

      // Insert if no row existed
      const { error: insertError } = await service.from('student_answers').insert({
        session_id: body.session_id,
        question_id: change.question_id,
        selected_option: change.selected_option,
        is_marked_for_review: false,
        answered_at: now,
      });

      if (insertError) {
        console.error('Insert error:', { change, insertError });
        throw insertError;
      }

      inserted++;
    }

    return new Response(
      JSON.stringify({ success: true, updated, inserted, deleted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('admin-update-answers unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
