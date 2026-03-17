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

  try {
    const { order_id, registration_id } = await req.json();
    console.log("verify-payment called:", { order_id, registration_id });

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
    const baseUrl = isProduction
      ? "https://api.cashfree.com"
      : "https://sandbox.cashfree.com";

    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    // Fetch order status from Cashfree
    console.log("Fetching Cashfree order:", orderId);
    const cfResponse = await fetch(`${baseUrl}/pg/orders/${orderId}`, {
      method: "GET",
      headers: {
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": "2023-08-01",
      },
    });

    const cfText = await cfResponse.text();
    console.log("Cashfree response:", cfResponse.status, cfText);

    let orderData;
    try {
      orderData = JSON.parse(cfText);
    } catch {
      throw new Error("Invalid response from payment gateway");
    }

    if (!cfResponse.ok) {
      throw new Error(orderData.message || "Failed to verify payment");
    }

    // Map status
    let paymentStatus = "pending";
    if (orderData.order_status === "PAID") {
      paymentStatus = "completed";
    } else if (
      orderData.order_status === "EXPIRED" ||
      orderData.order_status === "CANCELLED"
    ) {
      paymentStatus = "failed";
    }

    console.log("Cashfree status:", orderData.order_status, "->", paymentStatus);

    // Update DB if we have regId
    if (regId) {
      const updateData: Record<string, unknown> = {
        payment_status: paymentStatus,
      };

      if (paymentStatus === "completed") {
        updateData.payment_time = new Date().toISOString();
      }

      // Fetch transaction ID from payments endpoint
      try {
        const payRes = await fetch(
          `${baseUrl}/pg/orders/${orderId}/payments`,
          {
            method: "GET",
            headers: {
              "x-client-id": appId,
              "x-client-secret": secretKey,
              "x-api-version": "2023-08-01",
            },
          }
        );
        if (payRes.ok) {
          const payments = await payRes.json();
          if (Array.isArray(payments) && payments.length > 0) {
            const success = payments.find(
              (p: any) => p.payment_status === "SUCCESS"
            );
            if (success) {
              updateData.transaction_id =
                success.cf_payment_id?.toString();
            }
          }
        }
      } catch (e) {
        console.log("Could not fetch payment details:", e);
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
