import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractRequest {
  file_url: string;
  upload_id: string;
}

interface ExtractedImage {
  page_number: number;
  image_data: string;
  description?: string;
  question_index?: number;
}

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_url, upload_id } = await req.json() as ExtractRequest;
    console.log('[extract-pdf-images] Starting extraction for upload:', upload_id);
    console.log('[extract-pdf-images] File URL:', file_url);

    if (!file_url || !upload_id) {
      throw new Error('file_url and upload_id are required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to processing
    await supabase
      .from('exam_question_uploads')
      .update({ status: 'extracting_images' })
      .eq('id', upload_id);

    // Download the file
    console.log('[extract-pdf-images] Downloading file...');
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBuffer);
    const contentType = fileResponse.headers.get('content-type') || 'application/pdf';
    const dataUrl = `data:${contentType};base64,${fileBase64}`;

    console.log('[extract-pdf-images] File downloaded, size:', fileBuffer.byteLength);

    // Use AI to extract and describe images from the PDF
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('[extract-pdf-images] Calling AI for image extraction...');

    const systemPrompt = `You are an expert at analyzing exam documents. Your task is to:
1. Identify all pages that contain diagrams, figures, graphs, charts, or illustrations
2. For each visual element found, describe:
   - Which page it appears on
   - What type of visual it is (diagram, graph, chart, figure, etc.)
   - A brief description of what it shows
   - Which question number it relates to (if identifiable)

Return ONLY the tool call with the extracted information.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this exam document and identify all diagrams, figures, and visual elements. Return details about each image found.'
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_images',
              description: 'Extract and describe all visual elements found in the document',
              parameters: {
                type: 'object',
                properties: {
                  images: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        page_number: { type: 'number', description: 'Page number where the image appears' },
                        image_type: { type: 'string', description: 'Type of visual: diagram, graph, chart, figure, circuit, etc.' },
                        description: { type: 'string', description: 'Brief description of what the image shows' },
                        related_question: { type: 'number', description: 'Question number this image relates to, if identifiable' },
                        position: { type: 'string', description: 'Where on the page: top, middle, bottom, left, right' }
                      },
                      required: ['page_number', 'image_type', 'description']
                    }
                  },
                  total_pages: { type: 'number', description: 'Total number of pages in the document' },
                  has_diagrams: { type: 'boolean', description: 'Whether the document contains any diagrams' }
                },
                required: ['images', 'total_pages', 'has_diagrams']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_images' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[extract-pdf-images] AI error:', errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    console.log('[extract-pdf-images] AI response received');

    let extractedData: { images: ExtractedImage[], total_pages: number, has_diagrams: boolean } = {
      images: [],
      total_pages: 0,
      has_diagrams: false
    };

    // Parse tool call response
    if (aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        extractedData = JSON.parse(aiResult.choices[0].message.tool_calls[0].function.arguments);
        console.log('[extract-pdf-images] Extracted data:', extractedData);
      } catch (e) {
        console.error('[extract-pdf-images] Failed to parse AI response:', e);
      }
    }

    // Update the upload record with extracted image info
    const { error: updateError } = await supabase
      .from('exam_question_uploads')
      .update({
        status: 'completed',
        extracted_images: extractedData,
        processed_at: new Date().toISOString()
      })
      .eq('id', upload_id);

    if (updateError) {
      console.error('[extract-pdf-images] Update error:', updateError);
    }

    console.log('[extract-pdf-images] Extraction complete. Found', extractedData.images?.length || 0, 'images');

    return new Response(
      JSON.stringify({
        success: true,
        images_found: extractedData.images?.length || 0,
        total_pages: extractedData.total_pages,
        has_diagrams: extractedData.has_diagrams,
        images: extractedData.images
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[extract-pdf-images] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
