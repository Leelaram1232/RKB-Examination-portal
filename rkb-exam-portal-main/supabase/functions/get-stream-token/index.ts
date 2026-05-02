// Edge function: get-stream-token
// Issues short-lived LiveKit access tokens for students and admins.

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore - Supabase Deno client
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const exam_id = body.exam_id as string | undefined;
    const session_id = body.session_id as string | undefined;
    const role = (body.role as string | undefined) ?? "student";

    if (!exam_id || !session_id) {
      return new Response(JSON.stringify({ error: "exam_id and session_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Supabase service credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify that the session belongs to the exam.
    const { data: session, error: sessionError } = await supabase
      .from("exam_sessions")
      .select("id, exam_id")
      .eq("id", session_id)
      .single();

    if (sessionError || !session || session.exam_id !== exam_id) {
      return new Response(JSON.stringify({ error: "Invalid session or exam" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    const livekitKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET");

    if (!livekitUrl || !livekitKey || !livekitSecret) {
      return new Response(JSON.stringify({ error: "LiveKit environment variables not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roomName = `exam-${exam_id}`;

    const at = new AccessToken(livekitKey, livekitSecret, {
      identity: session_id,
      ttl: 60 * 60, // 1 hour
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: role === "student",
      canSubscribe: true,
    });

    const token = at.toJwt();

    return new Response(
      JSON.stringify({
        url: livekitUrl,
        token,
        roomName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("[get-stream-token] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

