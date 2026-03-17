import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-timestamp, x-webhook-signature',
};

Deno.serve(async (req) => {
  console.log('=== CASHFREE WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const timestamp = req.headers.get('x-webhook-timestamp');
    const signature = req.headers.get('x-webhook-signature');
    const rawBody = await req.text();

    console.log('Timestamp:', timestamp);
    console.log('Signature present:', !!signature);
    console.log('Raw Body:', rawBody);

    // Get environment settings
    const environment = Deno.env.get('CASHFREE_ENVIRONMENT') || 'sandbox';
    const isProduction = environment === 'production' || environment === 'PROD';
    
    // Use webhook secret if available, otherwise fall back to secret key
    const webhookSecret = Deno.env.get('CASHFREE_WEBHOOK_SECRET') || Deno.env.get('CASHFREE_SECRET_KEY');
    
    console.log('Environment:', environment);
    console.log('Is Production:', isProduction);
    console.log('Webhook Secret exists:', !!webhookSecret);

    // Verify signature
    if (signature && webhookSecret && timestamp) {
      console.log('Verifying webhook signature...');
      
      const signatureData = timestamp + rawBody;
      
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signatureData)
      );
      
      const computedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signatureBuffer))
      );

      console.log('Computed signature:', computedSignature);
      console.log('Received signature:', signature);
      
      if (computedSignature !== signature) {
        console.error('WARNING: Signature mismatch');
        
        // In production, strictly reject invalid signatures
        if (isProduction) {
          console.error('ERROR: Invalid signature in production - rejecting');
          return new Response('Invalid signature', { status: 401, headers: corsHeaders });
        } else {
          console.log('Sandbox mode - continuing despite signature mismatch');
        }
      } else {
        console.log('Signature verified successfully');
      }
    } else {
      console.log('No signature verification performed');
      if (!webhookSecret) console.log('Reason: No webhook secret configured');
      if (!signature) console.log('Reason: No signature in request');
      if (!timestamp) console.log('Reason: No timestamp in request');
    }

    // Parse payload
    const payload = JSON.parse(rawBody);
    console.log('Parsed webhook payload:', JSON.stringify(payload, null, 2));
    
    // Use external Supabase credentials to access the data
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle different webhook event types
    const eventType = payload.type;
    const data = payload.data;

    console.log('Event type:', eventType);

    if (!data || !data.order) {
      console.log('No order data in webhook payload - acknowledging');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const orderId = data.order.order_id;
    console.log('Order ID from payload:', orderId);
    
    // Extract registration_id from order_id (format: REG-{uuid}-{timestamp})
    const orderIdParts = orderId.split('-');
    if (orderIdParts.length < 2 || orderIdParts[0] !== 'REG') {
      console.error('ERROR: Invalid order ID format:', orderId);
      return new Response('Invalid order ID format', { status: 200, headers: corsHeaders });
    }
    
    // Reconstruct the UUID (5 parts separated by -)
    const registrationId = orderIdParts.slice(1, 6).join('-');
    console.log('Extracted registration ID:', registrationId);

    // Determine payment status
    let paymentStatus = 'pending';
    let transactionId = null;

    if (data.payment) {
      const paymentState = data.payment.payment_status;
      transactionId = data.payment.cf_payment_id?.toString();
      
      console.log('Payment state:', paymentState);
      console.log('Transaction ID:', transactionId);
      
      if (paymentState === 'SUCCESS') {
        paymentStatus = 'completed';
      } else if (paymentState === 'FAILED' || paymentState === 'CANCELLED' || paymentState === 'USER_DROPPED') {
        paymentStatus = 'failed';
      }
    } else if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      paymentStatus = 'completed';
    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK') {
      paymentStatus = 'failed';
    }

    console.log('Final payment status:', paymentStatus);

    // Update registrations table with payment status
    const updateData: Record<string, unknown> = {
      payment_status: paymentStatus,
      payment_time: new Date().toISOString(),
    };

    if (transactionId) {
      updateData.transaction_id = transactionId;
    }

    console.log('Updating registrations with data:', JSON.stringify(updateData));

    const { error: updateError, data: updateResult } = await supabase
      .from('registrations')
      .update(updateData)
      .eq('id', registrationId)
      .select();

    if (updateError) {
      console.error('ERROR: Failed to update registration:', updateError);
    } else {
      console.log('Registration updated successfully:', JSON.stringify(updateResult));
    }

    // If payment is successful, trigger email notification
    if (paymentStatus === 'completed') {
      console.log('Payment successful - triggering email notification...');
      try {
        const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
          body: { 
            type: 'payment_success', 
            registration_id: registrationId 
          }
        });
        if (emailError) {
          console.error('Email notification failed:', emailError);
        } else {
          console.log('Email notification triggered successfully');
        }
      } catch (emailErr) {
        console.error('Email notification error:', emailErr);
      }
    }

    console.log('=== CASHFREE WEBHOOK PROCESSED ===');

    return new Response('OK', { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (error) {
    console.error('=== CASHFREE WEBHOOK ERROR ===');
    console.error('Error:', error);
    // Return 200 to acknowledge receipt even on error to prevent retries
    return new Response('Error processed', { 
      status: 200, 
      headers: corsHeaders 
    });
  }
});
