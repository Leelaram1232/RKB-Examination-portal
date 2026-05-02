import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Send,
  Upload,
  Sparkles,
  Save,
  ArrowLeft,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  Pencil,
  ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedQuestion } from '@/lib/questionParser';
import { parseQuestionText } from '@/lib/questionParser';
import { QuestionPreviewCard } from '@/components/admin/QuestionPreviewCard';
import { invokeExternalFunction } from '@/lib/externalSupabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
}

interface Subject {
  id: string;
  name: string;
}

type LlmMode = 'groq' | 'gemini' | 'both';

type AuditReport = {
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
  groq_used?: boolean;
  warnings?: string[];
};

/** Last audit response meta from edge (deploy / DB source debugging). */
type AuditRunMeta = {
  build?: string;
  question_fetch?: 'primary' | 'external' | 'primary_fallback';
  audit_warnings?: string[];
};

export default function AIQuestionAssistant() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your AI Question Assistant. Choose **Model**: Groq, Gemini, or Both (Groq draft + Gemini merge). I can:\n\n• Generate MCQs with four solid options and one correct key\n• Extract from PDFs / diagrams\n• **Quality check (all questions)** — loads every saved row (paginated), rules + AI per small batch\n\nUpload a PDF or type a request to start.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [generatedQuestions, setGeneratedQuestions] = useState<ParsedQuestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chatHistoryId, setChatHistoryId] = useState<string | null>(null);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditRunMeta, setAuditRunMeta] = useState<AuditRunMeta | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [llmMode, setLlmMode] = useState<LlmMode>('groq');

  /** Bump when you ship frontend changes so production visibly differs from stale CDN. */
  const UI_ASSISTANT_REV = '2026-05-04';

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetChat = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! I'm your AI Question Assistant. Choose **Model**: Groq, Gemini, or Both. I can generate MCQs, extract from PDFs, and run a **quality check on every saved question** for the exam.\n\nUpload a PDF or type a request to start.",
      },
    ]);
    setInput('');
    setFileUrl(null);
    setFileName(null);
  };

  const handleDeleteChat = async () => {
    try {
      resetChat();
      setGeneratedQuestions([]);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChatHistoryId(null);
        toast.success('Chat cleared');
        return;
      }

      // Delete stored history row if present (avoid errors when row doesn't exist).
      if (chatHistoryId) {
        const { error } = await (supabase as any)
          .from('ai_chat_history')
          .delete()
          .eq('id', chatHistoryId)
          .eq('user_id', user.id);
        if (error) console.warn('Failed to delete AI chat history:', error);
      } else {
        const { error } = await (supabase as any)
          .from('ai_chat_history')
          .delete()
          .eq('user_id', user.id);
        if (error) console.warn('Failed to delete AI chat history:', error);
      }

      setChatHistoryId(null);
      setAuditReport(null);
      toast.success('Chat deleted');
    } catch (e) {
      console.error('Delete chat error:', e);
      toast.error('Failed to delete chat');
    }
  };

  const parseAssistantContentFallback = (content: string): ParsedQuestion[] => {
    const text = (content || '').trim();
    if (!text) return [];
    // Guardrail: never attempt "plain text" parsing on tagged JSON blocks.
    // (If we do, the JSON gets treated like question/options and makes garbage preview cards.)
    if (/<questions_json>/i.test(text)) return [];

    // Normalize common AI formatting variants so the parser can pick them up.
    // Examples we want to support:
    // - "Question 1: ..." -> "Q1. ..."
    // - "Option A)" / "Option A:" -> "A)"/"A."
    // - "Correct Answer: B" / "Answer - B" -> "Answer: B"
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/^\s*[-*]\s+/gm, '') // remove leading markdown bullets
      .replace(/Question\s+(\d+)\s*[:\.)-]\s*/gi, 'Q$1. ')
      .replace(/\bQ\s*\.?\s*(\d+)\s*[:\.)-]\s*/gi, 'Q$1. ')
      .replace(/\bOption\s*([A-D])\s*[:\.)-]?\s*/gi, '$1) ')
      .replace(/\bCorrect\s*Answer\b\s*[:\.)-]?\s*/gi, 'Answer: ')
      .replace(/\bAnswer\s*[-]\s*/gi, 'Answer: ')
      .replace(/\bAns\s*[:\.)-]?\s*/gi, 'Answer: ');

    // First try the robust parser (works when AI returns numbered questions).
    const parsed = parseQuestionText(normalized);
    const fromParser = parsed.sections.flatMap((s) =>
      s.questions.map((q, idx) => ({
        ...q,
        // re-number sequentially in this UI list
        questionNumber: generatedQuestions.length + idx + 1,
        sectionName: q.sectionName || s.name || 'General',
      }))
    );
    if (fromParser.length > 0) return fromParser;

    // Fallback: extract bullet/numbered blocks even if the AI reply is conversational.
    const blocks = normalized
      // Split where a new question block starts (beginning of string OR after newline)
      .split(/(?:(?<=\n)|^)\s*(?=\d+[\.\)]\s+|\d+\s*[\.\)]\s+|-)\s*/g)
      .map((b) => b.trim())
      .filter(Boolean);

    const toQuestion = (block: string, idx: number): ParsedQuestion => {
      const m = block.match(/(?:^|\n)\s*(?:Answer|Ans|Correct)\s*[:\-]\s*(.+)$/im);
      const rawAnswer = m?.[1]?.trim() ?? null;
      const cleanedQuestion = block
        .replace(/^\s*(?:\d+[\.\)]|-)\s*/g, '')
        .replace(/(?:^|\n)\s*(?:Answer|Ans|Correct)\s*[:\-]\s*.+$/im, '')
        .trim();
      const firstNonAnswerLine =
        block
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l && !/(?:Answer|Ans|Correct)\s*[:\-]/i.test(l)) ?? '';
      const finalQuestionText =
        cleanedQuestion && cleanedQuestion !== '(No question text provided)'
          ? cleanedQuestion
          : firstNonAnswerLine || '(No question text provided)';

      const isMcqKey = rawAnswer ? /^[A-Da-d1-4](?:\)|\.|$)?$/.test(rawAnswer.trim()) : false;
      return {
        id: Math.random().toString(36).substring(2, 11),
        questionNumber: generatedQuestions.length + idx + 1,
        questionText: finalQuestionText,
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctOption: isMcqKey ? rawAnswer!.trim().toUpperCase().replace(/[^A-D1-4]/g, '') : '',
        questionType: !isMcqKey && rawAnswer ? 'FILL_BLANK' : 'MCQ',
        correctAnswer: !isMcqKey ? rawAnswer : null,
        marks: 4,
        negativeMarks: 1,
        isValid: Boolean(cleanedQuestion) && (rawAnswer ? true : false),
        errors: [],
        hasLatex: true,
        sectionName: 'General',
      };
    };

    // Keep questions even if parsing the question text is imperfect,
    // as long as we have an answer key we can still show in preview.
    return blocks
      .map(toQuestion)
      .filter(
        (q) =>
          (q.questionText && q.questionText.trim() && q.questionText !== '(No question text provided)') ||
          (q.correctOption && q.correctOption.trim()) ||
          (q.correctAnswer && q.correctAnswer.trim())
      );
  };

    const safeParseQuestionsJson = (raw: string): any[] => {
    const cleaned = String(raw || '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    if (!cleaned) return [];

    const sanitizeControlChars = (s: string) => {
      return s
        .split(String.fromCharCode(8)).join('\\b')
        .split(String.fromCharCode(12)).join('\\f')
        .split(String.fromCharCode(13)).join('\\r')
        .split(String.fromCharCode(9)).join('\\t')
        .split(String.fromCharCode(11)).join('\\v');
    };

    const repairBackslashesInJsonStrings = (s: string) => {
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

    const extractJsonArraySubstring = (s: string) => {
      const start = s.indexOf('[');
      if (start < 0) return s;
      let depth = 0, inString = false, escape = false;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '[') depth += 1;
        else if (ch === ']') {
          depth -= 1;
          if (depth === 0) return s.slice(start, i + 1);
        }
      }
      return s.slice(start);
    };

    const tryParseWithRecovery = (jsonText: string) => {
      try {
        return JSON.parse(jsonText);
      } catch (e) {
        // Truncation recovery: find the last complete object in the array
        const lastBrace = jsonText.lastIndexOf('}');
        if (lastBrace > 0) {
          try {
            const truncatedFixed = jsonText.substring(0, lastBrace + 1) + ']';
            return JSON.parse(truncatedFixed);
          } catch {
            throw e; // throw original error if recovery fails
          }
        }
        throw e;
      }
    };

    const base = extractJsonArraySubstring(sanitizeControlChars(cleaned));
    try {
      const parsed = tryParseWithRecovery(base);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e1) {
      try {
        const repaired = repairBackslashesInJsonStrings(base);
        const parsed2 = tryParseWithRecovery(repaired);
        return Array.isArray(parsed2) ? parsed2 : [];
      } catch (e2) {
        const msg1 = e1 instanceof Error ? e1.message : String(e1);
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.error('Tagged questions_json parse failed:', msg1, msg2);
        return [];
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const [examsRes, subjectsRes, historyRes] = await Promise.all([
          supabase.from('exams').select('id, exam_name, exam_code').order('created_at', { ascending: false }),
          supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
          user
            ? (supabase as any)
                .from('ai_chat_history')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null })
        ]);

        if (examsRes.data) setExams(examsRes.data);
        if (subjectsRes.data) setSubjects(subjectsRes.data);
        
        if (historyRes?.error) {
          // Avoid noisy 406 errors when there is no history row yet (single-row expectation).
          console.warn('AI chat history not loaded:', historyRes.error);
        }

        if (historyRes?.data) {
          setChatHistoryId(historyRes.data.id);
          if (historyRes.data.messages && Array.isArray(historyRes.data.messages)) {
            setMessages(historyRes.data.messages as Message[]);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    // Scroll inside the chat panel (not the whole page)
    const el = scrollRef.current;
    if (!el) return;

    // Only auto-scroll when user is already near the bottom.
    // This prevents fighting the user's manual scroll (up/down).
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const path = `ai-assistant/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('question-uploads').upload(path, file);
      if (error) throw error;

      // Prefer signed URL (works even if bucket is private).
      // Mathpix fetches this URL from a remote server, so public buckets-only will fail.
      const { data: signed, error: signedErr } =
        await supabase.storage.from('question-uploads').createSignedUrl(path, 60 * 30);

      if (!signedErr && signed?.signedUrl) {
        setFileUrl(signed.signedUrl);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('question-uploads').getPublicUrl(path);
        setFileUrl(publicUrl);
      }
      setFileName(file.name);
      toast.success('File uploaded successfully. You can now ask questions about it.');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !fileUrl) return;
    if (!selectedExam) {
      toast.error('Please select an exam first');
      return;
    }

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage || (fileUrl ? `Uploaded file: ${fileName}` : '') }]);
    setInput('');
    setIsSending(true);

    try {
      const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));
      conversationHistory.push({ role: 'user', content: userMessage });

      const { data, error } = await invokeExternalFunction<any>('ai-question-assistant', {
        messages: conversationHistory,
        file_url: fileUrl || undefined,
        exam_id: selectedExam,
        subject_id: selectedSubject,
        llm_mode: llmMode,
      });

      if (error) throw error;
      if (!data) throw new Error('No response from AI Assistant');

      const responseData = (() => {
        if (typeof data === 'string') {
          try {
            return JSON.parse(data);
          } catch {
            return { content: data, questions: [] };
          }
        }
        return data;
      })();

      console.log('AI Response Data:', responseData);
      if ((responseData as any)?.meta?.build) {
        console.log('[AI Assistant] Edge build:', (responseData as any).meta);
      }

      // Don't show raw `<questions_json>...</questions_json>` in the chat UI.
      // That block is meant for parsing into preview, not for displaying to admins.
      const assistantChatContent =
        typeof responseData.content === 'string'
          ? responseData.content.replace(/<questions_json>[\s\S]*?<\/questions_json>/i, '').trim()
          : String((responseData as any)?.content ?? '').trim();

      const newMessages: Message[] = [
        ...conversationHistory,
        { role: 'assistant', content: assistantChatContent || '[No response content]' },
      ];
      setMessages(newMessages);

      // Persist chat history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const payload: Record<string, unknown> = {
          user_id: user.id,
          messages: newMessages,
          updated_at: new Date().toISOString(),
        };
        // Only include `id` when we already have a history row. Otherwise let DB default generate it.
        if (chatHistoryId) payload.id = chatHistoryId;

        const { data: savedHistory, error: saveError } = await (supabase as any)
          .from('ai_chat_history')
          .upsert(payload)
          .select();

        if (saveError) {
          console.error('Failed to save AI chat history:', saveError);
          toast.error('Chat not saved (DB error). Check console logs.');
        } else if (Array.isArray(savedHistory) && savedHistory[0]?.id) {
          setChatHistoryId(savedHistory[0].id);
        } else if (savedHistory && (savedHistory as any).id) {
          setChatHistoryId((savedHistory as any).id);
        }
      }
      // If there's no authenticated user, chat history can't be persisted.
      else {
        console.warn('[AI Assistant] No user session found; chat history will not be saved.');
      }

      // Clear the file after it's been processed once to avoid redundant OCR on every message
      if (fileUrl) {
        setFileUrl(null);
        setFileName(null);
      }

      // Primary source: structured questions array from the edge function.
      let questionsToProcess: any[] = Array.isArray((responseData as any)?.questions)
        ? ((responseData as any).questions as any[])
        : [];

      // Fallback: if array is empty but content includes a <questions_json> block, parse it on the client.
      if (
        (!questionsToProcess || questionsToProcess.length === 0) &&
        typeof responseData.content === 'string' &&
        /<questions_json>/i.test(responseData.content)
      ) {
        const text = responseData.content;
        const tagMatch =
          text.match(/<questions_json>\s*([\s\S]*?)\s*<\/questions_json>/i) ||
          text.match(/<questions_json>\s*([\s\S]*)$/i);
        const inner = tagMatch?.[1] ?? '';
        const parsedFromTag = inner ? safeParseQuestionsJson(inner) : [];
        if (Array.isArray(parsedFromTag) && parsedFromTag.length > 0) {
          console.log('[AI Assistant] Parsed questions from questions_json block on client:', parsedFromTag.length);
          questionsToProcess = parsedFromTag;
        } else {
          console.warn('[AI Assistant] questions_json present in content but client parse returned 0 items.');
        }
      }
      if (questionsToProcess.length > 0) {
        const newQuestions = questionsToProcess.map((q: any, idx: number) => ({
          ...q,
          id: Math.random().toString(36).substring(2, 11),
          questionNumber: generatedQuestions.length + idx + 1,
          isValid: true,
          errors: [],
          hasLatex: true,
          sectionName: q.section_name || 'General',
          questionText: q.question_text || '(No question text provided)',
          questionType: (() => {
            const rawType = String(q.question_type || 'MCQ').toUpperCase();
            const typeIndicatesFill =
              rawType.includes('FILL') ||
              rawType.includes('NUMERICAL') ||
              rawType.includes('BLANK') ||
              rawType.includes('SHORT');

            const optionVals = [q.option_a, q.option_b, q.option_c, q.option_d];
            const hasAnyOption = optionVals.some((v: any) => v !== null && v !== undefined && String(v).trim() !== '');

            const hasCorrectAnswer = q.correct_answer !== null && q.correct_answer !== undefined && String(q.correct_answer).trim() !== '';

            // Fallback detection: if model didn't label it, but it has correct_answer and no options -> it's fill-in-the-blank.
            if (typeIndicatesFill || (hasCorrectAnswer && !hasAnyOption)) return 'FILL_BLANK';
            return 'MCQ';
          })() as 'MCQ' | 'FILL_BLANK',
          optionA: q.option_a,
          optionB: q.option_b,
          optionC: q.option_c,
          optionD: q.option_d,
          correctOption: q.correct_option,
          correctAnswer: q.correct_answer,
          marks: q.marks || 4,
          // Preserve diagram/figure image URL from AI extraction
          imageUrl: q.image_url || null,
        }));
        setGeneratedQuestions(prev => [...prev, ...newQuestions]);
        toast.success(`Generated ${newQuestions.length} questions!`);
      } else if (typeof responseData.content === 'string' && responseData.content.trim()) {
        // If the server still returned no questions, show the OCR / status message only.
        // We already have robust server-side salvage; avoid trying to be smarter here,
        // since that caused most of the UI bugs you saw.
        // (No extra parsing here – just rely on the server-generated questions array.)
      }
      
      // Clear file after processing if it was just uploaded
      if (fileUrl) {
        setFileUrl(null);
        setFileName(null);
      }
    } catch (error: any) {
      console.error('AI ERROR LOG:', error);
      toast.error('AI Assistant failed to respond');
      
      let errorMessage = 'I encountered an error. Please try again.';
      
      // Try to extract the most descriptive error possible from Supabase Functions error
      if (error?.context?.error) {
        errorMessage = error.context.error;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // If we have a context with a response, try to get more info
      if (error?.context?.response) {
        try {
          // This is often not possible directly as context.response is a Response object
          console.log('Error Context Response:', error.context.response);
        } catch (e) {}
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, ${errorMessage}` }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleAuditExam = async () => {
    if (!selectedExam) {
      toast.error('Please select an exam first');
      return;
    }
    setAuditLoading(true);
    try {
      const { data, error } = await invokeExternalFunction<{
        content?: string;
        audit?: AuditReport;
        meta?: {
          gemini_used?: boolean;
          groq_used?: boolean;
          llm_mode?: string;
          build?: string;
          question_fetch?: AuditRunMeta['question_fetch'];
          audit_warnings?: string[];
          questions_count?: number;
        };
      }>('ai-question-assistant', {
        messages: [{ role: 'user', content: 'Run full exam quality audit.' }],
        exam_id: selectedExam,
        action: 'audit_exam',
        llm_mode: llmMode,
      });
      if (error) throw error;
      if (!data?.audit) {
        throw new Error('No audit data returned');
      }
      setAuditReport(data.audit);
      setAuditRunMeta({
        build: data.meta?.build,
        question_fetch: data.meta?.question_fetch,
        audit_warnings: data.meta?.audit_warnings,
      });
      const aiBits = [
        data.meta?.groq_used ? 'Groq' : '',
        data.meta?.gemini_used ? 'Gemini' : '',
      ].filter(Boolean);
      const summaryLine = `Quality check (${llmMode}): ${data.audit.total_questions} question(s) scanned, ${data.audit.questions_with_issues} with issues${
        aiBits.length ? ` — AI: ${aiBits.join(' + ')}` : ' — rules only (set API keys for selected model)'
      }.`;
      const assistantBody = `${summaryLine}\n\n${typeof data.content === 'string' ? data.content : ''}`.trim();
      let toSave: Message[] = [];
      setMessages((prev) => {
        toSave = [
          ...prev,
          { role: 'user', content: 'Run quality check for all questions in this exam.' },
          { role: 'assistant', content: assistantBody },
        ];
        return toSave;
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user && toSave.length > 0) {
        const payload: Record<string, unknown> = {
          user_id: user.id,
          messages: toSave,
          updated_at: new Date().toISOString(),
        };
        if (chatHistoryId) payload.id = chatHistoryId;
        const { data: savedHistory, error: saveError } = await (supabase as any)
          .from('ai_chat_history')
          .upsert(payload)
          .select();
        if (saveError) {
          console.warn('Failed to save chat after audit:', saveError);
        } else if (Array.isArray(savedHistory) && savedHistory[0]?.id) {
          setChatHistoryId(savedHistory[0].id);
        } else if (savedHistory && (savedHistory as any).id) {
          setChatHistoryId((savedHistory as any).id);
        }
      }

      if (data.audit.total_questions === 0) {
        toast.error(
          'Quality check found 0 questions for this exam in the database the edge function used. ' +
            'If questions live in another Supabase project, set EXTERNAL_SUPABASE_URL and EXTERNAL_SUPABASE_SERVICE_ROLE_KEY on the function, redeploy ai-question-assistant, and try again.'
        );
      } else if (data.audit.questions_with_issues === 0) {
        toast.success('No issues found for saved questions.');
      } else {
        toast.success(`Found issues on ${data.audit.questions_with_issues} question(s). See report below.`);
      }
      const aw = data.meta?.audit_warnings ?? data.audit.warnings;
      if (Array.isArray(aw) && aw.length > 0) {
        toast.warning(`Some AI audit batches failed (${aw.length}). See “Partial audit” in the report.`);
      }
    } catch (e: unknown) {
      console.error('Audit exam error:', e);
      toast.error(e instanceof Error ? e.message : 'Quality check failed');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleUpdateQuestion = (updated: ParsedQuestion) => {
    setGeneratedQuestions(prev => prev.map(q => q.id === updated.id ? updated : q));
  };

  const handleEditMessage = (index: number) => {
    const message = messages[index];
    if (message.role !== 'user') return;
    
    setInput(message.content);
    // Remove this message and all subsequent ones
    setMessages(prev => prev.slice(0, index));
  };

  const handleSaveAll = async () => {
    const validQuestions = generatedQuestions.filter(q => q.isValid);
    if (validQuestions.length === 0) {
      toast.error('No valid questions to save');
      return;
    }

    setIsSaving(true);
    try {
      // Get next question number
      const { data: existing } = await supabase
        .from('questions')
        .select('question_number')
        .eq('exam_id', selectedExam)
        .order('question_number', { ascending: false })
        .limit(1);
      
      let nextNum = (existing?.[0]?.question_number || 0) + 1;

      const questionsToInsert = validQuestions.map((q, idx) => {
        const optionVals = [q.optionA, q.optionB, q.optionC, q.optionD];
        const hasAnyOption = optionVals.some((v: any) => v !== null && v !== undefined && String(v).trim() !== '');
        const hasCorrectAnswer = q.correctAnswer !== null && q.correctAnswer !== undefined && String(q.correctAnswer).trim() !== '';
        const isFillBlank =
          q.questionType === 'FILL_BLANK' ||
          (hasCorrectAnswer && !hasAnyOption);

        return {
          exam_id: selectedExam,
          subject_id: selectedSubject || null,
          question_number: nextNum + idx,
          section_name: q.sectionName || 'General',
          question_text: q.questionText,
          option_a: isFillBlank ? null : q.optionA,
          option_b: isFillBlank ? null : q.optionB,
          option_c: isFillBlank ? null : q.optionC,
          option_d: isFillBlank ? null : q.optionD,
          correct_option: isFillBlank ? null : q.correctOption,
          correct_answer: isFillBlank ? (q.correctAnswer || null) : null,
          question_type: isFillBlank ? 'NUMERICAL' : 'MCQ',
          marks: q.marks || 4,
          image_url: q.imageUrl || null, // question-level diagram
        };
      });

      const {
        data: insertedQuestions,
        error: insertErr,
      } = await supabase
        .from('questions')
        .insert(questionsToInsert)
        .select('id, question_number');

      if (insertErr) throw insertErr;

      const insertedSorted = (insertedQuestions || []).sort(
        (a, b) => (a.question_number || 0) - (b.question_number || 0)
      );

      // Persist option/question images into `question_images` table.
      const imageInserts: Array<{
        question_id: string;
        image_url: string;
        image_type: string;
        option_key?: string | null;
        display_order: number;
      }> = [];

      validQuestions.forEach((q, idx) => {
        const questionId = insertedSorted[idx]?.id;
        if (!questionId) return;

        if (q.imageUrl) {
          imageInserts.push({
            question_id: questionId,
            image_url: q.imageUrl,
            image_type: 'question',
            option_key: null,
            display_order: 1,
          });
        }

        if (q.optionAImage) {
          imageInserts.push({
            question_id: questionId,
            image_url: q.optionAImage,
            image_type: 'option',
            option_key: 'A',
            display_order: 1,
          });
        }
        if (q.optionBImage) {
          imageInserts.push({
            question_id: questionId,
            image_url: q.optionBImage,
            image_type: 'option',
            option_key: 'B',
            display_order: 1,
          });
        }
        if (q.optionCImage) {
          imageInserts.push({
            question_id: questionId,
            image_url: q.optionCImage,
            image_type: 'option',
            option_key: 'C',
            display_order: 1,
          });
        }
        if (q.optionDImage) {
          imageInserts.push({
            question_id: questionId,
            image_url: q.optionDImage,
            image_type: 'option',
            option_key: 'D',
            display_order: 1,
          });
        }
      });

      if (imageInserts.length > 0) {
        const { error: imageErr } = await supabase
          .from('question_images')
          .insert(imageInserts);
        if (imageErr) throw imageErr;
      }

      toast.success(`Successfully saved ${questionsToInsert.length} questions!`);
      setGeneratedQuestions([]);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save questions');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="AI Assistant" description="..." mainClassName="flex flex-col min-h-0">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="AI Question Assistant"
      description="Generate and extract exam questions with AI"
      mainClassName="flex flex-col min-h-0"
    >
      <div className="flex flex-col h-full min-h-0 gap-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/questions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Questions
          </Button>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="w-64 min-w-[12rem]">
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={selectedExam}
                onChange={(e) => {
                  setSelectedExam(e.target.value);
                  setAuditReport(null);
                  setAuditRunMeta(null);
                }}
              >
                <option value="">Select Exam *</option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.exam_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48 min-w-[10rem]">
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0" title="Frontend bundle marker — if this never changes after deploy, the browser or host is serving an old build.">
              UI {UI_ASSISTANT_REV}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!selectedExam || auditLoading}
              onClick={handleAuditExam}
              className="shrink-0"
            >
              {auditLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ListChecks className="h-4 w-4 mr-2" />
              )}
              Quality check (all questions)
            </Button>
          </div>
        </div>

        {auditReport && (
          <Card className="border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Exam quality report
                <Badge variant="outline" className="font-normal">
                  {auditReport.total_questions} total
                </Badge>
                {auditReport.questions_with_issues > 0 ? (
                  <Badge variant="destructive" className="font-normal">
                    {auditReport.questions_with_issues} with issues
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    No issues
                  </Badge>
                )}
                {auditReport.groq_used && (
                  <Badge variant="outline" className="font-normal">
                    Groq review
                  </Badge>
                )}
                {auditReport.gemini_used && (
                  <Badge variant="outline" className="font-normal">
                    Gemini review
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="space-y-2">
                <p>
                  Fix issues in Admin → Questions for this exam. MCQ: ensure all four options have text,{' '}
                  <code className="text-xs">correct_option</code> matches the right choice, and the answer exists in the options.
                </p>
                {(auditRunMeta?.build || auditRunMeta?.question_fetch) && (
                  <p className="text-xs font-mono text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {auditRunMeta.build && <span>edge: {auditRunMeta.build}</span>}
                    {auditRunMeta.question_fetch && (
                      <span>
                        questions DB:{' '}
                        {auditRunMeta.question_fetch === 'external'
                          ? 'external Supabase'
                          : auditRunMeta.question_fetch === 'primary_fallback'
                            ? 'primary (fallback — external had 0 rows)'
                            : 'primary'}
                      </span>
                    )}
                  </p>
                )}
                {(() => {
                  const partial =
                    auditRunMeta?.audit_warnings?.length
                      ? auditRunMeta.audit_warnings
                      : auditReport.warnings?.length
                        ? auditReport.warnings
                        : [];
                  if (partial.length === 0) return null;
                  return (
                    <div className="rounded-md border border-amber-300/80 bg-amber-100/50 dark:bg-amber-950/40 dark:border-amber-800 p-2 text-xs">
                      <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">Partial audit (some AI batches failed)</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                        {partial.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[28rem] overflow-y-auto px-4 pb-4 [-webkit-overflow-scrolling:touch] touch-pan-y">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Q#</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Severity</th>
                    <th className="py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {auditReport.items
                    .filter((it) => it.issues.length > 0)
                    .map((it) => (
                      <tr key={it.id} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-2 font-mono whitespace-nowrap">{it.question_number}</td>
                        <td className="py-2 pr-2 text-xs">{it.question_type || 'MCQ'}</td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant={
                              it.severity === 'error'
                                ? 'destructive'
                                : it.severity === 'warning'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {it.severity}
                          </Badge>
                        </td>
                        <td className="py-2">
                          <ul className="list-disc pl-4 space-y-1">
                            {it.issues.map((iss, j) => (
                              <li key={j}>{iss}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {auditReport.items.every((it) => it.issues.length === 0) && (
                <p className="text-sm text-muted-foreground py-2">
                  No structural problems detected. Add <code className="text-xs">GEMINI_API_KEY</code> to the edge
                  function for an additional AI pass on answer correctness.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* On small screens: cap chat row height so composer stays in view. */}
        <div className="grid grid-cols-1 gap-6 h-full flex-1 min-h-0 overflow-hidden lg:grid-cols-3 max-lg:grid-rows-[minmax(240px,min(52dvh,32rem))_minmax(0,1fr)] lg:grid-rows-1">
          {/* Chat Sidebar */}
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden shadow-md border-primary/20 lg:col-span-1">
            <CardHeader className="space-y-2 py-3 px-4 bg-primary/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  AI Assistant
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteChat}
                  disabled={isSending}
                  title="Delete chat"
                  className="text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete chat
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-llm-mode" className="text-xs text-muted-foreground">
                  Model (chat + quality check)
                </Label>
                <select
                  id="ai-llm-mode"
                  className="w-full max-w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={llmMode}
                  onChange={(e) => setLlmMode(e.target.value as LlmMode)}
                  disabled={isSending}
                  title="Groq: fast Llama. Gemini: Google only. Both: Groq draft then Gemini merge."
                >
                  <option value="groq">Groq</option>
                  <option value="gemini">Gemini</option>
                  <option value="both">Both (Groq → Gemini)</option>
                </select>
              </div>
              {fileName && (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-xs text-primary">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={fileName}>
                    {fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFileUrl(null);
                      setFileName(null);
                    }}
                    className="shrink-0 rounded p-1 hover:bg-primary/20"
                    title="Remove PDF"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent className="isolate flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto px-4 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] touch-pan-y"
              >
                <div className="py-4 space-y-4">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group mb-4`}>
                      <div className="flex items-start gap-2 max-w-[85%]">
                        {m.role === 'user' && !isSending && (
                          <button 
                            onClick={() => handleEditMessage(i)}
                            className="p-1 mt-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Edit message"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <div className={`rounded-lg p-3 text-sm ${
                          m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border'
                        }`}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="bg-muted border rounded-lg p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              
              <div className="relative z-30 mt-auto shrink-0 border-t bg-card p-3 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.15)] sm:p-4">
                <div className="flex gap-2">
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending}
                    title="Upload PDF or Image (supports Telugu, Hindi, English)"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 relative">
                    <Input 
                      placeholder="Type a request..." 
                      className="pr-10"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="absolute right-0 top-0 h-full"
                      onClick={handleSendMessage}
                      disabled={isSending || (!input.trim() && !fileUrl)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Preview Area */}
          <div className="lg:col-span-2 flex flex-col h-full min-h-0 overflow-hidden">
            <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-6 border-b">
                <div>
                  <CardTitle className="text-lg">Generated Questions</CardTitle>
                  <CardDescription>{generatedQuestions.length} questions in preview</CardDescription>
                </div>
                {generatedQuestions.length > 0 && (
                  <Button onClick={handleSaveAll} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save {generatedQuestions.filter(q => q.isValid).length} Questions
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col flex-1 p-0 overflow-hidden min-h-0">
                {generatedQuestions.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground p-12 text-center">
                    <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-1">No questions generated yet</h3>
                    <p className="text-sm max-w-xs">
                      Use the AI Assistant on the left to generate new questions or analyze an uploaded PDF.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto p-6 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] touch-pan-y">
                    <div className="space-y-6 pb-6">
                      {generatedQuestions.map((q) => (
                        <div key={q.id} className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={() => setGeneratedQuestions(prev => prev.filter(item => item.id !== q.id))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <QuestionPreviewCard
                            question={q}
                            sectionName={(q as any).sectionName || 'General'}
                            onUpdate={handleUpdateQuestion}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
