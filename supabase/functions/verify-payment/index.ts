import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractRegistrationId(orderId: string): string | null {
  // Order format: REG-{uuid}-{timestamp}
  // UUID has format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
  // So after "REG-", the next 36 characters are the UUID
  if (!orderId.startsWith("REG-")) return null;
  const afterPrefix = orderId.substring(4); // remove "REG-"
  // UUID is exactly 36 chars (8-4-4-4-12 with hyphens)
  if (afterPrefix.length < 36) return null;
  const uuid = afterPrefix.substring(0, 36);
  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) return null;
  return uuid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

    let order_id, registration_id;
    try {
      const body = await req.json();
      order_id = body.order_id;
      registration_id = body.registration_id;
    } catch {
      // Body may be empty for some requests
    }
    
    console.log("verify-payment called:", { order_id, registration_id });

    try {

    if (!order_id && !registration_id) {
      throw new Error("Either order_id or registration_id is required");
    }

    const appId = Deno.env.get("CASHFREE_APP_ID");
    const secretKey = Deno.env.get("CASHFREE_SECRET_KEY");
    const environment = Deno.env.get("CASHFREE_ENVIRONMENT") || "sandbox";

    if (!appId || !secretKey) {
      throw new Error("Cashfree credentials not configured");
    }

    const isProduction =
      environment === "production" || environment === "PROD";
    const primaryBaseUrl = isProduction
      ? "https://api.cashfree.com"
      : "https://sandbox.cashfree.com";
    const secondaryBaseUrl = isProduction
      ? "https://sandbox.cashfree.com"
      : "https://api.cashfree.com";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let orderId = order_id;
    let regId = registration_id;

    // If only registration_id, fetch order_id from DB
    if (!orderId && regId) {
      const { data: reg, error } = await supabase
        .from("registrations")
        .select("cashfree_order_id, payment_status")
        .eq("id", regId)
        .single();

      if (error || !reg) throw new Error("Registration not found");

      if (reg.payment_status === "completed") {
        // Already done — fetch details and return
        const details = await fetchRegistrationDetails(supabase, regId);
        return jsonResponse({
          success: true,
          payment_status: "completed",
          order_id: reg.cashfree_order_id,
          registration: details,
        });
      }

      orderId = reg.cashfree_order_id;
      if (!orderId) throw new Error("No payment order found for this registration");
    }

    // If we have orderId but no regId, extract it
    if (!regId && orderId) {
      regId = extractRegistrationId(orderId);
      console.log("Extracted regId from orderId:", regId);
    }

    const fetchWithTimeout = async (url: string, options: any, timeout = 10000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    async function fetchOrder(baseUrl: string) {
      console.log(`Fetching order from ${baseUrl}...`);
      const res = await fetchWithTimeout(`${baseUrl}/pg/orders/${orderId}`, {
        method: "GET",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
        },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // keep null
      }
      return { res, text, json };
    }

    async function fetchPayments(baseUrl: string) {
      console.log(`Fetching payments from ${baseUrl}...`);
      const payRes = await fetchWithTimeout(`${baseUrl}/pg/orders/${orderId}/payments`, {
        method: "GET",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
        },
      });
      let json: any = null;
      try {
        json = await payRes.json();
      } catch {
        // ignore
      }
      return { payRes, json };
    }

    // Fetch order status and payments from Cashfree in parallel
    console.log("Fetching Cashfree data for order:", orderId);
    let orderData: any = null;
    let paymentsList: any[] = [];
    let cfStatus = 0;

    try {
      const [cf, pay] = await Promise.all([
        fetchOrder(primaryBaseUrl),
        fetchPayments(primaryBaseUrl)
      ]);

      if (cf.res.ok) {
        orderData = cf.json;
        paymentsList = Array.isArray(pay.json)
          ? pay.json
          : Array.isArray(pay.json?.payments)
            ? pay.json.payments
            : [];
        cfStatus = cf.res.status;
      } else {
        console.log("Primary URL failed, retrying with secondary...");
        const [cf2, pay2] = await Promise.all([
          fetchOrder(secondaryBaseUrl),
          fetchPayments(secondaryBaseUrl)
        ]);
        if (cf2.res.ok) {
          orderData = cf2.json;
          paymentsList = Array.isArray(pay2.json)
            ? pay2.json
            : Array.isArray(pay2.json?.payments)
              ? pay2.json.payments
              : [];
          cfStatus = cf2.res.status;
        }
      }
    } catch (e) {
      console.error("Cashfree fetch error:", e);
    }

    if (!orderData) {
      console.log("No order data found from Cashfree");
      // Don't hard-fail to "failed" if gateway verification is temporarily unavailable.
      // If DB already has completed, trust it. Otherwise treat as pending.
      if (regId) {
        const details = await fetchRegistrationDetails(supabase, regId);
        if (details?.payment_status === "completed") {
          return jsonResponse({
            success: true,
            payment_status: "completed",
            order_id: orderId,
            registration: details,
          });
        }
      }
      return jsonResponse({
        success: true,
        order_id: orderId,
        payment_status: "pending",
        error: "Payment verification temporarily unavailable (Gateway Timeout)",
      });
    }

    // Map status (also cross-check payments list)
    let paymentStatus = "pending";
    const orderStatus = orderData.order_status;
    if (orderStatus === "PAID") {
      paymentStatus = "completed";
    } else if (orderStatus === "EXPIRED" || orderStatus === "CANCELLED") {
      paymentStatus = "failed";
    }

    console.log("Cashfree status:", orderData.order_status, "->", paymentStatus);

    // Update DB if we have regId
    if (regId) {
      const updateData: Record<string, unknown> = {};

      if (paymentsList.length > 0) {
        const success = paymentsList.find((p: any) => p.payment_status === "SUCCESS");
        const failed = paymentsList.find((p: any) =>
          ["FAILED", "CANCELLED", "USER_DROPPED"].includes(p.payment_status)
        );

        if (success) {
          updateData.transaction_id = success.cf_payment_id?.toString();
          paymentStatus = "completed";
        } else if (paymentStatus !== "completed" && failed && orderStatus !== "PAID") {
          paymentStatus = "failed";
        }
      }

      // Ensure DB update matches the FINAL derived status
      updateData.payment_status = paymentStatus;
      if (paymentStatus === "completed") {
        updateData.payment_time = new Date().toISOString();
        
        // Auto-approve if exam doesn't require manual approval (treating null as false/auto-approve)
        const regWithExam = await fetchRegistrationDetails(supabase, regId);
        if (regWithExam?.exams?.approval_required !== true) {
          console.log("Auto-approving registration", regId);
          updateData.approval_status = 'approved';
          updateData.exam_login_enabled = true;
          updateData.approved_at = new Date().toISOString();
          updateData.approval_remarks = 'Auto-approved upon successful payment';
        }
      }

      console.log("Updating registration", regId, updateData);
      const { error: updateErr } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", regId);

      if (updateErr) {
        console.error("DB update error:", updateErr);
      }

      // Trigger email on success - NON-BLOCKING
      if (paymentStatus === "completed") {
        console.log("Triggering confirmation email (async)...");
        // We don't await this to ensure the user gets a response quickly
        supabase.functions.invoke("finalize-registration", {
          body: { type: "payment_success", registration_id: regId },
        }).then(({ data, error }) => {
           console.log("Async email trigger result:", { success: !error, error });
        }).catch(e => {
           console.error("Async email trigger exception:", e);
        });
      }
    }

    // Fetch full registration details for receipt
    let registration = null;
    if (regId) {
      registration = await fetchRegistrationDetails(supabase, regId);
    }

    return jsonResponse({
      success: true,
      order_id: orderId,
      order_status: orderData.order_status,
      payment_status: paymentStatus,
      order_amount: orderData.order_amount,
      registration,
    });
  } catch (error: unknown) {
    console.error("verify-payment error:", error);

    // Fallback: if DB already shows completed payment, still return success
    try {
      if (order_id || registration_id) {
        let regId = registration_id;
        if (!regId && order_id) {
          regId = extractRegistrationId(order_id);
        }

        if (regId) {
          const registration = await fetchRegistrationDetails(supabase, regId);

          if (registration && registration.payment_status === "completed") {
            return jsonResponse({
              success: true,
              order_id: order_id ?? registration.cashfree_order_id ?? null,
              payment_status: "completed",
              registration,
            });
          }
        }
      }
    } catch (fallbackError) {
      console.error("verify-payment fallback error:", fallbackError);
    }

    const msg =
      error instanceof Error ? error.message : "Failed to verify payment";
    return jsonResponse({ success: false, error: msg }, 400);
  }
});

async function fetchRegistrationDetails(supabase: any, regId: string) {
  try {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `id, registration_number, payment_amount, payment_time, transaction_id, payment_status, cashfree_order_id, approval_status,
         profiles:student_id(full_name, email, mobile),
         exams:exam_id(exam_name, exam_code, exam_date, approval_required)`
      )
      .eq("id", regId)
      .single();

    if (error) {
      console.error("Failed to fetch registration details:", error);
      return null;
    }
    return data;
  } catch (e) {
    console.error("fetchRegistrationDetails error:", e);
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
