import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registration_id } = await req.json();

    console.log('=== CREATE CASHFREE ORDER START ===');
    console.log('Registration ID:', registration_id);

    if (!registration_id) {
      throw new Error('Registration ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Webhook URL (function is deployed here)
    const lovableCloudUrl = supabaseUrl;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch registration from 'registrations' table
    console.log('Fetching registration...');
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('id, payment_amount, exam_id, payment_status, student_id')
      .eq('id', registration_id)
      .single();

    if (regError || !registration) {
      console.error('Registration fetch failed:', regError);
      throw new Error('Registration not found');
    }
    console.log('Registration found, student_id:', registration.student_id);

    // Step 2: Fetch profile using student_id
    console.log('Fetching profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, mobile')
      .eq('id', registration.student_id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch failed:', profileError);
      throw new Error('Student profile not found');
    }
    console.log('Profile found:', profile.full_name);

    // Check if already paid
    if (registration.payment_status === 'completed') {
      throw new Error('Payment already completed for this registration');
    }

    // Validate required fields
    if (!profile.mobile) {
      throw new Error('Mobile number is required for payment');
    }
    if (!profile.email) {
      throw new Error('Email is required for payment');
    }

    // Get Cashfree credentials
    const appId = Deno.env.get('CASHFREE_APP_ID');
    const secretKey = Deno.env.get('CASHFREE_SECRET_KEY');
    const environment = Deno.env.get('CASHFREE_ENVIRONMENT') || 'sandbox';
    
    if (!appId || !secretKey) {
      throw new Error('Cashfree credentials not configured');
    }

    const isProduction = environment === 'production' || environment === 'PROD';
    const baseUrl = isProduction
      ? 'https://api.cashfree.com' 
      : 'https://sandbox.cashfree.com';

    // Clean phone number
    const customerPhone = profile.mobile.replace(/\D/g, '');
    let formattedPhone = customerPhone;
    if (customerPhone.length > 10) {
      formattedPhone = customerPhone.slice(-10);
    } else if (customerPhone.length < 10) {
      throw new Error('Phone number must be at least 10 digits');
    }

    const orderAmount = registration.payment_amount || 0;
    if (orderAmount <= 0) {
      throw new Error('Order amount must be greater than 0');
    }

    const orderId = `REG-${registration_id}-${Date.now()}`;

    const orderPayload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: registration.id.replace(/-/g, '').substring(0, 50),
        customer_name: profile.full_name?.substring(0, 100) || 'Student',
        customer_email: profile.email?.substring(0, 100) || 'student@example.com',
        customer_phone: formattedPhone,
      },
      order_meta: {
        return_url: `https://rkbems.site/payment-status?order_id=${orderId}&registration_id=${registration_id}`,
        // Webhook goes to Lovable Cloud where cashfree-webhook function is deployed
        notify_url: `${lovableCloudUrl}/functions/v1/cashfree-webhook`,
      },
    };

    console.log('Creating Cashfree order...');

    const response = await fetch(`${baseUrl}/pg/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
      },
      body: JSON.stringify(orderPayload),
    });

    const responseText = await response.text();
    console.log('Cashfree Response Status:', response.status);

    let cashfreeOrder;
    try {
      cashfreeOrder = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid response from payment gateway');
    }

    if (!response.ok) {
      throw new Error(cashfreeOrder.message || `Cashfree API error: ${response.status}`);
    }

    if (!cashfreeOrder.payment_session_id) {
      throw new Error('Failed to get payment session from Cashfree');
    }

    // Step 3: Update registrations table with order ID
    console.log('Updating registration with order ID...');
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ 
        cashfree_order_id: orderId,
        payment_status: 'pending'
      })
      .eq('id', registration_id);

    if (updateError) {
      console.error('Warning: Failed to update registration:', updateError);
    }

    console.log('=== CREATE CASHFREE ORDER SUCCESS ===');

    return new Response(
      JSON.stringify({
        success: true,
        payment_session_id: cashfreeOrder.payment_session_id,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        environment: isProduction ? 'production' : 'sandbox',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('=== CREATE CASHFREE ORDER FAILED ===');
    const errorMessage = error instanceof Error ? error.message : 'Failed to create payment order';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
