import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  image_data: string; // base64 image data
  session_id: string;
}

Deno.serve(async (req) => {
  console.log('=== ANALYZE FACES START ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data: AnalyzeRequest = await req.json();
    console.log('[FACES] Analyzing image for session:', data.session_id);

    if (!data.image_data || !data.session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing image_data or session_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use AI to analyze the image for faces
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
- confidence: your confidence in the analysis (0.0 to 1.0)`
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: 'Analyze this webcam image from an exam proctoring session. Detect faces, eye gaze, and any suspicious objects.' 
              },
              {
                type: 'image_url',
                image_url: { url: data.image_data }
              }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[FACES] AI error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[FACES] AI response:', content);

    // Parse the JSON response
    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('[FACES] Failed to parse response:', e);
      analysis = {
        face_count: 1,
        looking_at_screen: true,
        head_rotation: 'none',
        suspicious_objects: [],
        confidence: 0.5
      };
    }

    // Determine violations
    const violations: string[] = [];
    let shouldAutoSubmit = false;

    if (analysis.face_count === 0) {
      violations.push('No face detected');
    } else if (analysis.face_count > 1) {
      violations.push('Multiple faces detected');
      shouldAutoSubmit = true; // Critical violation
    }

    if (analysis.head_rotation === 'significant') {
      violations.push('Head rotation detected');
    }

    if (analysis.suspicious_objects && analysis.suspicious_objects.length > 0) {
      violations.push(`Suspicious objects: ${analysis.suspicious_objects.join(', ')}`);
    }

    // Log violations to database
    if (violations.length > 0) {
      const { data: session } = await supabase
        .from('exam_sessions')
        .select('violation_count, proctoring_violations')
        .eq('id', data.session_id)
        .single();

      if (session) {
        const currentViolations = (session.proctoring_violations as any[]) || [];
        const newViolation = {
          type: violations.join(', '),
          timestamp: new Date().toISOString(),
          ai_analysis: analysis
        };

        await supabase
          .from('exam_sessions')
          .update({
            violation_count: (session.violation_count || 0) + 1,
            proctoring_violations: [...currentViolations, newViolation]
          })
          .eq('id', data.session_id);
      }
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
