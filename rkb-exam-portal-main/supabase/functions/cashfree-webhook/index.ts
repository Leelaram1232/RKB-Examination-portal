import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-timestamp, x-webhook-signature',
};

Deno.serve(async (req) => {
  console.log('=== CASHFREE WEBHOOK RECEIVED ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const timestamp = req.headers.get('x-webhook-timestamp');
    const signature = req.headers.get('x-webhook-signature');
    const rawBody = await req.text();

    const environment = Deno.env.get('CASHFREE_ENVIRONMENT') || 'sandbox';
    const isProduction = environment === 'production' || environment === 'PROD';
    const webhookSecret = Deno.env.get('CASHFREE_WEBHOOK_SECRET') || Deno.env.get('CASHFREE_SECRET_KEY');

    // Verify signature if possible
    if (signature && webhookSecret && timestamp) {
      const signatureData = timestamp + rawBody;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureData));
      const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      if (computedSignature !== signature && isProduction) {
        console.error('ERROR: Invalid signature in production');
        return new Response('Invalid signature', { status: 401, headers: corsHeaders });
      }
    }

    const payload = JSON.parse(rawBody);
    const data = payload.data;

    if (!data || !data.order) {
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const orderId = data.order.order_id;
    const orderIdParts = orderId.split('-');
    if (orderIdParts.length < 2 || orderIdParts[0] !== 'REG') {
      return new Response('OK', { status: 200, headers: corsHeaders });
    }
    
    const registrationId = orderIdParts.slice(1, 6).join('-');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let paymentStatus = 'pending';
    let transactionId = data.payment?.cf_payment_id?.toString() || null;

    if (data.payment?.payment_status === 'SUCCESS' || payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      paymentStatus = 'completed';
    } else if (['FAILED', 'CANCELLED', 'USER_DROPPED'].includes(data.payment?.payment_status) || payload.type === 'PAYMENT_FAILED_WEBHOOK') {
      paymentStatus = 'failed';
    }

    const updateData: Record<string, any> = { payment_status: paymentStatus };
    if (transactionId) updateData.transaction_id = transactionId;

    if (paymentStatus === 'completed') {
      updateData.payment_time = new Date().toISOString();
      try {
        const { data: regData } = await supabase.from('registrations').select('exam_id, exams(approval_required)').eq('id', registrationId).single();
        if (regData?.exams?.approval_required !== true) {
          updateData.approval_status = 'approved';
          updateData.exam_login_enabled = true;
          updateData.approved_at = new Date().toISOString();
          updateData.approval_remarks = 'Auto-approved via payment webhook';
        }
      } catch (err) {
        console.error('Auto-approval error:', err);
      }
    }

    await supabase.from('registrations').update(updateData).eq('id', registrationId);

    if (paymentStatus === 'completed') {
      await supabase.functions.invoke('finalize-registration', {
        body: { type: 'payment_success', registration_id: registrationId }
      }).catch(console.error);
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Webhook Error:', error);
    return new Response('Error processed', { status: 200, headers: corsHeaders });
  }
});
