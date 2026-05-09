import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

interface RegistrationData {
  exam_id: string;
  full_name: string;
  email: string;
  mobile: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth: string;
  class: string;
  school_name: string;
  board: string;
  academic_year?: string;
  address?: string;
  city: string;
  state: string;
  pincode?: string;
  percentage?: number;
  photo_url?: string;
  signature_url?: string;
}

type ExamRow = {
  id: string;
  exam_name: string;
  exam_code: string;
  status: string;
  registration_type: string | null;
  registration_amount: number | null;
  approval_required: boolean | null;
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use built-in Supabase credentials (works on external Supabase deployment)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Database credentials not configured');
    }
    
    console.log('[register-for-exam] Using Supabase:', supabaseUrl);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data: RegistrationData = await req.json();
    console.log('Registration data received:', { ...data, email: '***' });

    // Validate required fields
    const requiredFields = ['exam_id', 'full_name', 'email', 'mobile', 'gender', 'date_of_birth', 'class', 'school_name', 'board', 'city', 'state'];
    for (const field of requiredFields) {
      if (!data[field as keyof RegistrationData]) {
        console.error(`Missing required field: ${field}`);
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if exam exists and get registration settings
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('id, exam_name, exam_code, status, registration_start, registration_end, registration_type, registration_amount, approval_required')
      .eq('id', data.exam_id)
      .single();

    if (examError || !exam) {
      console.error('Exam not found:', examError);
      return new Response(
        JSON.stringify({ error: 'Exam not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (exam.status !== 'registration_open') {
      return new Response(
        JSON.stringify({ error: 'Registration is not open for this exam' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const examRow = exam as unknown as ExamRow;

    // 1) Find or create profile by email (external DB uses public.profiles, not auth)
    const normalizedEmail = data.email.toLowerCase();
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (profileLookupError) {
      console.error('Error looking up profile:', profileLookupError);
      return new Response(
        JSON.stringify({
          error: 'Failed to lookup profile',
          details: profileLookupError.message,
          code: profileLookupError.code,
          hint: profileLookupError.hint,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profileId = existingProfile?.id ?? crypto.randomUUID();

    if (!existingProfile) {
      const { error: profileCreateError } = await supabase.from('profiles').insert({
        id: profileId,
        full_name: data.full_name,
        email: normalizedEmail,
        mobile: data.mobile,
        gender: data.gender,
        date_of_birth: data.date_of_birth,
        address: data.address || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode || null,
        class: data.class,
        school_name: data.school_name,
        board: data.board,
        academic_year: data.academic_year || null,
        percentage: data.percentage || null,
        photo_url: data.photo_url || null,
      });

      if (profileCreateError) {
        console.error('Error creating profile:', profileCreateError);
        return new Response(
          JSON.stringify({
            error: 'Failed to create profile',
            details: profileCreateError.message,
            code: profileCreateError.code,
            hint: profileCreateError.hint,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2) Prevent duplicate registrations for the same exam
    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('registrations')
      .select('id')
      .eq('exam_id', data.exam_id)
      .eq('student_id', profileId)
      .maybeSingle();

    if (existingRegistrationError) {
      console.error('Error checking existing registration:', existingRegistrationError);
      return new Response(
        JSON.stringify({
          error: 'Failed to validate existing registration',
          details: existingRegistrationError.message,
          code: existingRegistrationError.code,
          hint: existingRegistrationError.hint,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingRegistration) {
      return new Response(
        JSON.stringify({ error: 'You have already registered for this exam' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3) Generate a registration number based on registrations table
    const { count: regCount, error: regCountError } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', data.exam_id);

    if (regCountError) {
      console.error('Error counting registrations:', regCountError);
      return new Response(
        JSON.stringify({
          error: 'Failed to generate registration number',
          details: regCountError.message,
          code: regCountError.code,
          hint: regCountError.hint,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sequenceNumber = (regCount || 0) + 1;
    const registrationNumber = `${examRow.exam_code}-${String(sequenceNumber).padStart(4, '0')}`;
    console.log('Generated registration number:', registrationNumber);

    // 4) Determine payment status based on exam type
    const isPaid = examRow.registration_type === 'paid';
    const paymentStatus = isPaid ? 'pending' : 'not_required';

    // 5) Create registration row
    const registrationId = crypto.randomUUID();
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .insert({
        id: registrationId,
        exam_id: data.exam_id,
        student_id: profileId,
        registration_date: new Date().toISOString(),
        approval_status: 'pending',
        registration_number: registrationNumber,
        payment_status: paymentStatus,
        payment_amount: isPaid ? examRow.registration_amount : null,
        exam_login_enabled: false,
        photo_url: data.photo_url || null,
        signature_url: data.signature_url || null,
      })
      .select('id, registration_number, registration_date')
      .single();

    if (regError) {
      console.error('Error creating registration:', regError);
      console.error('Error details:', JSON.stringify(regError, null, 2));
      return new Response(
        JSON.stringify({
          error: 'Failed to create registrant',
          details: regError.message,
          code: regError.code,
          hint: regError.hint,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Registration created successfully:', registration.registration_number, 'for exam:', data.exam_id);

    return new Response(
      JSON.stringify({
        success: true,
        registration_number: registration.registration_number,
        registration_id: registration.id,
        exam_id: data.exam_id,
        exam_name: examRow.exam_name,
        student_name: data.full_name,
        email: data.email,
        registration_date: (registration as any).registration_date,
        message: 'Registration successful. Exam login will be enabled only after admin approval.',
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
