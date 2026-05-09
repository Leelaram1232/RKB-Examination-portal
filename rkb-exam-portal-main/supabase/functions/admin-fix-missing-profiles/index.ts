import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!internalUrl || !internalServiceKey) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1) Validate caller using external Supabase auth
    const authHeader = req.headers.get('Authorization') || '';

    const authClient = createClient(internalUrl, internalAnonKey, {
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
    const service = createClient(internalUrl, internalServiceKey);

    // Check admin role on external Supabase
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
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3) Find registrations with missing profiles
    const { data: registrations, error: regsError } = await service
      .from('registrations')
      .select('student_id');

    if (regsError) {
      console.error('Failed to fetch registrations:', regsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch registrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const studentIds = Array.from(new Set(registrations.map(r => r.student_id).filter(Boolean)));

    if (studentIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          created_count: 0, 
          skipped_count: 0, 
          failed_count: 0,
          message: 'No registrations found' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get existing profiles
    const { data: existingProfiles, error: profilesError } = await service
      .from('profiles')
      .select('id')
      .in('id', studentIds);

    if (profilesError) {
      console.error('Failed to fetch profiles:', profilesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const existingIds = new Set((existingProfiles ?? []).map(p => p.id));
    const missingIds = studentIds.filter(id => !existingIds.has(id));

    if (missingIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          created_count: 0, 
          skipped_count: studentIds.length, 
          failed_count: 0,
          message: 'All profiles already exist' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4) Create placeholder profiles for missing IDs
    let createdCount = 0;
    let skippedCount = existingIds.size;
    let failedCount = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const studentId of missingIds) {
      const placeholderProfile = {
        id: studentId,
        full_name: 'Unknown Student',
        email: `unknown-${studentId.slice(0, 8)}@placeholder.local`,
      };

      const { error: insertError } = await service
        .from('profiles')
        .insert(placeholderProfile);

      if (insertError) {
        // Check if it's a duplicate key error (profile already exists - race condition)
        if (insertError.code === '23505') {
          skippedCount++;
          console.log(`Profile already exists for ${studentId} (race condition)`);
        } else {
          failedCount++;
          failures.push({ id: studentId, error: insertError.message });
          console.error(`Failed to create profile for ${studentId}:`, insertError);
        }
      } else {
        createdCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: failedCount === 0,
        created_count: createdCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        failures: failures.slice(0, 5), // Return first 5 failures for debugging
        message: failedCount === 0 
          ? `Created ${createdCount} placeholder profiles`
          : `Created ${createdCount}, failed ${failedCount}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('admin-fix-missing-profiles unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
