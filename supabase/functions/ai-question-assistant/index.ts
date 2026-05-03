// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Deno edge runtime import via URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

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
  action?: 'generate' | 'review' | 'audit_exam';
  /** Chat + audit LLM routing: groq | gemini | both (Groq draft + Gemini merge). */
  llm_mode?: 'groq' | 'gemini' | 'both';
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
): Promise<{ ocrText: string; processedPages: number; readableChars: number }> {
  console.log('[Mathpix] Submitting PDF for processing:', fileUrl);

  // Use polling (no SSE) to avoid Mathpix streaming 504s/compute limits.
  // We request a lightweight text format (`md`) rather than `mmd` to reduce compute.
  const submitBody: Record<string, unknown> = {
    url: fileUrl,
    conversion_formats: { md: true },
    enable_tables_fallback: true,
    include_diagram_text: true,
    // Enable multi-language OCR including Telugu, Hindi, Tamil, etc.
    languages: ['en', 'te', 'hi', 'ta', 'kn'],
    // Preserve images as URLs so we can attach them to questions
    include_smiles: false,
    include_asciimath: false,
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

        let mdText = await mdResp.text();

        // Mathpix sometimes returns embedded base64 SVG for some scanned PDFs.
        // That text is not useful for question extraction, so strip it out.
        mdText = mdText.replace(
          /data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/g,
          '[EMBEDDED_SVG_OMITTED]'
        );

        // Diagram label OCR is stored inside `lines.json` (not always included in `md`/mmd),
        // so we append it to the OCR context to improve question generation from diagrams/tables.
        let linesText = '';
        let processedPages = 0;
        try {
          const linesResp = await fetch(
            `https://api.mathpix.com/v3/pdf/${pdf_id}.lines.json`,
            { headers: { 'app_id': appId, 'app_key': appKey } }
          );
          if (linesResp.ok) {
            const linesJson = await linesResp.json() as unknown;
            const maybePages = (linesJson as { pages?: unknown }).pages;
            const pages = Array.isArray(maybePages) ? (maybePages as unknown[]) : [];
            processedPages = pages.length;

            const maxChars = 20000;
            for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
              const page = pages[pageIndex] as { lines?: unknown };
              const maybeLines = page.lines;
              const lines = Array.isArray(maybeLines) ? maybeLines : [];

              linesText += `\n\n[PAGE ${pageIndex + 1}]\n`;

              for (const line of lines) {
                const lineObj = line as { text_display?: unknown; text?: unknown };
                const t =
                  (typeof lineObj.text_display === 'string' && lineObj.text_display.trim()
                    ? lineObj.text_display
                    : typeof lineObj.text === 'string'
                      ? lineObj.text
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

        const ocrText = linesText
          ? `${mdText}\n\n[LINES_JSON]\n${linesText}`
          : mdText;
        const readableChars = ocrText.replace(/[^A-Za-z0-9]+/g, '').length;
        return { ocrText, processedPages, readableChars };
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

  // Single-page requests: "page 7" -> "7-7"
  const singlePageMatch = t.match(/page\s*(\d+)/i);
  if (singlePageMatch) {
    const n = singlePageMatch[1];
    return `${n}-${n}`;
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

type PageRange = { a: number; b: number };

function parsePageSpec(spec: string): PageRange[] {
  const raw = String(spec || '').trim();
  if (!raw) return [];

  // Normalize common separators: "1 to 3" => "1-3"
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/to/gi, '-')
    .replace(/–/g, '-'); // en-dash

  const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
  const ranges: PageRange[] = [];

  for (const part of parts) {
    const mRange = part.match(/^(\d+)-(\d+)$/);
    if (mRange) {
      const a = Number.parseInt(mRange[1], 10);
      const b = Number.parseInt(mRange[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        ranges.push({ a: Math.min(a, b), b: Math.max(a, b) });
      }
      continue;
    }
    const mSingle = part.match(/^(\d+)$/);
    if (mSingle) {
      const n = Number.parseInt(mSingle[1], 10);
      if (Number.isFinite(n) && n > 0) ranges.push({ a: n, b: n });
    }
  }

  // Merge overlaps / adjacent ranges to reduce OCR calls
  ranges.sort((x, y) => x.a - y.a || x.b - y.b);
  const merged: PageRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...r });
      continue;
    }
    if (r.a <= last.b + 1) {
      last.b = Math.max(last.b, r.b);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// --- Gemini (optional): set GEMINI_API_KEY secret on the Edge Function; never commit keys. ---
async function callGeminiRaw(
  apiKey: string,
  systemInstruction: string,
  userText: string,
  preferJson: boolean,
  maxOutputTokens?: number
): Promise<string> {
  const model = (Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash').trim();
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const doReq = (jsonMode: boolean) => {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.15,
      maxOutputTokens: maxOutputTokens ?? 8192,
    };
    if (jsonMode) generationConfig.responseMimeType = 'application/json';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig,
      }),
    });
  };

  let resp = await doReq(preferJson);
  let txt = await resp.text();
  if (!resp.ok && preferJson) {
    resp = await doReq(false);
    txt = await resp.text();
  }
  if (!resp.ok) {
    throw new Error(`Gemini HTTP ${resp.status}: ${txt.slice(0, 500)}`);
  }
  const j = JSON.parse(txt) as Record<string, unknown>;
  const candidates = j.candidates as unknown[] | undefined;
  const first = candidates?.[0] as Record<string, unknown> | undefined;
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = content?.parts as unknown[] | undefined;
  const part0 = parts?.[0] as Record<string, unknown> | undefined;
  const text = part0?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini returned no text');
  }
  return text.trim();
}

async function callGeminiJson(
  apiKey: string,
  systemInstruction: string,
  userText: string,
  maxOutputTokens?: number
): Promise<unknown> {
  const raw = await callGeminiRaw(apiKey, systemInstruction, userText, true, maxOutputTokens);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as unknown;
    throw new Error('Gemini JSON parse failed');
  }
}

async function callGroqApi(
  groqKey: string,
  messages: { role: string; content: string }[],
  temperature = 0.2,
  max_tokens = 8000
): Promise<GroqChatCompletion> {
  const maxRetries = 3;
  let lastError: unknown = undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature,
        max_tokens,
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

      const isRateLimit = /Rate limit reached/i.test(errMsg) || resp.status === 429;
      if (isRateLimit && attempt < maxRetries) {
        const waitMatch = errMsg.match(/try again in\s*([0-9.]+)s/i);
        const waitSeconds = waitMatch ? Number.parseFloat(waitMatch[1]) : 2.5;
        const waitMs = Math.max(0, Math.ceil(waitSeconds * 1000)) + 500;
        console.warn('[callGroqApi] Groq rate limit. Retrying in', waitMs, 'ms...');
        await new Promise((r) => setTimeout(r, waitMs));
        lastError = errMsg;
        continue;
      }

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

  throw new Error(`Groq call failed after retries: ${String(lastError)}`);
}

function extractLeadingJsonObject(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function parseAuditItemsFromLlmText(text: string): Array<{ id?: string; findings?: unknown }> {
  const t = (text || '').trim();
  if (!t) return [];
  const candidates = [extractLeadingJsonObject(t), t].filter(Boolean) as string[];
  for (const blob of candidates) {
    try {
      const parsed = JSON.parse(blob) as { items?: Array<{ id?: string; findings?: unknown }> };
      if (Array.isArray(parsed.items)) return parsed.items;
    } catch {
      /* try next */
    }
  }
  return [];
}

async function applyGeminiRefinementsToQuestions(
  questions: Record<string, unknown>[],
  apiKey: string
): Promise<Record<string, unknown>[]> {
  if (questions.length === 0) return questions;

  const slim = questions.map((q, i) => {
    const qt = String(q.question_type || 'MCQ').toUpperCase();
    const isFill =
      qt.includes('FILL') || qt.includes('NUMERICAL') || qt.includes('BLANK');
    return {
      i,
      question_type: q.question_type,
      question_text: String(q.question_text || '').slice(0, 3500),
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      correct_answer: q.correct_answer,
      is_fill: isFill,
    };
  });

  const system = `You are an elite exam validator. You solve every question mentally to verify the answer.
CRITICAL RULES:
1. For MCQ questions (is_fill: false):
   - Solve the question yourself.
   - Ensure 'correct_option' (A, B, C, or D) is the correct answer.
   - If 'correct_option' is wrong but the correct answer IS in another option, update 'correct_option'.
   - If the correct answer is NOT present in any option, YOU MUST change the text of one of the wrong options to the correct answer.
   - Ensure all option texts are distinct and meaningful (no placeholders like "Option A").
2. For FILL_BLANK (is_fill: true):
   - Ensure 'correct_answer' is present and mathematically/factually correct.
Return ONLY JSON: { "fixes": [ { "i": number, "correct_option"?: "A"|"B"|"C"|"D", "option_a"?: string, "option_b"?: string, "option_c"?: string, "option_d"?: string, "correct_answer"?: string, "note"?: string } ] }
Include ONLY questions that need changes. If all are perfect, return {"fixes":[]}.`;

  const parsed = (await callGeminiJson(apiKey, system, JSON.stringify(slim))) as {
    fixes?: Array<Record<string, unknown>>;
  };
  const fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
  const out = questions.map((q) => ({ ...q }));
  for (const f of fixes) {
    const idx = typeof f.i === 'number' ? f.i : Number(String(f.i));
    if (!Number.isFinite(idx) || idx < 0 || idx >= out.length) continue;
    const row = out[idx] as Record<string, unknown>;
    const co = f.correct_option;
    if (typeof co === 'string') {
      const u = co.trim().toUpperCase();
      if (u === 'A' || u === 'B' || u === 'C' || u === 'D') row.correct_option = u;
    }
    for (const k of ['option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'] as const) {
      if (typeof f[k] === 'string') row[k] = f[k];
    }
    if (typeof f.note === 'string' && f.note.trim()) {
      row.gemini_note = f.note.trim();
    }
  }
  return out;
}

async function applyGeminiRefinementsToQuestionsChunked(
  questions: Record<string, unknown>[],
  apiKey: string,
  chunkSize = 6
): Promise<Record<string, unknown>[]> {
  if (questions.length === 0) return questions;
  const out = questions.map((q) => ({ ...q }));
  for (let i = 0; i < out.length; i += chunkSize) {
    const slice = out.slice(i, i + chunkSize) as Record<string, unknown>[];
    const patched = await applyGeminiRefinementsToQuestions(slice, apiKey);
    for (let j = 0; j < patched.length; j++) {
      out[i + j] = patched[j] as Record<string, unknown>;
    }
  }
  return out;
}

type ExamQuestionRow = {
  id: string;
  question_number: number;
  section_name: string | null;
  question_text: string | null;
  question_type: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string | null;
  correct_answer: string | null;
  marks: number | null;
};

function normalizeMcqLetter(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string') return null;
  const u = s.trim().toUpperCase();
  if (u === 'A' || u === 'B' || u === 'C' || u === 'D') return u;
  return null;
}

function heuristicExamIssues(q: ExamQuestionRow): string[] {
  const issues: string[] = [];
  if (q.marks != null && Number(q.marks) <= 0) {
    issues.push('Marks should be a positive number.');
  }
  const qt = (q.question_type || 'MCQ').toUpperCase();
  const isNumerical =
    qt.includes('NUMERICAL') || qt.includes('FILL') || qt.includes('BLANK');

  if (!q.question_text || !String(q.question_text).trim()) {
    issues.push('Question text is empty.');
  }

  if (isNumerical) {
    if (!q.correct_answer || !String(q.correct_answer).trim()) {
      issues.push('Numerical / fill-in question is missing correct_answer.');
    }
    return issues;
  }

  const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
  const labels = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 4; i++) {
    if (!opts[i] || !String(opts[i]).trim()) {
      issues.push(`Option ${labels[i]} is empty.`);
    }
  }

  const co = normalizeMcqLetter(q.correct_option);
  if (!co) {
    issues.push('MCQ correct_option is missing or not A/B/C/D.');
  } else {
    const idx = co.charCodeAt(0) - 65;
    const chosen = opts[idx];
    if (!chosen || !String(chosen).trim()) {
      issues.push(`correct_option is ${co} but that option has no text.`);
    }
  }

  const norm = opts
    .map((o) => (o ? String(o).trim().toLowerCase() : ''))
    .filter(Boolean);
  const uniq = new Set(norm);
  if (uniq.size !== norm.length) {
    issues.push('Two or more options have identical text (ambiguous).');
  }

  const lens = opts.map((o) => (o ? String(o).trim().length : 0));
  if (lens.every((n) => n > 0) && lens.every((n) => n <= 2)) {
    issues.push('All MCQ options are very short — verify they are not placeholders.');
  }

  return issues;
}

async function fetchAllQuestionsForExam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  examId: string
): Promise<ExamQuestionRow[]> {
  const sel =
    'id, question_number, section_name, question_text, question_type, option_a, option_b, option_c, option_d, correct_option, correct_answer, marks';
  const pageSize = 500;
  const acc: ExamQuestionRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let res = await supabase
      .from('questions')
      .select(sel)
      .eq('exam_id', examId)
      .order('question_number', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (res.error) {
      console.warn('[Audit] order() query failed, retrying without order:', res.error.message);
      res = await supabase.from('questions').select(sel).eq('exam_id', examId).range(offset, offset + pageSize - 1);
      if (res.error) throw new Error(`Failed to load questions: ${res.error.message}`);
    }

    const batch = (res.data || []) as ExamQuestionRow[];
    acc.push(...batch);
    if (batch.length < pageSize) break;
  }

  acc.sort((a, b) => (a.question_number || 0) - (b.question_number || 0));
  console.log('[Audit] Loaded question rows:', acc.length);
  return acc;
}

function mergeAuditFindings(
  items: Array<{ id: string; issues: string[]; severity: 'ok' | 'warning' | 'error' }>,
  byId: Map<string, string[]>,
  prefix: string
) {
  for (const item of items) {
    const extra = byId.get(item.id) || [];
    for (const e of extra) {
      if (!e.trim()) continue;
      const tagged = e.startsWith('[') ? e : `${prefix} ${e}`;
      if (!item.issues.includes(tagged)) item.issues.push(tagged);
    }
    if (extra.length > 0 && item.severity === 'ok') item.severity = 'warning';
  }
}

function buildAuditPayloadRow(q: ExamQuestionRow) {
  return {
    id: q.id,
    question_number: q.question_number,
    question_type: q.question_type,
    stem: String(q.question_text || '').slice(0, 3500),
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    correct_option: q.correct_option,
    correct_answer: q.correct_answer,
    heuristic_issues: heuristicExamIssues(q),
  };
}

async function geminiAuditSlice(
  geminiKey: string,
  slice: ExamQuestionRow[],
  expectedIds: string[]
): Promise<Map<string, string[]>> {
  const byId = new Map<string, string[]>();
  const system = `You are a strict exam-paper reviewer.
You MUST return JSON: {"items":[{"id":"<EXACT_UUID>","findings":["..."]}]}
with EXACTLY one object per id in REQUIRED_IDS, same order, same ids.
For each MCQ: verify correct_option (A-D) matches the only correct answer for the stem; flag wrong key, missing answer among options, or ambiguous stem/options.
For NUMERICAL/FILL: verify correct_answer is present and plausible.
findings: max 6 short bullets; use [] if nothing beyond heuristic_issues.`;

  const payload = slice.map((q) => buildAuditPayloadRow(q));
  const userBlock = `REQUIRED_IDS (must all appear in output.items in this order):\n${JSON.stringify(expectedIds)}\n\nQUESTIONS_JSON:\n${JSON.stringify(payload)}`;

  const parsed = (await callGeminiJson(geminiKey, system, userBlock, 16384)) as {
    items?: Array<{ id?: string; findings?: unknown }>;
  };

  for (const it of parsed.items || []) {
    const id = typeof it.id === 'string' ? it.id : '';
    if (!id) continue;
    const findings = Array.isArray(it.findings) ? it.findings.map((x) => String(x)).filter(Boolean) : [];
    byId.set(id, findings);
  }

  for (const id of expectedIds) {
    if (byId.has(id)) continue;
    const q = slice.find((x) => x.id === id);
    if (!q) continue;
    try {
      const one = buildAuditPayloadRow(q);
      const p2 = (await callGeminiJson(
        geminiKey,
        system,
        `Return ONLY valid JSON: {"items":[{"id":"${id}","findings":[]}]}\n\nSingle question:\n${JSON.stringify(one)}`,
        8192
      )) as { items?: Array<{ id?: string; findings?: unknown }> };
      const it0 = (p2.items || [])[0];
      const findings = Array.isArray(it0?.findings)
        ? (it0.findings as unknown[]).map((x) => String(x)).filter(Boolean)
        : [];
      byId.set(id, findings);
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      console.warn('[Audit] Gemini single-question fallback failed', id, e);
      byId.set(id, ['[Gemini] Automated review incomplete for this row (API error).']);
    }
  }

  return byId;
}

async function groqAuditSingle(groqKey: string, q: ExamQuestionRow): Promise<string[]> {
  const one = buildAuditPayloadRow(q);
  const system = `Return ONLY JSON: {"items":[{"id":"${q.id}","findings":["short note"]}]}
findings max 5; [] if no issues. MCQ: verify correct_option; numerical: verify correct_answer.`;
  const data = await callGroqApi(
    groqKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(one) },
    ],
    0.05,
    3500
  );
  const text = data.choices?.[0]?.message?.content ?? '';
  const items = parseAuditItemsFromLlmText(text);
  const hit = items.find((x) => x.id === q.id);
  const findings = Array.isArray(hit?.findings)
    ? (hit!.findings as unknown[]).map((x) => String(x)).filter(Boolean)
    : [];
  return findings;
}

async function groqAuditSlice(groqKey: string, slice: ExamQuestionRow[]): Promise<Map<string, string[]>> {
  const byId = new Map<string, string[]>();
  const payload = slice.map((q) => buildAuditPayloadRow(q));
  const system = `Return ONLY JSON: {"items":[{"id":"uuid","findings":["note"]}]}
One entry per input question (same ids). MCQ: check correct_option vs stem; numerical: check correct_answer. Max 5 findings each. No markdown, no prose outside JSON.`;

  const data = await callGroqApi(
    groqKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    0.1,
    6000
  );
  const text = data.choices?.[0]?.message?.content ?? '';
  for (const it of parseAuditItemsFromLlmText(text)) {
    const id = typeof it.id === 'string' ? it.id : '';
    if (!id) continue;
    const findings = Array.isArray(it.findings) ? it.findings.map((x) => String(x)).filter(Boolean) : [];
    byId.set(id, findings);
  }

  for (const q of slice) {
    if (byId.has(q.id)) continue;
    try {
      const findings = await groqAuditSingle(groqKey, q);
      byId.set(q.id, findings);
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      console.warn('[Audit] Groq single-question fallback failed', q.id, e);
      byId.set(q.id, ['[Groq] Review incomplete for this row (API/parse error).']);
    }
  }

  return byId;
}

async function runExamQualityAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  examId: string,
  opts: {
    groqKey: string;
    geminiKey: string;
    llmMode: 'groq' | 'gemini' | 'both';
  }
): Promise<{
  exam_id: string;
  total_questions: number;
  questions_with_issues: number;
  items: Array<{
    id: string;
    question_number: number;
    section_name: string | null;
    question_type: string | null;
    issues: string[];
    severity: 'ok' | 'warning' | 'error';
  }>;
  markdownSummary: string;
  gemini_used: boolean;
  groq_used: boolean;
  warnings: string[];
}> {
  const { groqKey, geminiKey, llmMode } = opts;
  const warnings: string[] = [];

  if (llmMode === 'gemini' && !geminiKey) {
    throw new Error('GEMINI_API_KEY required for Gemini quality mode');
  }
  if (llmMode === 'groq' && !groqKey) {
    throw new Error('GROQ_API_KEY required for Groq quality mode');
  }
  if (llmMode === 'both' && (!geminiKey || !groqKey)) {
    throw new Error('Both quality mode requires GROQ_API_KEY and GEMINI_API_KEY');
  }

  const list = await fetchAllQuestionsForExam(supabase, examId);
  const items = list.map((q) => {
    const issues = heuristicExamIssues(q);
    const hasErr = issues.some(
      (x) =>
        x.includes('empty') ||
        x.includes('missing') ||
        x.includes('not A/B/C/D')
    );
    const severity: 'ok' | 'warning' | 'error' =
      issues.length === 0 ? 'ok' : hasErr ? 'error' : 'warning';
    return {
      id: q.id,
      question_number: q.question_number,
      section_name: q.section_name,
      question_type: q.question_type,
      issues,
      severity,
    };
  });

  let gemini_used = false;
  let groq_used = false;
  const chunkAi = 3;
  const useGemini = (llmMode === 'gemini' || llmMode === 'both') && !!geminiKey;
  const useGroq = (llmMode === 'groq' || llmMode === 'both') && !!groqKey;

  for (let start = 0; start < list.length; start += chunkAi) {
    const slice = list.slice(start, start + chunkAi);
    const expectedIds = slice.map((q) => q.id);

    if (useGemini) {
      try {
        const map = await geminiAuditSlice(geminiKey, slice, expectedIds);
        mergeAuditFindings(items, map, '[Gemini]');
        gemini_used = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[Audit] Gemini chunk failed:', e);
        warnings.push(`Gemini batch Q#${slice[0]?.question_number ?? '?'}–${slice[slice.length - 1]?.question_number ?? '?'}: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 180));
    }

    if (useGroq) {
      try {
        const mapG = await groqAuditSlice(groqKey, slice);
        mergeAuditFindings(items, mapG, '[Groq]');
        groq_used = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[Audit] Groq chunk failed:', e);
        warnings.push(`Groq batch Q#${slice[0]?.question_number ?? '?'}–${slice[slice.length - 1]?.question_number ?? '?'}: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 180));
    }
  }

  for (const it of items) {
    const hasErr = it.issues.some(
      (x) =>
        x.includes('empty') ||
        x.includes('missing') ||
        x.includes('not A/B/C/D') ||
        /wrong (letter|option|key)/i.test(x)
    );
    if (it.issues.length === 0) it.severity = 'ok';
    else if (hasErr) it.severity = 'error';
    else it.severity = 'warning';
  }

  const questions_with_issues = items.filter((i) => i.issues.length > 0).length;
  const lines: string[] = [
    `## Exam quality check`,
    ``,
    `- Total questions loaded: **${list.length}**`,
    `- With at least one issue: **${questions_with_issues}**`,
    `- AI passes: **${[useGroq && groq_used ? 'Groq' : '', useGemini && gemini_used ? 'Gemini' : ''].filter(Boolean).join(' + ') || 'none'}**`,
    ``,
  ];
  for (const it of items) {
    if (it.issues.length === 0) continue;
    lines.push(`### Q${it.question_number} (${it.section_name || '—'})`);
    for (const iss of it.issues) lines.push(`- ${iss}`);
    lines.push('');
  }
  if (questions_with_issues === 0) {
    lines.push('No issues reported after rules + selected AI review.');
  }

  return {
    exam_id: examId,
    total_questions: list.length,
    questions_with_issues,
    items,
    markdownSummary: lines.join('\n'),
    gemini_used,
    groq_used,
    warnings,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, file_url, exam_id, subject_id, action, llm_mode: llmModeBody } = body as AssistantRequest;
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
    const groqKey = (Deno.env.get('GROQ_API_KEY') || '').trim();
    const llm_mode: 'groq' | 'gemini' | 'both' =
      llmModeBody === 'gemini' || llmModeBody === 'both' ? llmModeBody : 'groq';

    if (action === 'audit_exam') {
      if (!exam_id) {
        throw new Error('exam_id is required for exam quality audit');
      }
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
      }
      const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')?.trim();
      const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')?.trim();

      let auditClient = createClient(supabaseUrl, supabaseKey);
      let questionFetch: 'primary' | 'external' | 'primary_fallback' = 'primary';
      if (extUrl && extKey) {
        auditClient = createClient(extUrl, extKey);
        questionFetch = 'external';
        console.log('[Audit] Using EXTERNAL_SUPABASE_* for questions table');
      }

      let audit = await runExamQualityAudit(auditClient, exam_id, { groqKey, geminiKey, llmMode: llm_mode });
      if (audit.total_questions === 0 && questionFetch === 'external') {
        console.warn('[Audit] 0 rows from external; retrying primary SUPABASE_URL');
        auditClient = createClient(supabaseUrl, supabaseKey);
        questionFetch = 'primary_fallback';
        audit = await runExamQualityAudit(auditClient, exam_id, { groqKey, geminiKey, llmMode: llm_mode });
      }

      const BUILD_MARKER = 'ai-question-assistant@2026-05-04.audit';
      return new Response(
        JSON.stringify({
          content: audit.markdownSummary,
          questions: [],
          audit,
          meta: {
            build: BUILD_MARKER,
            gemini_used: audit.gemini_used,
            groq_used: audit.groq_used,
            questions_count: audit.total_questions,
            llm_mode: llm_mode,
            question_fetch: questionFetch,
            audit_warnings: audit.warnings,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mathpixId = Deno.env.get('MATHPIX_APP_ID');
    const mathpixKey = Deno.env.get('MATHPIX_APP_KEY');

    if (llm_mode === 'groq' && !groqKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    if (llm_mode === 'gemini' && !geminiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    if (llm_mode === 'both' && (!groqKey || !geminiKey)) {
      throw new Error('Both mode requires GROQ_API_KEY and GEMINI_API_KEY');
    }

    if (!messages || !Array.isArray(messages)) {
      throw new Error('No messages provided');
    }

    console.log('[Assistant] Request received:', {
      messageCount: messages?.length,
      hasFile: !!file_url,
      exam_id,
      subject_id,
      action: action || 'generate',
      llm_mode,
    });

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    let ocrContext = '';
    let processedPagesCount = 0;
    let ocrError: string | null = null;
    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const requestedPageRanges = extractPageRangesFromPrompt(lastUserMessage);
    // Mathpix can time out on whole large PDFs, so default to a small chunk when user didn't specify.
    const pageSpecToUse = requestedPageRanges || '1-10';
    const requestedRanges = parsePageSpec(pageSpecToUse);
    // Fallback safety: if parsing failed, keep the default chunk.
    const rangesToUse = requestedRanges.length > 0 ? requestedRanges : [{ a: 1, b: 10 }];

    const parseRange = (range: string): { a: number; b: number } | null => {
      const m = String(range || '').trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return null;
      const a = Number.parseInt(m[1], 10);
      const b = Number.parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
      return { a, b };
    };

    const expandRange = (range: string, pad = 1) => {
      const r = parseRange(range);
      if (!r) return range;
      const start = Math.max(1, r.a - pad);
      const end = Math.max(start, r.b + pad);
      return `${start}-${end}`;
    };

    const totalPagesRequested = rangesToUse.reduce((sum, r) => sum + (r.b - r.a + 1), 0);
    if (file_url) {
      if (!mathpixId || !mathpixKey) {
        console.warn('[Assistant] File uploaded but Mathpix keys are missing.');
        ocrError = 'Mathpix OCR keys not configured on server.';
      } else {
        try {
          // Any range support:
          // - If total pages requested is small, OCR page-by-page (robust vs image-only pages).
          // - If total pages requested is large, OCR in safe chunks (reduces timeouts).
          const collected: string[] = [];
          let totalReadable = 0;
          let pagesWithText = 0;
          let processedTotal = 0;

          const OCR_CHUNK_SIZE = 10;

          const ocrOneRangeChunked = async (start: number, end: number) => {
            for (let s = start; s <= end; s += OCR_CHUNK_SIZE) {
              const e = Math.min(end, s + OCR_CHUNK_SIZE - 1);
              const chunkSpec = `${s}-${e}`;
              const chunk = await callMathpixPdf(file_url, mathpixId, mathpixKey, chunkSpec);
              processedTotal += (e - s + 1);
              if (chunk.ocrText?.trim()) {
                collected.push(`\n\n[REQUESTED_PAGES ${chunkSpec}]\n` + chunk.ocrText);
              }
              totalReadable += chunk.readableChars || 0;
              if ((chunk.readableChars || 0) >= 200) pagesWithText += 1;
            }
          };

          if (totalPagesRequested <= 12) {
            for (const r of rangesToUse) {
              for (let p = r.a; p <= r.b; p++) {
                const pageRange = `${p}-${p}`;
                try {
                  const per = await callMathpixPdf(file_url, mathpixId, mathpixKey, pageRange);
                  processedTotal += 1;
                  if (per.ocrText?.trim()) {
                    collected.push(`\n\n[REQUESTED_PAGE ${p}]\n` + per.ocrText);
                  }
                  totalReadable += per.readableChars || 0;
                  if ((per.readableChars || 0) >= 200) pagesWithText += 1;
                } catch (e) {
                  console.warn('[Assistant] OCR failed for page', p, 'err=', e instanceof Error ? e.message : String(e));
                }
              }
            }
          } else {
            for (const r of rangesToUse) {
              await ocrOneRangeChunked(r.a, r.b);
            }
          }

          processedPagesCount = processedTotal;
          ocrContext = collected.join('\n');

          console.log('[Assistant] OCR merged pages:', { requested: pageSpecToUse, pagesWithText, totalReadable, processedTotal });

          if (totalReadable < 150) {
            console.warn(
              '[Assistant] Very low total readable OCR text for requested pages',
              pageSpecToUse,
              'totalReadable=',
              totalReadable
            );
          }

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

    // If OCR completely failed (e.g., network/auth error), don't let the model hallucinate random questions.
    if (file_url && ocrError) {
      return new Response(
        JSON.stringify({
          content: `OCR failed for pages ${pageSpecToUse}. ${ocrError}`,
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

    // Groq on-demand tier has strict token/TPM limits.
    // When OCR is large, we must be very aggressive to stay below TPM.
    // (Groq "Requested" in this error is still high even after truncation,
    // so we reduce more.)
    const MAX_OCR_CONTEXT_CHARS = 8000;
    const MAX_MESSAGE_CHARS = 1200;

    const truncateText = (s: string, maxChars: number) => {
      if (!s) return s;
      if (s.length <= maxChars) return s;
      return s.slice(0, maxChars) + '... [TRUNCATED]';
    };

    // Truncate OCR context again right before embedding into the system prompt.
    // (We already truncate inside Mathpix, but we keep this as defense-in-depth.)
    if (ocrContext && ocrContext.length > MAX_OCR_CONTEXT_CHARS) {
      console.log('[Assistant] Truncating OCR context for Groq from', ocrContext.length, 'to', MAX_OCR_CONTEXT_CHARS, 'chars');
      ocrContext = truncateText(ocrContext, MAX_OCR_CONTEXT_CHARS);
    }

    const trimmedMessages = sanitizedMessages
      .map((m) => ({
        ...m,
        content: truncateText(m.content || '', MAX_MESSAGE_CHARS),
      }))
      // Keep only the most recent part of the conversation (older messages add tokens but usually don't help extraction).
      .slice(-(file_url ? 2 : 6));

    const generateSystemPrompt = `You are an expert Exam Question Assistant for JEE/NEET and regional-language exams.
Generate or extract high-quality questions based on the provided context or prompt.

### LANGUAGE SUPPORT
- You MUST support **Telugu (తెలుగు)**, Hindi, Tamil, Kannada and English.
- If the OCR text contains Telugu or other regional language text, preserve it EXACTLY as-is in the question_text and options.
- Do NOT translate regional language text to English unless explicitly asked.
- Mixed-language questions (e.g. English + Telugu) are common — preserve them.

### QUESTION TYPES
1. **MCQ**: Default. 4 options (option_a to option_d), correct_option (A/B/C/D).
2. **FILL_BLANK**: Only if requested. No options required. Needs correct_answer.

### DIAGRAM / IMAGE HANDLING
- If the OCR text contains image references like \`![...](...) \` or \`\\includegraphics{...}\` or \`[IMAGE]\` or Mathpix image URLs, you MUST:
  1. Set "has_image": true for that question.
  2. Put the image URL (if present in OCR) in "image_url" field.
  3. Put a description in "image_description" field.
- Common Mathpix image URL patterns: \`https://cdn.mathpix.com/...\` — preserve these URLs exactly.
- If a question references a figure/diagram/graph/circuit but no URL is found, still set has_image: true and describe it.

### CRITICAL OUTPUT RULES
- **ALWAYS INCLUDE QUESTIONS**: If the user asks to generate N questions, you MUST output EXACTLY N question objects. Do not output more or fewer than requested.
- **RIGOROUS QUALITY CHECK**: You MUST solve the generated question mentally or step-by-step internally to verify that the correct answer is actually present in exactly one of the 4 options (option_a, option_b, option_c, option_d).
- **ADMIN MCQ STANDARD**: Each MCQ must have four suitable, distinct options (no placeholders like "None of the above" unless appropriate) and exactly ONE defensible correct answer; correct_option must be A/B/C/D matching that option only.
- **CORRECT OPTION MATCH**: Ensure the 'correct_option' field correctly points to the letter (A, B, C, or D) that holds the right answer. Do not mislabel the correct option.
- **TAGS REQUIRED**: You MUST wrap the JSON array inside <questions_json> and </questions_json> tags.
- **NO MARKDOWN**: Do not wrap JSON in \`\`\` fences.
- **MCQ IS DEFAULT**: Unless "numerical" or "fill in blank" is requested, always stick to MCQ.
- **AVOID REPETITION**: Never repeat a question from the conversation history.
- **USE OCR FIRST**: If OCR Extracted Content is provided (file uploaded), you MUST generate questions strictly from that OCR text. Do not invent unrelated questions.

### ANSWER KEY / SOLUTIONS
- If OCR Extracted Content contains an answer key, correct answer list, or solution table, you MUST use it to fill:
-  'correct_option' for MCQ questions, and/or
-  'correct_answer' for fill-in-the-blank/numerical questions.
- Match by 'question_number' if present in the OCR.
- If question numbers are not present, match by the order of appearance in the OCR (Q1 uses the first answer entry, etc.).
- Do NOT guess correct answers when the answer key is present; derive them from the OCR.
- ALWAYS verify that the option text corresponds correctly to the answer key letter.

### JSON SCHEMA
[
  {
    "question_text": "text with LaTeX $...$ or Telugu తెలుగు",
    "question_type": "MCQ" | "FILL_BLANK",
    "option_a": "Text...", "option_b": "Text...", "option_c": "Text...", "option_d": "Text...",
    "correct_option": "A|B|C|D",
    "correct_answer": "Numerical/Textual answer",
    "section_name": "Section A",
    "marks": 4,
    "has_image": false,
    "image_url": null,
    "image_description": null
  }
]

Current context:
${ocrContext ? `OCR Extracted Content: \n${truncateText(ocrContext, MAX_OCR_CONTEXT_CHARS)}` : 'No file uploaded.'}
Subject ID: ${subject_id || 'Not specified'}
Exam ID: ${exam_id || 'Not specified'}`;

    const reviewSystemPrompt = `You are an expert Math and Science Exam Reviewer.
Your task is to SOLVE each question and verify if the options and 'correct_option' are accurate.

### REVIEW CRITERIA
1. SOLVE the question yourself to find the true answer.
2. Check if your solved answer matches the designated 'correct_option'.
3. If the 'correct_option' points to the wrong option, but another option has the right answer, update the 'correct_option' to the correct letter (A, B, C, or D).
4. If the correct answer is NOT present in any of the options, update the text of one option (preferably the one marked as 'correct_option') to include the right answer.

### CRITICAL OUTPUT RULES
- Return ONLY the questions that HAVE MISTAKES.
- For each returned question, provide the CORRECTED values for all fields.
- KEEP 'review_notes' VERY SHORT AND SIMPLE. Max 1-2 sentences. Examples: "Correct answer is 12, changed correct_option from A to C." or "Correct answer is 5, updated option_a to 5."
- DO NOT provide long explanations, step-by-step solutions, or assumptions in the notes. Just state the correct answer and what you changed.
- If all questions are perfect, return an empty array: <questions_json>[]</questions_json>
- **TAGS REQUIRED**: You MUST wrap the JSON array inside <questions_json> and </questions_json> tags.
- **NO MARKDOWN**: Do not wrap JSON in \`\`\` fences.

### JSON SCHEMA FOR MISTAKES
[
  {
    "id": "original_id",
    "question_number": 1,
    "question_text": "...",
    "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
    "correct_option": "A|B|C|D",
    "review_notes": "Correct answer is 10. Updated correct_option to B."
  }
]`;

    const systemPrompt = action === 'review' ? reviewSystemPrompt : generateSystemPrompt;

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...trimmedMessages
    ];

    const callGroq = (messages: { role: string; content: string }[], temperature = 0.2) =>
      callGroqApi(groqKey!, messages, temperature, 8000);

    const callLlmFlex = async (
      messages: { role: string; content: string }[],
      temperature: number,
      maxTok = 8000
    ): Promise<string> => {
      if (llm_mode === 'gemini') {
        const sys = messages.find((m) => m.role === 'system')?.content || '';
        const rest = messages.filter((m) => m.role !== 'system');
        const convo = rest.map((m) => `${m.role}: ${m.content}`).join('\n\n');
        return await callGeminiRaw(geminiKey, sys, convo, false, Math.min(maxTok, 8192));
      }
      if (llm_mode === 'both') {
        const g = await callGroqApi(groqKey!, messages, temperature, maxTok);
        const draft = g.choices?.[0]?.message?.content ?? '';
        const sys = messages.find((m) => m.role === 'system')?.content || '';
        const merged = await callGeminiRaw(
          geminiKey,
          sys,
          `Polish this assistant output (fix <questions_json> / JSON only if needed; keep meaning):\n${draft.slice(0, 80000)}`,
          false,
          8192
        );
        return merged.trim() ? merged : draft;
      }
      const g = await callGroqApi(groqKey!, messages, temperature, maxTok);
      return g.choices?.[0]?.message?.content ?? '';
    };

    let assistantContent = '';
    if (llm_mode === 'groq') {
      console.log('[Assistant] LLM mode: Groq (llama-3.3-70b-versatile)');
      const groqData = await callGroq(groqMessages, 0.2);
      assistantContent = groqData.choices?.[0]?.message?.content ?? '';
    } else if (llm_mode === 'gemini') {
      console.log('[Assistant] LLM mode: Gemini');
      const convo = trimmedMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
      assistantContent = await callGeminiRaw(geminiKey, systemPrompt, convo, false, 8192);
    } else {
      console.log('[Assistant] LLM mode: Both (Groq draft → Gemini merge)');
      const groqData = await callGroq(groqMessages, 0.2);
      const draft = groqData.choices?.[0]?.message?.content ?? '';
      const refineUser = `Another model (Groq) produced the draft below. Perform a rigorous quality check and improve it:
(1) Preserve intent, language (Telugu/Hindi etc.), and all OCR-derived technical details.
(2) QUALITY CHECK: Solve each question mentally. If the correct answer is missing from the options, YOU MUST edit an option to include the correct answer.
(3) ENSURE correct_option (A/B/C/D) points to the actual correct answer.
(4) Remove any hallucinated or placeholder text.
(5) Fix broken JSON or LaTeX backslash issues ($...$ is fine, but avoid invalid escape characters in JSON strings).
(6) Output ONLY the complete final assistant message including <questions_json>...</questions_json>.

DRAFT:
${draft.slice(0, 120000)}`;
      const merged = await callGeminiRaw(geminiKey, systemPrompt, refineUser, false, 8192);
      assistantContent = merged.trim() ? merged : draft;
    }
    console.log('[Assistant] RAW CONTENT:', assistantContent.substring(0, 500) + '...');
    // Track the best "raw" LLM text we have (may include <questions_json>).
    // If parsing into `questions` fails, we will return this text in `content` so the UI can still parse it.
    let bestRawTextForUi = assistantContent;

    const extractQuestionsFromText = (text: string) => {
      const cleaned = (text || '')
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();

      const tryParseJson = (jsonText: string) => {
        const repairLatexBackslashes = (s: string) => {
          let out = '';
          let inString = false;
          let escape = false;
          const isHex = (ch: string) => /^[0-9a-fA-F]$/.test(ch);
          for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (!inString) {
              out += ch;
              if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) inString = true;
              continue;
            }
            if (escape) {
              out += ch;
              escape = false;
              continue;
            }
            if (ch === '\\') {
              const next = s[i + 1] ?? '';
              const next2 = s[i + 2] ?? '';
              const isDefinitelyJsonEscape = (() => {
                if (!next) return false;
                if (next === '"' || next === '\\' || next === '/') return true;
                if (next === 'u') {
                  const h1 = s[i + 2] ?? '', h2 = s[i + 3] ?? '', h3 = s[i + 4] ?? '', h4 = s[i + 5] ?? '';
                  return Boolean(h1 && h2 && h3 && h4 && isHex(h1) && isHex(h2) && isHex(h3) && isHex(h4));
                }
                if (/[bfnrt]/.test(next)) {
                  if (next2 && /[A-Za-z]/.test(next2)) return false;
                  return true;
                }
                return false;
              })();
              out += isDefinitelyJsonEscape ? '\\' : '\\\\';
              escape = true;
              continue;
            }
            if (ch === '"') {
              inString = false;
              out += ch;
              continue;
            }
            out += ch;
          }
          return out;
        };

        try {
          return JSON.parse(jsonText) as unknown;
        } catch (e1) {
          try {
            const repaired = repairLatexBackslashes(jsonText);
            const fixedCommas = repaired.replace(/,(\s*[\]}])/g, '$1');
            return JSON.parse(fixedCommas) as unknown;
          } catch (e2) {
            // Attempt to recover truncated JSON if the LLM stopped mid-generation
            try {
              const repaired = repairLatexBackslashes(jsonText);
              // Aggressive truncation recovery: find the last complete object in the array
              const lastBrace = repaired.lastIndexOf('}');
              if (lastBrace > 0) {
                const truncatedFixed = repaired.substring(0, lastBrace + 1) + ']';
                const parsed = JSON.parse(truncatedFixed);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  console.warn('[Assistant] Recovered truncated JSON array. Length:', parsed.length);
                  return parsed;
                }
              }
            } catch (e3) {
              console.warn('[Assistant] Truncation recovery failed:', (e3 as Error).message);
            }
            
            const msg1 = e1 instanceof Error ? e1.message : String(e1);
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            console.error('[Assistant] JSON parse failed after repair:', { msg1, msg2 });
            throw e2;
          }
        }
      };

      // 1) Preferred: <questions_json>...</questions_json> (tolerate missing closing tag if truncated)
      const tagMatch = cleaned.match(/<questions_json>\s*([\s\S]*?)(?:<\/questions_json>|$)/i);
      if (tagMatch && tagMatch[1].trim()) {
        try {
          return tryParseJson(tagMatch[1].trim());
        } catch (e) {
          console.error('[Assistant] Tagged JSON parse failed:', (e as Error).message);
        }
      }

      // 2) Best-effort: first JSON array in the text (tolerate missing closing bracket if truncated)
      const arrMatch = cleaned.match(/(\[[\s\S]*)/);
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

    // Groq sometimes outputs LaTeX inside JSON strings using sequences like `\f`, `\r`, `\t`, etc.
    // JSON.parse treats these as valid JSON escapes and converts them into control characters
    // (form feed, carriage return, tab...). This breaks LaTeX rendering later.
    // We reverse that by mapping these control characters back to `\f`, `\r`, `\t`, etc.
    const sanitizeLatexControlEscapes = (value: unknown): unknown => {
      if (typeof value === 'string') {
        // Avoid regex literals containing control chars (eslint). Use split/join instead.
        return value
          .split(String.fromCharCode(8))
          .join('\\b') // backspace -> \b
          .split(String.fromCharCode(12))
          .join('\\f') // form feed -> \f
          .split(String.fromCharCode(13))
          .join('\\r') // carriage return -> \r
          .split(String.fromCharCode(9))
          .join('\\t') // tab -> \t
          .split(String.fromCharCode(11))
          .join('\\v'); // vertical tab -> \v
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeLatexControlEscapes);
      }
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          out[k] = sanitizeLatexControlEscapes(v);
        }
        return out;
      }
      return value;
    };

    // If model didn't comply, run a fast "format fix" pass using the assistant output
    if (!Array.isArray(questions) || questions.length === 0) {
      console.warn('[Assistant] No questions parsed. Running format-fix call...');
      const assistantContentForFix = truncateText(assistantContent, 2500);
      const fixPrompt = `Return ONLY the JSON array wrapped in <questions_json> tags.
No explanation. No intro line. No markdown. No code fences.

Convert the following content into the exact JSON schema array. If questions are missing, generate the requested questions now.

CONTENT TO CONVERT/COMPLETE:
${assistantContentForFix}`;

      const fixMessages = [
        { role: 'system', content: systemPrompt },
        ...sanitizedMessages,
        { role: 'user', content: fixPrompt },
      ];

      const fixedText = await callLlmFlex(fixMessages, 0.0, 8000);
      console.log('[Assistant] FIXED RAW CONTENT:', fixedText.substring(0, 500) + '...');
      if (fixedText && fixedText.trim()) bestRawTextForUi = fixedText;
      const fixedQuestions = extractQuestionsFromText(fixedText);
      if (Array.isArray(fixedQuestions) && fixedQuestions.length > 0) {
        questions = fixedQuestions;
      }
    }

    const safeParseQuestionsJsonServer = (raw: string): unknown[] => {
      const cleaned = String(raw || '').trim();
      if (!cleaned) return [];

      const sanitizeControlChars = (s: string) =>
        s
          .split(String.fromCharCode(8))
          .join('\\b')
          .split(String.fromCharCode(12))
          .join('\\f')
          .split(String.fromCharCode(13))
          .join('\\r')
          .split(String.fromCharCode(9))
          .join('\\t')
          .split(String.fromCharCode(11))
          .join('\\v');

      const repairInvalidBackslashes = (s: string) =>
        s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

      const extractJsonArraySubstring = (s: string) => {
        const start = s.indexOf('[');
        if (start < 0) return s;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < s.length; i++) {
          const ch = s[i]!;
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\') {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === '[') depth += 1;
          else if (ch === ']') {
            depth -= 1;
            if (depth === 0) return s.slice(start, i + 1);
          }
        }
        return s.slice(start);
      };

      const base = extractJsonArraySubstring(sanitizeControlChars(cleaned));
      try {
        const parsed = JSON.parse(base) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        try {
          const repaired = repairInvalidBackslashes(base);
          const parsed2 = JSON.parse(repaired) as unknown;
          return Array.isArray(parsed2) ? parsed2 : [];
        } catch (e2) {
          console.error('[Assistant] Server questions_json parse failed:', e2);
          return [];
        }
      }
    };

    // Final guarantee: if still empty, force-generate from the last user prompt
    if (!Array.isArray(questions) || questions.length === 0) {
      console.warn('[Assistant] Still no questions after fix. Forcing generation from last user prompt...');
      const lastUser =
        [...sanitizedMessages].reverse().find((m) => m.role === 'user')?.content ||
        'Generate 6 JEE Mains level questions.';
      const ocrSnippetForForce =
        file_url && ocrContext
          ? `\n\nOCR EXTRACT (use this, do not invent outside it):\n${truncateText(ocrContext, 6000)}`
          : '';
      const forcePrompt = `Generate questions for this request. Output ONLY <questions_json>...</questions_json>.
REQUEST:
${lastUser}${ocrSnippetForForce}`;
      const forceMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: forcePrompt }];
      const forcedText = await callLlmFlex(forceMessages, 0.0, 8000);
      if (forcedText && forcedText.trim()) bestRawTextForUi = forcedText;
      const forcedQuestions = extractQuestionsFromText(forcedText);
      if (Array.isArray(forcedQuestions) && forcedQuestions.length > 0) {
        questions = forcedQuestions;
      }
    }

    // Server-side salvage: if we STILL have no questions but the bestRawTextForUi
    // contains a <questions_json> block or obvious question structure, try one last parse.
    if (!Array.isArray(questions) || questions.length === 0) {
      const rawForSalvage = bestRawTextForUi || assistantContent || '';
      const hasTag = /<questions_json>/i.test(rawForSalvage);
      if (hasTag) {
        const tagMatch =
          rawForSalvage.match(/<questions_json>\s*([\s\S]*?)\s*<\/questions_json>/i) ??
          rawForSalvage.match(/<questions_json>\s*([\s\S]*)$/i);
        const inner = tagMatch?.[1] ?? '';
        const parsedFromTag = safeParseQuestionsJsonServer(inner);
        if (Array.isArray(parsedFromTag) && parsedFromTag.length > 0) {
          console.warn('[Assistant] Salvaged questions from <questions_json> tag on the server side.');
          questions = parsedFromTag;
        } else {
          console.warn('[Assistant] <questions_json> tag present but server parse returned 0 items.');
          const maybeQuestions = extractQuestionsFromText(rawForSalvage);
          if (Array.isArray(maybeQuestions) && maybeQuestions.length > 0) {
            console.warn('[Assistant] Salvaged questions from bestRawTextForUi via extractQuestionsFromText.');
            questions = maybeQuestions;
          }
        }
      } else {
        const maybeQuestions = extractQuestionsFromText(rawForSalvage);
        if (Array.isArray(maybeQuestions) && maybeQuestions.length > 0) {
          console.warn('[Assistant] Salvaged questions from bestRawTextForUi via extractQuestionsFromText (no tag).');
          questions = maybeQuestions;
        }
      }
    }

    const cleanedContent =
      (Array.isArray(questions) && questions.length > 0
        ? bestRawTextForUi.replace(/<questions_json>[\s\S]*?(?:<\/questions_json>|$)/i, '').trim()
        : bestRawTextForUi.trim());

    const contentWithOcrNote =
      file_url && pageSpecToUse
        ? `OCR processed: ${processedPagesCount} page(s) extracted by Mathpix (requested: ${pageSpecToUse}).\n\n${cleanedContent}`
        : cleanedContent;

    const sanitizedQuestions = sanitizeLatexControlEscapes(questions) as unknown[];

    let exportQuestions = sanitizedQuestions as unknown[];
    let geminiPostUsed = false;
    if (
      geminiKey &&
      (llm_mode === 'groq' || llm_mode === 'both') &&
      Array.isArray(exportQuestions) &&
      exportQuestions.length > 0 &&
      action !== 'review'
    ) {
      try {
        exportQuestions = (await applyGeminiRefinementsToQuestionsChunked(
          exportQuestions as Record<string, unknown>[],
          geminiKey,
          6
        )) as unknown[];
        geminiPostUsed = true;
        console.log('[Assistant] Optional Gemini post-check applied (Groq mode + GEMINI_API_KEY).');
      } catch (e) {
        console.warn('[Assistant] Gemini post-check skipped:', e);
      }
    }

    const BUILD_MARKER = 'ai-question-assistant@2026-05-03.gen';
    return new Response(
      JSON.stringify({
        content: contentWithOcrNote,
        questions: exportQuestions,
        meta: {
          build: BUILD_MARKER,
          questions_count: Array.isArray(exportQuestions) ? exportQuestions.length : 0,
          processed_pages: processedPagesCount,
          requested_pages: pageSpecToUse,
          gemini_post_check: geminiPostUsed,
          llm_mode,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

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
