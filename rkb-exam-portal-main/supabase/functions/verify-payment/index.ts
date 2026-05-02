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

    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const internalUrl = Deno.env.get("SUPABASE_URL");
    const internalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Use external if available, otherwise fallback to internal
    const supabaseUrl = externalUrl || internalUrl;
    const supabaseKey = externalKey || internalKey;

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

    async function fetchOrder(baseUrl: string) {
      const res = await fetch(`${baseUrl}/pg/orders/${orderId}`, {
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

    // Fetch order status from Cashfree (try both prod & sandbox to avoid env mismatch)
    console.log("Fetching Cashfree order:", orderId, { primaryBaseUrl });
    let cf = await fetchOrder(primaryBaseUrl);
    console.log("Cashfree response (primary):", cf.res.status, cf.text);

    if (!cf.res.ok) {
      console.log("Retrying Cashfree order on secondary base URL:", {
        secondaryBaseUrl,
      });
      const cf2 = await fetchOrder(secondaryBaseUrl);
      console.log("Cashfree response (secondary):", cf2.res.status, cf2.text);
      if (cf2.res.ok) {
        cf = cf2;
      }
    }

    const orderData = cf.json;
    if (!cf.res.ok || !orderData) {
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
        error:
          (orderData?.message as string) ||
          "Payment verification temporarily unavailable",
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

      // Fetch transaction ID from payments endpoint
      try {
        async function fetchPayments(baseUrl: string) {
          const payRes = await fetch(`${baseUrl}/pg/orders/${orderId}/payments`, {
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

        let pay = await fetchPayments(primaryBaseUrl);
        if (!pay.payRes.ok) {
          pay = await fetchPayments(secondaryBaseUrl);
        }

        const paymentsList = Array.isArray(pay.json)
          ? pay.json
          : Array.isArray(pay.json?.payments)
            ? pay.json.payments
            : [];

        if (paymentsList.length > 0) {
          const success = paymentsList.find((p: any) => p.payment_status === "SUCCESS");
          const failed = paymentsList.find((p: any) =>
            ["FAILED", "CANCELLED", "USER_DROPPED"].includes(p.payment_status)
          );

          if (success) {
            updateData.transaction_id = success.cf_payment_id?.toString();
            paymentStatus = "completed";
          } else if (paymentStatus !== "completed" && failed && orderStatus !== "PAID") {
            // Only mark failed when gateway clearly says so
            paymentStatus = "failed";
          }
        }
      } catch (e) {
        console.log("Could not fetch payment details:", e);
      }

      // Ensure DB update matches the FINAL derived status
      updateData.payment_status = paymentStatus;
      if (paymentStatus === "completed") {
        updateData.payment_time = new Date().toISOString();
      }

      console.log("Updating registration", regId, updateData);
      const { error: updateErr } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", regId);

      if (updateErr) {
        console.error("DB update error:", updateErr);
      }

      // Trigger email on success
      if (paymentStatus === "completed") {
        try {
          await supabase.functions.invoke("send-notification-email", {
            body: { type: "payment_success", registration_id: regId },
          });
        } catch (e) {
          console.error("Email error:", e);
        }
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
      const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
      const externalKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

      if (externalUrl && externalKey && (order_id || registration_id)) {
        const supabase = createClient(externalUrl, externalKey);

        let regId = registration_id;
        if (!regId && order_id) {
          regId = extractRegistrationId(order_id);
          console.log("Fallback extracted regId from orderId:", regId);
        }

        if (regId) {
          const registration = await fetchRegistrationDetails(supabase, regId);

          // If DB already has completed payment, trust that state
          if (registration && registration.payment_status === "completed") {
            console.log(
              "Fallback: registration already marked completed in DB, returning success"
            );
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
        `id, registration_number, payment_amount, payment_time, transaction_id, payment_status, cashfree_order_id,
         profiles:student_id(full_name, email, mobile),
         exams:exam_id(exam_name, exam_code, exam_date)`
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
