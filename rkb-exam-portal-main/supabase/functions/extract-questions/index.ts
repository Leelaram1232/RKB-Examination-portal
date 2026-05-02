import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractRequest {
  upload_id: string;
  file_url: string;
}

interface ExtractedQuestion {
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string | null;
  section_name: string;
  suggested_marks: number;
  confidence_score: number;
  has_image: boolean;
  image_description?: string | null;
  subject?: string;
}

interface ExtractedImage {
  question_number: number;
  image_type: 'diagram' | 'figure' | 'graph' | 'circuit' | 'option_image';
  option_key?: string;
  description: string;
  position?: string;
}

type FileContent = { type: string; data: string; filename: string };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getMimeType(url: string): string {
  const extension = url.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[extension || ''] || 'application/octet-stream';
}

function normalizeCorrectOption(value: unknown): 'A' | 'B' | 'C' | 'D' | null {
  if (typeof value !== 'string') return null;
  let v = value.toUpperCase().trim();
  if (v === '1' || v === '(1)') v = 'A';
  if (v === '2' || v === '(2)') v = 'B';
  if (v === '3' || v === '(3)') v = 'C';
  if (v === '4' || v === '(4)') v = 'D';
  const m = v.match(/[ABCD]/);
  return m ? (m[0] as any) : null;
}

async function downloadFileAsDataUrl(fileUrl: string): Promise<FileContent> {
  const mimeType = getMimeType(fileUrl);
  const filename = decodeURIComponent(fileUrl.split('/').pop() || 'document');

  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  return {
    type: mimeType,
    filename,
    data: `data:${mimeType};base64,${base64}`,
  };
}

async function callAiWithTool<T>({
  lovableApiKey,
  model,
  systemPrompt,
  userText,
  file,
  tool,
  toolChoiceName,
  maxCompletionTokens,
  timeoutMs,
}: {
  lovableApiKey: string;
  model: string;
  systemPrompt: string;
  userText: string;
  file?: FileContent;
  tool: any;
  toolChoiceName: string;
  maxCompletionTokens: number;
  timeoutMs: number;
}): Promise<T> {
  const userContent: any[] = [{ type: 'text', text: userText }];

  if (file) {
    if (file.type === 'application/pdf') {
      userContent.push({
        type: 'file',
        file: {
          filename: file.filename,
          file_data: file.data,
        },
      });
    } else {
      userContent.push({ type: 'image_url', image_url: { url: file.data } });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('AI_TIMEOUT'), timeoutMs);

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        tools: [tool],
        tool_choice: { type: 'function', function: { name: toolChoiceName } },
        // GPT-5 family uses max_completion_tokens; gateway tolerates it.
        max_completion_tokens: maxCompletionTokens,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI gateway error ${resp.status}: ${t}`);
    }

    const data = await resp.json();
    const toolCalls = data?.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('AI did not return tool output');
    }

    const first = toolCalls[0];
    const argsStr = first?.function?.arguments;
    if (!argsStr) throw new Error('AI tool output missing arguments');

    return JSON.parse(argsStr) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAiWithToolWithRetry<T>(
  params: Parameters<typeof callAiWithTool<T>>[0],
  opts: { retries: number; label: string },
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await callAiWithTool<T>(params as any);
    } catch (e) {
      attempt++;
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = msg.includes('AI_TIMEOUT') || msg.includes('Abort') || msg.includes('aborted');
      console.warn(`[OCR] AI call failed (${opts.label}) attempt ${attempt}/${opts.retries + 1}:`, msg);

      if (attempt > opts.retries || !isTimeout) throw e;

      // Small backoff before retrying
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
  }
}

async function callMathpixPdf(fileUrl: string, appId: string, appKey: string): Promise<string> {
  console.log('[Mathpix] Submitting PDF for processing:', fileUrl);
  
  const submitResp = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: {
      'app_id': appId,
      'app_key': appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: fileUrl,
      conversion_formats: { mmd: true },
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
      // Multi-language OCR: Telugu, Hindi, Tamil, Kannada + English
      languages: ['en', 'te', 'hi', 'ta', 'kn'],
    }),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Mathpix submission failed (${submitResp.status}): ${err}`);
  }

  const { pdf_id } = await submitResp.json();
  console.log('[Mathpix] PDF processing started. ID:', pdf_id);

  // Poll for completion (max 5 minutes)
  const maxWait = 150; // 150 * 2s = 300s
  let attempts = 0;
  
  while (attempts < maxWait) {
    const statusResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { 'app_id': appId, 'app_key': appKey },
    });
    
    if (!statusResp.ok) {
      console.warn('[Mathpix] Status check failed, retrying...');
    } else {
      const statusData = await statusResp.json();
      const status = statusData.status;
      const percent = statusData.percent_done || 0;
      
      console.log(`[Mathpix] Status: ${status} (${percent}%)`);

      if (status === 'completed') {
        const mmdResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.mmd`, {
          headers: { 'app_id': appId, 'app_key': appKey },
        });
        if (!mmdResp.ok) throw new Error(`Failed to fetch MMD result: ${mmdResp.status}`);
        return await mmdResp.text();
      } else if (status === 'failed') {
        throw new Error(`Mathpix processing failed: ${statusData.error || 'unknown error'}`);
      }
    }

    await new Promise((r) => setTimeout(r, 2000));
    attempts++;
  }

  throw new Error('Mathpix processing timed out');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  console.log('=== EXTRACT QUESTIONS START ===');
  console.log('[OCR] Timestamp:', new Date().toISOString());

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Mathpix Credentials
    const mathpixAppId = Deno.env.get('MATHPIX_APP_ID') || 'rkbexaminationportal_b6716f_fa7a82';
    const mathpixAppKey = Deno.env.get('MATHPIX_APP_KEY') || '395cfd4b1202d3c2bd1586bcf6f2be11c78fc4d9f41d3a5521f68671dff13b57';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ExtractRequest = await req.json();
    console.log('[OCR] Request data:', JSON.stringify(body));

    if (!body.upload_id || !body.file_url) {
      return new Response(JSON.stringify({ error: 'Missing upload_id or file_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('exam_question_uploads').update({ status: 'processing' }).eq('id', body.upload_id);

    // Download file (we might not need this if using Mathpix but keep it for fallback)
    let file: FileContent | null = null;
    
    // NEW: Mathpix Path
    let mathpixMmd: string | null = null;
    if (mathpixAppId && mathpixAppKey && body.file_url.toLowerCase().endsWith('.pdf')) {
      try {
        console.log('[OCR] Attempting Mathpix extraction...');
        mathpixMmd = await callMathpixPdf(body.file_url, mathpixAppId, mathpixAppKey);
        console.log('[OCR] Mathpix extraction successful. Length:', mathpixMmd.length);
      } catch (e) {
        console.error('[OCR] Mathpix failed, falling back:', e instanceof Error ? e.message : String(e));
      }
    }

    if (!mathpixMmd) {
      try {
        file = await downloadFileAsDataUrl(body.file_url);
        console.log('[OCR] File downloaded, mime:', file.type, 'name:', file.filename, 'dataUrlBytes:', file.data.length);
      } catch (e) {
        console.error('[OCR] Failed to download file:', e);
        await supabase
          .from('exam_question_uploads')
          .update({ status: 'failed', error_message: 'Failed to download uploaded file', processed_at: new Date().toISOString() })
          .eq('id', body.upload_id);
        return new Response(JSON.stringify({ error: 'Failed to download uploaded file' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // If a local OCR-based extraction service is configured, prefer that path.
    let localOcrUrl = Deno.env.get('LOCAL_OCR_SERVICE_URL') || Deno.env.get('PADDLE_OCR_SERVICE_URL');
    if (!mathpixMmd && localOcrUrl) {
      console.log(`[OCR] External OCR service URL: ${localOcrUrl}`);
      
      // If running in local Supabase (Docker), localhost needs to be host.docker.internal
      if (localOcrUrl.includes('localhost') || localOcrUrl.includes('127.0.0.1')) {
        try {
          // Quick check if localhost is reachable from inside the container
          const check = await fetch(localOcrUrl, { method: 'HEAD' }).catch(() => null);
          if (!check || !check.ok) {
            const hostDockerUrl = localOcrUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
            console.log(`[OCR] localhost unreachable from container. Trying host.docker.internal: ${hostDockerUrl}`);
            localOcrUrl = hostDockerUrl;
          }
        } catch (e) {
          // Ignore
        }
      }

      try {
        console.log('[OCR] Routing request to:', localOcrUrl);
        const ocrResp = await fetch(localOcrUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            upload_id: body.upload_id,
            file_url: body.file_url,
          }),
        });

        if (!ocrResp.ok) {
          const txt = await ocrResp.text();
          throw new Error(`Local OCR service error ${ocrResp.status}: ${txt}`);
        }

        const payload = await ocrResp.json();
        const questions = (payload?.questions || []) as ExtractedQuestion[];
        const images = (payload?.images || []) as ExtractedImage[];

        if (!Array.isArray(questions) || questions.length === 0) {
          await supabase
            .from('exam_question_uploads')
            .update({
              status: 'failed',
              error_message: 'Local OCR service returned no questions',
              processed_at: new Date().toISOString(),
            })
            .eq('id', body.upload_id);

          return new Response(JSON.stringify({ error: 'No questions extracted from document (Local OCR)' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Ensure required fields have sane defaults
        const normalizedQuestions: ExtractedQuestion[] = questions.map((q, idx) => ({
          question_number: typeof q.question_number === 'number' ? q.question_number : idx + 1,
          question_text: q.question_text || '',
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          correct_option: q.correct_option ?? null,
          section_name: q.section_name || 'Section',
          suggested_marks: typeof q.suggested_marks === 'number' ? q.suggested_marks : 1,
          confidence_score: typeof q.confidence_score === 'number' ? q.confidence_score : 0,
          has_image: !!q.has_image,
          image_description: q.image_description ?? null,
          subject: q.subject,
        }));

        const totalQuestions = normalizedQuestions.length;
        const questionsWithAnswers = normalizedQuestions.filter((q) => q.correct_option !== null).length;
        const questionsWithImages = normalizedQuestions.filter((q) => q.has_image).length;
        const highConfidenceAnswers = normalizedQuestions.filter(
          (q) => q.correct_option !== null && q.confidence_score >= 0.9,
        ).length;
        const flaggedQuestions = normalizedQuestions.filter(
          (q) => q.correct_option !== null && q.confidence_score < 0.7,
        ).length;
        const needsReview =
          flaggedQuestions > 0 || questionsWithAnswers < totalQuestions * 0.5 || totalQuestions < 60;

        await supabase
          .from('exam_question_uploads')
          .update({
            status: 'completed',
            extracted_data: {
              questions: normalizedQuestions,
              answer_key_detected: questionsWithAnswers > 0,
              ocr_source: 'local_ocr',
            },
            extracted_images: images,
            processed_at: new Date().toISOString(),
            needs_review: needsReview,
            total_questions: totalQuestions,
            flagged_questions: flaggedQuestions,
            review_notes: needsReview
              ? `Local OCR extracted ${totalQuestions} questions. ${questionsWithAnswers} have answers. ${questionsWithImages} questions have diagrams/figures. Some review may be needed.`
              : `Local OCR extracted ${totalQuestions} questions with answers. ${questionsWithImages} questions have diagrams/figures.`,
          })
          .eq('id', body.upload_id);

        console.log('[OCR] Local OCR extraction complete. Questions:', totalQuestions);

        return new Response(
          JSON.stringify({
            success: true,
            questions: normalizedQuestions,
            images,
            count: totalQuestions,
            answers_detected: questionsWithAnswers,
            high_confidence_answers: highConfidenceAnswers,
            images_detected: questionsWithImages,
            flagged_count: flaggedQuestions,
            needs_review: needsReview,
            answer_key_detected: questionsWithAnswers > 0,
            source: 'local_ocr',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[OCR] Local OCR path failed, falling back to AI gateway:', msg);
        // Fall through to existing AI-based path below.
      }
    }

    // IMPORTANT: Asking the model to return all 75 questions in one JSON response gets truncated.
    // We do a 2-pass + batching strategy using tool-calling (structured output):
    //  1) Extract answer key mapping (small output)
    //  2) Extract questions in batches (15 at a time)

    // Prefer a faster model for PDFs to reduce timeouts.
    const model = 'google/gemini-2.5-flash';

    const answerKeyTool = {
      type: 'function',
      function: {
        name: 'extract_answer_key',
        description: 'Extract answer key mapping from a JEE/NEET style paper.',
        parameters: {
          type: 'object',
          properties: {
            answer_key_detected: { type: 'boolean' },
            answers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question_number: { type: 'integer' },
                  correct_option: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                },
                required: ['question_number', 'correct_option'],
                additionalProperties: false,
              },
            },
          },
          required: ['answer_key_detected', 'answers'],
          additionalProperties: false,
        },
      },
    };

    const batchTool = {
      type: 'function',
      function: {
        name: 'extract_questions_batch',
        description: 'Extract a contiguous batch of questions (with options and diagram notes) from a question paper.',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question_number: { type: 'integer' },
                  question_text: { type: 'string' },
                  option_a: { type: 'string' },
                  option_b: { type: 'string' },
                  option_c: { type: 'string' },
                  option_d: { type: 'string' },
                  section_name: { type: 'string' },
                  subject: { type: 'string' },
                  suggested_marks: { type: 'integer' },
                  has_image: { type: 'boolean' },
                  image_description: { type: ['string', 'null'] },
                },
                required: [
                  'question_number',
                  'question_text',
                  'option_a',
                  'option_b',
                  'option_c',
                  'option_d',
                  'section_name',
                  'subject',
                  'suggested_marks',
                  'has_image',
                  'image_description',
                ],
                additionalProperties: false,
              },
            },
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question_number: { type: 'integer' },
                  image_type: { type: 'string', enum: ['diagram', 'figure', 'graph', 'circuit', 'option_image'] },
                  option_key: { type: ['string', 'null'] },
                  description: { type: 'string' },
                  position: { type: ['string', 'null'] },
                },
                required: ['question_number', 'image_type', 'option_key', 'description', 'position'],
                additionalProperties: false,
              },
            },
            done: { type: 'boolean' },
          },
          required: ['questions', 'images', 'done'],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `You extract questions from competitive exam papers.
Rules:
- Preserve LaTeX inside $...$ for math/science.
- IMPORTANT: Support Telugu (తెలుగు), Hindi, Tamil, Kannada and English text. Preserve regional-language text EXACTLY as-is. Do NOT translate.
- For has_image: true if a diagram/graph/figure/circuit is referenced or present.
- image_description should be a concise description when has_image is true.
- If the OCR text contains image URLs (e.g., https://cdn.mathpix.com/...), include them in image_description so they can be extracted later.
- NEVER include the full paper; return ONLY tool output.`;

    // Pass 1: answer key only
    console.log('[OCR] Pass1: extracting answer key mapping...');
    type AnswerKeyOut = { answer_key_detected: boolean; answers: { question_number: number; correct_option: 'A' | 'B' | 'C' | 'D' }[] };

    let answerKey: AnswerKeyOut = { answer_key_detected: false, answers: [] };
    try {
      answerKey = await callAiWithToolWithRetry<AnswerKeyOut>(
        {
          lovableApiKey,
          model,
          systemPrompt,
          userText: mathpixMmd 
            ? `Identify the answer key in the following text extracted via Mathpix. Provide the question number to correct option (A, B, C, or D) mapping for all questions. Mathpix text: \n\n${mathpixMmd}`
            : 'Find the ANSWER KEY section/table (usually at the end). Return mapping for ALL questions (1..90). If missing, return answer_key_detected=false and empty answers.',
          file: file || undefined,
          tool: answerKeyTool,
          toolChoiceName: 'extract_answer_key',
          maxCompletionTokens: 2500,
          timeoutMs: 58_000,
        },
        { retries: 1, label: 'answer_key' },
      );
    } catch (e) {
      // Non-fatal; we can still extract questions without answers.
      console.warn('[OCR] Answer key extraction failed (continuing):', e instanceof Error ? e.message : String(e));
    }

    const answerMap = new Map<number, 'A' | 'B' | 'C' | 'D'>();
    for (const a of answerKey.answers || []) {
      if (typeof a?.question_number === 'number' && ['A', 'B', 'C', 'D'].includes(a.correct_option)) {
        answerMap.set(a.question_number, a.correct_option);
      }
    }

    console.log('[OCR] Answer key detected:', answerKey.answer_key_detected, 'mapped answers:', answerMap.size);

    // Pass 2: questions in batches
    const batchSize = 15;
    const maxQuestions = 90;

    const allQuestions: ExtractedQuestion[] = [];
    const allImages: ExtractedImage[] = [];

    let start = 1;
    let safety = 0;

    while (start <= maxQuestions) {
      safety++;
      if (safety > 12) break; // hard stop

      // Allow admin to cancel by setting upload status = 'cancelled'
      const { data: latestUpload } = await supabase
        .from('exam_question_uploads')
        .select('status')
        .eq('id', body.upload_id)
        .maybeSingle();

      if (latestUpload?.status === 'cancelled') {
        console.warn('[OCR] Cancelled by admin');
        await supabase
          .from('exam_question_uploads')
          .update({ status: 'cancelled', processed_at: new Date().toISOString(), review_notes: 'Cancelled by admin.' })
          .eq('id', body.upload_id);

        return new Response(JSON.stringify({ success: false, cancelled: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const end = Math.min(start + batchSize - 1, maxQuestions);
      console.log(`[OCR] Pass2: extracting questions ${start}-${end}...`);

      type BatchOut = {
        questions: Omit<ExtractedQuestion, 'correct_option' | 'confidence_score'>[];
        images: ExtractedImage[];
        done: boolean;
      };

      let batch: BatchOut;
      try {
        batch = await callAiWithToolWithRetry<BatchOut>(
          {
            lovableApiKey,
            model,
            systemPrompt,
            userText: mathpixMmd
              ? `Identify and extract ONLY questions ${start} to ${end} (inclusive) from the following text extracted via Mathpix. Preserve LaTeX. If a question is missing, skip it. Return done=true ONLY if you reached the end of the text. Mathpix text: \n\n${mathpixMmd}`
              : `Extract ONLY questions ${start} to ${end} (inclusive). If a question is missing in the document, skip it. Return done=true ONLY if the paper ends before ${end}.`,
            file: file || undefined,
            tool: batchTool,
            toolChoiceName: 'extract_questions_batch',
            maxCompletionTokens: 4200,
            timeoutMs: 58_000,
          },
          { retries: 2, label: `batch_${start}_${end}` },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[OCR] Batch extraction failed:', msg);
        await supabase
          .from('exam_question_uploads')
          .update({ status: 'failed', error_message: `Batch ${start}-${end} failed: ${msg}`, processed_at: new Date().toISOString() })
          .eq('id', body.upload_id);

        return new Response(JSON.stringify({ error: 'Batch extraction failed', details: msg }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const batchQuestions = (batch.questions || []).filter((q) => typeof q.question_number === 'number');
      const batchImages = batch.images || [];

      // Merge answers from answer key
      for (const q of batchQuestions) {
        const qn = q.question_number;
        const keyAnswer = answerMap.get(qn) ?? null;
        const correct_option = normalizeCorrectOption(keyAnswer);

        const confidence = correct_option
          ? answerKey.answer_key_detected
            ? 0.95
            : 0.6
          : 0;

        allQuestions.push({
          ...q,
          correct_option,
          confidence_score: confidence,
        });
      }

      for (const img of batchImages) allImages.push(img);

      // Progress update so UI can show something even for long runs
      await supabase
        .from('exam_question_uploads')
        .update({
          status: 'processing',
          total_questions: allQuestions.length,
          review_notes: `Extracted ${allQuestions.length} questions so far (batch ${start}-${end}).`,
        })
        .eq('id', body.upload_id);

      if (batch.done) break;
      start += batchSize;
    }

    // Normalize & deduplicate by question_number with hard caps.
    // - Only keep questions with numbers in [1, maxQuestions]
    // - At most ONE question per number (first non‑empty text wins)
    const normalizedQuestions = allQuestions
      .filter((q) => {
        const n = q.question_number;
        const text = (q.question_text || '').trim();
        return typeof n === 'number' && n >= 1 && n <= maxQuestions && text.length > 0;
      })
      .sort((a, b) => a.question_number - b.question_number);

    const dedupedMap = new Map<number, ExtractedQuestion>();
    for (const q of normalizedQuestions) {
      if (!dedupedMap.has(q.question_number)) {
        dedupedMap.set(q.question_number, q);
      }
    }

    const dedupedQuestions = Array.from(dedupedMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, q]) => q);

    const totalQuestions = dedupedQuestions.length;
    const questionsWithAnswers = dedupedQuestions.filter((q) => q.correct_option !== null).length;
    const questionsWithImages = dedupedQuestions.filter((q) => q.has_image).length;
    const highConfidenceAnswers = dedupedQuestions.filter((q) => q.correct_option !== null && q.confidence_score >= 0.9).length;
    const flaggedQuestions = dedupedQuestions.filter((q) => q.correct_option !== null && q.confidence_score < 0.7).length;
    const needsReview = flaggedQuestions > 0 || questionsWithAnswers < totalQuestions * 0.5 || totalQuestions < 60;

    console.log('[OCR] Extraction stats:');
    console.log('  - Total questions:', totalQuestions);
    console.log('  - Questions with detected answers:', questionsWithAnswers);
    console.log('  - High confidence answers:', highConfidenceAnswers);
    console.log('  - Questions with images:', questionsWithImages);

    if (totalQuestions === 0) {
      await supabase
        .from('exam_question_uploads')
        .update({
          status: 'failed',
          error_message: 'No questions extracted from document',
          processed_at: new Date().toISOString(),
        })
        .eq('id', body.upload_id);

      return new Response(JSON.stringify({ error: 'No questions extracted from document' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('exam_question_uploads')
      .update({
        status: 'completed',
        extracted_data: {
          questions: dedupedQuestions,
          answer_key_detected: answerKey.answer_key_detected,
        },
        extracted_images: allImages,
        processed_at: new Date().toISOString(),
        needs_review: needsReview,
        total_questions: totalQuestions,
        flagged_questions: flaggedQuestions,
        review_notes: needsReview
          ? `Extracted ${totalQuestions} questions. Answer key ${answerKey.answer_key_detected ? 'was' : 'was NOT'} detected (${questionsWithAnswers} answers). ${questionsWithImages} questions have diagrams/figures. Some review may be needed.`
          : `Extracted ${totalQuestions} questions with answers. ${questionsWithImages} questions have diagrams/figures.`,
      })
      .eq('id', body.upload_id);

    console.log('=== EXTRACT QUESTIONS COMPLETE ===');

    return new Response(
      JSON.stringify({
        success: true,
        questions: dedupedQuestions,
        images: allImages,
        count: totalQuestions,
        answers_detected: questionsWithAnswers,
        high_confidence_answers: highConfidenceAnswers,
        images_detected: questionsWithImages,
        flagged_count: flaggedQuestions,
        needs_review: needsReview,
        answer_key_detected: answerKey.answer_key_detected,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[OCR] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
