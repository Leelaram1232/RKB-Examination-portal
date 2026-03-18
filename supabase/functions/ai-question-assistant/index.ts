import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AssistantRequest {
  messages: Message[];
  file_url?: string;
  exam_id?: string;
  subject_id?: string;
}

type GroqChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

async function callMathpixPdf(
  fileUrl: string,
  appId: string,
  appKey: string,
  pageRanges?: string
): Promise<string> {
  console.log('[Mathpix] Submitting PDF for processing:', fileUrl);

  // Use polling (no SSE) to avoid Mathpix streaming 504s/compute limits.
  // We request a lightweight text format (`md`) rather than `mmd` to reduce compute.
  const submitBody: Record<string, unknown> = {
    url: fileUrl,
    conversion_formats: { md: true },
    enable_tables_fallback: true,
    include_diagram_text: true,
  };

  if (pageRanges) {
    submitBody.page_ranges = pageRanges;
  }

  const submitResp = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: {
      'app_id': appId,
      'app_key': appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(submitBody),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Mathpix submission failed (${submitResp.status}): ${err}`);
  }

  const { pdf_id } = await submitResp.json();

  const maxAttempts = (() => {
    const raw = Deno.env.get('MATHPIX_MAX_ATTEMPTS') || '40';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 40;
  })();

  const pollIntervalMs = (() => {
    const raw = Deno.env.get('MATHPIX_POLL_INTERVAL_MS') || '1500';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1500;
  })();

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const statusResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { 'app_id': appId, 'app_key': appKey },
    });

    if (statusResp.ok) {
      const statusData = await statusResp.json();
      if (attempts < 3 || attempts === maxAttempts - 1) {
        console.log('[Mathpix] Status:', {
          attempt: attempts + 1,
          maxAttempts,
          status: statusData?.status,
        });
      }

      if (statusData.status === 'completed') {
        const mdResp = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.md`, {
          headers: { 'app_id': appId, 'app_key': appKey },
        });
        if (!mdResp.ok) {
          throw new Error(`Mathpix md download failed (${mdResp.status})`);
        }

        const mdText = await mdResp.text();

        // Diagram label OCR is stored inside `lines.json` (not always included in `md`/mmd),
        // so we append it to the OCR context to improve question generation from diagrams/tables.
        let linesText = '';
        try {
          const linesResp = await fetch(
            `https://api.mathpix.com/v3/pdf/${pdf_id}.lines.json`,
            { headers: { 'app_id': appId, 'app_key': appKey } }
          );
          if (linesResp.ok) {
            const linesJson: any = await linesResp.json();
            const pages = Array.isArray(linesJson?.pages) ? linesJson.pages : [];
            const maxChars = 20000;
            for (const page of pages) {
              const lines = Array.isArray(page?.lines) ? page.lines : [];
              for (const line of lines) {
                const t =
                  (typeof line?.text_display === 'string' && line.text_display.trim()
                    ? line.text_display
                    : typeof line?.text === 'string'
                      ? line.text
                      : '') || '';
                if (t.trim()) linesText += t.trim() + '\n';
                if (linesText.length > maxChars) break;
              }
              if (linesText.length > maxChars) break;
            }
          }
        } catch (_e) {
          // Non-fatal: continue with mdText only.
        }

        return linesText ? `${mdText}\n\n[LINES_JSON]\n${linesText}` : mdText;
      }

      if (statusData.status === 'failed') {
        throw new Error(
          `Mathpix processing failed: ${statusData?.error || statusData?.message || 'unknown error'}`
        );
      }
    } else if (statusResp.status === 504) {
      console.warn('[Mathpix] Status check 504. Retrying...');
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    'OCR taking too long for the selected page range. Please resend with a smaller range like "pages 1-10" or "pages 1-5".'
  );
}

function extractPageRangesFromPrompt(text: string): string | null {
  const t = (text || '').toLowerCase().trim();
  if (!t) return null;

  // User intent shortcuts
  if (
    t.includes('everything') ||
    t.includes('all pages') ||
    t.includes('all page') ||
    t.includes('entire pdf') ||
    t.includes('whole pdf') ||
    t.includes('whole document')
  ) {
    // Mathpix can hit compute limits for large ranges.
    // Start with a larger-but-safe chunk first; user can request the next chunk later.
    return '1-20';
  }

  // Examples:
  // "page 1-10"
  // "pages 1 to 5"
  const rangeMatch = t.match(/pages?\s*(\d+)\s*(?:-|to)\s*(\d+)/i);
  if (rangeMatch) {
    const a = rangeMatch[1];
    const b = rangeMatch[2];
    return `${a}-${b}`;
  }

  // Example:
  // "pages 1,2,3"
  const listMatch = t.match(/pages?\s*((?:\d+\s*,\s*)*\d+)/i);
  if (listMatch) {
    const cleaned = listMatch[1].replace(/\s+/g, '');
    if (cleaned) return cleaned;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const groqKey = Deno.env.get('GROQ_API_KEY');
    const mathpixId = Deno.env.get('MATHPIX_APP_ID');
    const mathpixKey = Deno.env.get('MATHPIX_APP_KEY');
    
    if (!groqKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const { messages, file_url, exam_id, subject_id } = await req.json() as AssistantRequest;
    console.log('[Assistant] Request received:', { 
      messageCount: messages?.length, 
      hasFile: !!file_url,
      exam_id,
      subject_id 
    });

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    let ocrContext = '';
    let ocrError: string | null = null;
    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const requestedPageRanges = extractPageRangesFromPrompt(lastUserMessage);
    // Mathpix can time out on whole large PDFs, so default to a small chunk.
    const pageRangesToUse = requestedPageRanges || '1-10';
    if (file_url) {
      if (!mathpixId || !mathpixKey) {
        console.warn('[Assistant] File uploaded but Mathpix keys are missing.');
        ocrError = 'Mathpix OCR keys not configured on server.';
      } else {
        try {
          ocrContext = await callMathpixPdf(
            file_url,
            mathpixId,
            mathpixKey,
            pageRangesToUse
          );
          console.log('[Assistant] OCR success, length:', ocrContext.length);

          // Quick sanity log so we can confirm OCR text arrived.
          console.log('[Assistant] OCR preview:', ocrContext.substring(0, 400));
          
          // Truncate extremely large OCR text to prevent memory crashes
          if (ocrContext.length > 50000) {
            console.log('[Assistant] Truncating OCR text from', ocrContext.length, 'to 50000');
            ocrContext = ocrContext.substring(0, 50000) + '... [TRUNCATED DUE TO SIZE]';
          }
        } catch (e: unknown) {
          console.error('[Assistant] OCR failed:', e);
          const msg = e instanceof Error ? e.message : String(e);
          ocrError = `Could not extract text from file: ${msg}`;
        }
      }
    }

    // If OCR fails, don't let the model hallucinate random questions.
    if (file_url && ocrError) {
      return new Response(
        JSON.stringify({
          content: `OCR failed for pages ${pageRangesToUse}. ${ocrError}`,
          questions: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Ensure we don't send empty user messages to Groq
    const sanitizedMessages = messages.map(m => {
      // If a message is very long (e.g. from a previous OCR run), we might want to keep it but be careful
      return {
        role: m.role,
        content: m.content || (m.role === 'user' ? '[No text content provided]' : '')
      };
    });

    const systemPrompt = `You are an expert Exam Question Assistant for JEE/NEET.
Generate or extract high-quality questions based on the provided context or prompt.

### QUESTION TYPES
1. **MCQ**: Default. 4 options (option_a to option_d), correct_option (A/B/C/D).
2. **FILL_BLANK**: Only if requested. No options required. Needs correct_answer.

### CRITICAL OUTPUT RULES
- **ALWAYS INCLUDE QUESTIONS**: If the user asks to generate N questions, you MUST output N question objects (never output only an intro sentence).
- **TAGS REQUIRED**: You MUST wrap the JSON array inside <questions_json> and </questions_json> tags.
- **NO MARKDOWN**: Do not wrap JSON in \`\`\` fences.
- **MCQ IS DEFAULT**: Unless "numerical" or "fill in blank" is requested, always stick to MCQ.
- **AVOID REPETITION**: Never repeat a question from the conversation history.
- **USE OCR FIRST**: If OCR Extracted Content is provided (file uploaded), you MUST generate questions strictly from that OCR text. Do not invent unrelated questions.

### JSON SCHEMA
[
  {
    "question_text": "text with LaTeX $...$",
    "question_type": "MCQ" | "FILL_BLANK",
    "option_a": "Text...", "option_b": "Text...", "option_c": "Text...", "option_d": "Text...",
    "correct_option": "A|B|C|D",
    "correct_answer": "Numerical/Textual answer",
    "section_name": "Section A",
    "marks": 4
  }
]

Current context:
${ocrContext ? `OCR Extracted Content: \n${ocrContext}` : 'No file uploaded.'}
Subject ID: ${subject_id || 'Not specified'}
Exam ID: ${exam_id || 'Not specified'}`;

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...sanitizedMessages
    ];

    async function callGroq(
      messages: { role: string; content: string }[],
      temperature = 0.2
    ): Promise<GroqChatCompletion> {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature,
        }),
      });

      const text = await resp.text();
      if (!resp.ok) {
        let errJson: unknown = undefined;
        try {
          errJson = JSON.parse(text) as unknown;
        } catch (_e) {
          void _e;
        }
        const errMsg = (() => {
          if (typeof errJson !== 'object' || !errJson) return text;
          const maybeError = (errJson as Record<string, unknown>).error;
          if (typeof maybeError !== 'object' || !maybeError) return text;
          const maybeMsg = (maybeError as Record<string, unknown>).message;
          return typeof maybeMsg === 'string' && maybeMsg.trim() ? maybeMsg : text;
        })();
        throw new Error(`Groq API Error: ${errMsg}`);
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON response from Groq API');
      }
      return json as GroqChatCompletion;
    }

    console.log('[Assistant] Calling Groq with model: llama-3.3-70b-versatile');
    const groqData = await callGroq(groqMessages, 0.2);

    const assistantContent = groqData.choices?.[0]?.message?.content ?? '';
    console.log('[Assistant] RAW CONTENT:', assistantContent.substring(0, 500) + '...');

    const extractQuestionsFromText = (text: string) => {
      const cleaned = (text || '')
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();

      const tryParseJson = (jsonText: string) => {
        // Some models return LaTeX like \sqrt, \theta inside JSON strings without escaping.
        // That breaks strict JSON parsing ("Bad escaped character"). We repair by escaping
        // backslashes that are not valid JSON escape starters.
        const repairInvalidBackslashes = (s: string) =>
          s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

        try {
          return JSON.parse(jsonText) as unknown;
        } catch (e1) {
          try {
            const repaired = repairInvalidBackslashes(jsonText);
            return JSON.parse(repaired) as unknown;
          } catch (e2) {
            const msg1 = e1 instanceof Error ? e1.message : String(e1);
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            console.error('[Assistant] JSON parse failed after repair:', { msg1, msg2 });
            throw e2;
          }
        }
      };

      // 1) Preferred: <questions_json>...</questions_json>
      const tagMatch = cleaned.match(/<questions_json>\s*([\s\S]*?)\s*<\/questions_json>/i);
      if (tagMatch) {
        try {
          return tryParseJson(tagMatch[1].trim());
        } catch (e) {
          console.error('[Assistant] Tagged JSON parse failed:', (e as Error).message);
        }
      }

      // 2) Best-effort: first JSON array in the text
      const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
      if (arrMatch) {
        try {
          return tryParseJson(arrMatch[1]);
        } catch (e) {
          console.error('[Assistant] Array JSON parse failed:', (e as Error).message);
        }
      }

      return [];
    };

    const extracted = extractQuestionsFromText(assistantContent);
    let questions: unknown[] = Array.isArray(extracted) ? extracted : [];

    // If model didn't comply, run a fast "format fix" pass using the assistant output
    if (!Array.isArray(questions) || questions.length === 0) {
      console.warn('[Assistant] No questions parsed. Running format-fix call...');
      const fixPrompt = `Return ONLY the JSON array wrapped in <questions_json> tags.
No explanation. No intro line. No markdown. No code fences.

Convert the following content into the exact JSON schema array. If questions are missing, generate the requested questions now.

CONTENT TO CONVERT/COMPLETE:
${assistantContent}`;

      const fixMessages = [
        { role: 'system', content: systemPrompt },
        ...sanitizedMessages,
        { role: 'user', content: fixPrompt },
      ];

      const fixed = await callGroq(fixMessages, 0.0);
      const fixedText = fixed.choices?.[0]?.message?.content ?? '';
      console.log('[Assistant] FIXED RAW CONTENT:', fixedText.substring(0, 500) + '...');
      const fixedQuestions = extractQuestionsFromText(fixedText);
      if (Array.isArray(fixedQuestions) && fixedQuestions.length > 0) {
        questions = fixedQuestions;
      }
    }

    // Final guarantee: if still empty, force-generate from the last user prompt
    if (!Array.isArray(questions) || questions.length === 0) {
      console.warn('[Assistant] Still no questions after fix. Forcing generation...');
      const lastUser = [...sanitizedMessages].reverse().find((m) => m.role === 'user')?.content ||
        'Generate 6 JEE Mains level questions.';
      const forcePrompt = `Generate questions for this request. Output ONLY <questions_json>...</questions_json>.
REQUEST:
${lastUser}`;
      const forceMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: forcePrompt }];
      const forced = await callGroq(forceMessages, 0.0);
      const forcedText = forced.choices?.[0]?.message?.content ?? '';
      const forcedQuestions = extractQuestionsFromText(forcedText);
      if (Array.isArray(forcedQuestions) && forcedQuestions.length > 0) {
        questions = forcedQuestions;
      }
    }

    const cleanedContent = assistantContent
      .replace(/<questions_json>[\s\S]*?<\/questions_json>/i, '')
      .trim();

    const contentWithOcrNote =
      file_url && pageRangesToUse
        ? `OCR processed for pages ${pageRangesToUse}.\n\n${cleanedContent}`
        : cleanedContent;

    return new Response(JSON.stringify({ 
      content: contentWithOcrNote,
      questions 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Assistant] Error:', msg);
    return new Response(JSON.stringify({ 
      error: msg,
      details: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
