import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  image_data: string; // base64 image data
  session_id: string;
}

type FaceAnalysis = {
  face_count: number;
  looking_at_screen: boolean;
  head_rotation: 'none' | 'slight' | 'significant';
  suspicious_objects: string[];
  confidence: number;
};

async function callGroqVision(params: {
  apiKey: string;
  model: string;
  imageDataUrl: string;
}): Promise<FaceAnalysis> {
  const { apiKey, model, imageDataUrl } = params;

  const system = `You are an exam proctoring AI that analyzes webcam images to detect:
1) Number of faces visible (0, 1, 2+)
2) Whether the primary face is looking at the screen/camera
3) Head rotation level: none/slight/significant
4) Suspicious objects: phone/mobile, paper, book, notes, earbuds, another device, etc.

Respond ONLY with a JSON object in this exact format:
{
  "face_count": number,
  "looking_at_screen": boolean,
  "head_rotation": "none" | "slight" | "significant",
  "suspicious_objects": string[],
  "confidence": number
}

Rules:
- suspicious_objects should be short labels (e.g. "phone", "paper", "book", "earbuds")
- confidence must be 0.0..1.0
- If unsure, return best estimate with lower confidence.`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this webcam image for proctoring policy violations.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 400,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Groq Vision error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';

  const jsonMatch = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null;
  if (!jsonMatch) throw new Error('Groq response missing JSON');

  const parsed = JSON.parse(jsonMatch[0]) as Partial<FaceAnalysis>;
  return {
    face_count: typeof parsed.face_count === 'number' ? parsed.face_count : 1,
    looking_at_screen: typeof parsed.looking_at_screen === 'boolean' ? parsed.looking_at_screen : true,
    head_rotation:
      parsed.head_rotation === 'none' || parsed.head_rotation === 'slight' || parsed.head_rotation === 'significant'
        ? parsed.head_rotation
        : 'none',
    suspicious_objects: Array.isArray(parsed.suspicious_objects)
      ? parsed.suspicious_objects.filter((s) => typeof s === 'string').slice(0, 10)
      : [],
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
  };
}

async function callLovableGatewayVision(params: {
  lovableApiKey: string;
  imageDataUrl: string;
}): Promise<FaceAnalysis> {
  const { lovableApiKey, imageDataUrl } = params;

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are an exam proctoring AI that analyzes webcam images to detect:
1. Number of faces visible in the image
2. Whether the primary face is looking at the screen
3. Any suspicious objects (phones, papers, other devices)

Respond ONLY with a JSON object in this exact format:
{
  "face_count": number,
  "looking_at_screen": boolean,
  "head_rotation": "none" | "slight" | "significant",
  "suspicious_objects": string[],
  "confidence": number
}

IMPORTANT:
- face_count: 0 if no face, 1 if one face, 2+ if multiple faces
- looking_at_screen: true if the person appears to be looking at the camera/screen
- head_rotation: "none" for facing camera, "slight" for minor turn, "significant" for looking away
- suspicious_objects: list any visible phones, papers, books, other people, etc.
- confidence: your confidence in the analysis (0.0 to 1.0)`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this webcam image from an exam proctoring session.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`Lovable gateway error ${aiResponse.status}: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]) as Partial<FaceAnalysis>;
      return {
        face_count: typeof analysis.face_count === 'number' ? analysis.face_count : 1,
        looking_at_screen: typeof analysis.looking_at_screen === 'boolean' ? analysis.looking_at_screen : true,
        head_rotation:
          analysis.head_rotation === 'none' || analysis.head_rotation === 'slight' || analysis.head_rotation === 'significant'
            ? analysis.head_rotation
            : 'none',
        suspicious_objects: Array.isArray(analysis.suspicious_objects)
          ? analysis.suspicious_objects.filter((s) => typeof s === 'string').slice(0, 10)
          : [],
        confidence: typeof analysis.confidence === 'number' ? Math.max(0, Math.min(1, analysis.confidence)) : 0.5,
      };
    }
  } catch {
    // fall through to default
  }

  return {
    face_count: 1,
    looking_at_screen: true,
    head_rotation: 'none',
    suspicious_objects: [],
    confidence: 0.5,
  };
}

Deno.serve(async (req) => {
  console.log('=== ANALYZE FACES START ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY') || '';
    const groqApiKey = Deno.env.get('GROQ_API_KEY') || '';
    const groqModel = Deno.env.get('GROQ_VISION_MODEL') || 'llama-3.2-90b-vision-preview';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data: AnalyzeRequest = await req.json();
    console.log('[FACES] Analyzing image for session:', data.session_id);

    if (!data.image_data || !data.session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing image_data or session_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Groq Vision if configured; otherwise fall back to Lovable gateway
    let analysis: FaceAnalysis;
    try {
      if (groqApiKey) {
        analysis = await callGroqVision({ apiKey: groqApiKey, model: groqModel, imageDataUrl: data.image_data });
        console.log('[FACES] Groq analysis:', analysis);
      } else {
        analysis = await callLovableGatewayVision({ lovableApiKey, imageDataUrl: data.image_data });
        console.log('[FACES] Gateway analysis:', analysis);
      }
    } catch (e) {
      console.error('[FACES] Primary analysis failed, attempting fallback:', e);
      try {
        if (lovableApiKey) {
          analysis = await callLovableGatewayVision({ lovableApiKey, imageDataUrl: data.image_data });
        } else {
          analysis = {
            face_count: 1,
            looking_at_screen: true,
            head_rotation: 'none',
            suspicious_objects: [],
            confidence: 0.4,
          };
        }
      } catch (e2) {
        console.error('[FACES] Fallback analysis failed:', e2);
        analysis = {
          face_count: 1,
          looking_at_screen: true,
          head_rotation: 'none',
          suspicious_objects: [],
          confidence: 0.4,
        };
      }
    }

    // Determine violations (do NOT write to DB here; ExamInterface is the source of truth for violations/count)
    const violations: string[] = [];
    let shouldAutoSubmit = false;

    if (analysis.face_count === 0) {
      violations.push('No Face Detected');
    } else if (analysis.face_count > 1) {
      violations.push('Multiple Faces Detected');
      shouldAutoSubmit = true; // Critical violation
    }

    if (analysis.head_rotation === 'significant') {
      violations.push('Head Rotation Detected');
    }

    if (analysis.suspicious_objects && analysis.suspicious_objects.length > 0) {
      violations.push(`Suspicious Objects: ${analysis.suspicious_objects.join(', ')}`);
    }

    console.log('[FACES] Analysis complete:', { violations, shouldAutoSubmit });

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        violations,
        should_auto_submit: shouldAutoSubmit,
        multiple_faces: analysis.face_count > 1,
        face_not_visible: analysis.face_count === 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FACES] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
