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
  MessageSquare,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedQuestion } from '@/lib/questionParser';
import { parseQuestionText } from '@/lib/questionParser';
import { QuestionPreviewCard } from '@/components/admin/QuestionPreviewCard';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, invokeExternalFunction } from '@/lib/externalSupabase';

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

export default function AIQuestionAssistant() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your AI Question Assistant. How can I help you prepare questions today? You can ask me to generate questions or upload a PDF/Image for me to analyze." }
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
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetChat = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! I'm your AI Question Assistant. How can I help you prepare questions today? You can ask me to generate questions or upload a PDF/Image for me to analyze.",
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
      toast.success('Chat deleted');
    } catch (e) {
      console.error('Delete chat error:', e);
      toast.error('Failed to delete chat');
    }
  };

  const parseAssistantContentFallback = (content: string): ParsedQuestion[] => {
    const text = (content || '').trim();
    if (!text) return [];

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

      const newMessages: Message[] = [...conversationHistory, { role: 'assistant', content: responseData.content }];
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

      const questionsToProcess = Array.isArray(responseData.questions) ? responseData.questions : [];
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
        }));
        setGeneratedQuestions(prev => [...prev, ...newQuestions]);
        toast.success(`Generated ${newQuestions.length} questions!`);
      } else if (typeof responseData.content === 'string' && responseData.content.trim()) {
        // Don't treat OCR status/error messages as questions.
        const contentText = responseData.content.trim();
        const hasQuestionSignals =
          /<questions_json>\s*[\s\S]*<\/questions_json>/i.test(contentText) ||
          /\bQ\s*\d+\b/i.test(contentText) ||
          /Question\s*\d+/i.test(contentText) ||
          /\bOption\s*[A-D]\b/i.test(contentText) ||
          /\bAnswer\s*[:\-]/i.test(contentText) ||
          /Correct\s*Answer/i.test(contentText);

        const looksLikeOcrFailure = /^OCR failed/i.test(contentText) || /^OCR error/i.test(contentText);
        const looksLikeOcrProcessedOnly =
          /^OCR processed/i.test(contentText) &&
          !hasQuestionSignals;

        if (looksLikeOcrFailure || (looksLikeOcrProcessedOnly || (/Mathpix/i.test(contentText) && !hasQuestionSignals))) {
          const detailed =
            contentText.length > 300
              ? `${contentText.slice(0, 300)}...`
              : contentText;
          // Show actual OCR error/status text so the admin can diagnose (keys missing, timeout, etc.)
          toast.error(detailed || 'OCR did not extract readable text. Try a different page range like "pages 1-10".');
        } else {
          // If the assistant returned tagged JSON in the content, parse it.
          const tagMatch = contentText.match(/<questions_json>\s*([\s\S]*?)\s*<\/questions_json>/i);
          const taggedQuestions = (() => {
            if (!tagMatch?.[1]) return [];
            try {
              return JSON.parse(tagMatch[1].trim());
            } catch (e) {
              console.error('Tagged questions_json parse failed:', e);
              return [];
            }
          })();

          if (Array.isArray(taggedQuestions) && taggedQuestions.length > 0) {
            const newQuestions = taggedQuestions.map((q: any, idx: number) => ({
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
            }));
            setGeneratedQuestions(prev => [...prev, ...newQuestions]);
            toast.success(`Generated ${newQuestions.length} questions!`);
          } else {
            const fallbackQuestions = parseAssistantContentFallback(contentText);
          if (fallbackQuestions.length > 0) {
            setGeneratedQuestions(prev => [...prev, ...fallbackQuestions]);
            toast.success(`Generated ${fallbackQuestions.length} questions!`);
          }
          }
        }
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
          <div className="flex gap-4 items-center">
            <div className="w-64">
              <select 
                className="w-full p-2 border rounded-md text-sm"
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
              >
                <option value="">Select Exam *</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.exam_name}</option>)}
              </select>
            </div>
            <div className="w-48">
              <select 
                className="w-full p-2 border rounded-md text-sm"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              >
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* On small screens: cap chat row height so composer stays in view. */}
        <div className="grid grid-cols-1 gap-6 h-full flex-1 min-h-0 overflow-hidden lg:grid-cols-3 max-lg:grid-rows-[minmax(240px,min(52dvh,32rem))_minmax(0,1fr)] lg:grid-rows-1">
          {/* Chat Sidebar */}
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden shadow-md border-primary/20 lg:col-span-1">
            <CardHeader className="space-y-2 py-3 px-4 bg-primary/5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  AI Assistant (Groq Llama 3)
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
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 [scrollbar-gutter:stable]"
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
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending}
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
              <CardContent className="flex-1 p-0 overflow-hidden min-h-0">
                {generatedQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center">
                    <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-1">No questions generated yet</h3>
                    <p className="text-sm max-w-xs">
                      Use the AI Assistant on the left to generate new questions or analyze an uploaded PDF.
                    </p>
                  </div>
                ) : (
                  <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain p-6 [scrollbar-gutter:stable]">
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
