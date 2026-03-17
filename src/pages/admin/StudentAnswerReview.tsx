console.log('DEBUG: StudentAnswerReview.tsx LOADED - VERSION 2');
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, XCircle, Minus, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase, invokeExternalFunction } from '@/lib/externalSupabase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  section_name: string;
  marks: number;
  question_type?: string;
}

interface StudentAnswer {
  question_id: string;
  selected_option: string | null;
  text_answer: string | null;
}

interface SessionInfo {
  session_id: string;
  student_name: string;
  registration_number: string;
  exam_name: string;
  exam_id: string;
}

export default function StudentAnswerReview() {
  console.error('[CRITICAL DEBUG] StudentAnswerReview.tsx v4 LOADED');
  
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Map<string, { option: string | null, text: string | null }>>(new Map());
  const [originalAnswers, setOriginalAnswers] = useState<Map<string, { option: string | null, text: string | null }>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all');

  useEffect(() => {
    // Alert to confirm code is actually running on the client
    console.error('[StudentAnswerReview] COMPONENT MOUNTED');
    
    const fetchData = async () => {
      if (!sessionId) return;
      setIsLoading(true);
      window.alert(`[DEBUG] Attempting to load review for session: ${sessionId}`);

      try {
        // 1. Check local session first
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('[StudentAnswerReview] Auth state:', currentSession ? 'Loged in as ' + currentSession.user.email : 'No active session!');
        
        if (!currentSession) {
          toast.error("You are not logged in. Please login to the admin portal.");
          return;
        }

        console.log(`[StudentAnswerReview] Fetching session details for: ${sessionId}`);
        
        // 1. Fetch Session + Registration data directly (Using EXACT working syntax from SessionManagement.tsx)
        const { data: sessionData, error: sessionErr } = await supabase
          .from('exam_sessions')
          .select(`
            id,
            registration_id,
            registration:registrations!registrations_exam_id_fkey(
              id,
              registration_number,
              exam_id,
              student:profiles!registrations_student_id_profiles_fkey(full_name, id)
            )
          `)
          .eq('id', sessionId)
          .maybeSingle();

        if (sessionErr) {
          console.error('[StudentAnswerReview] Supabase Query Error:', sessionErr);
          throw sessionErr;
        }

        if (!sessionData) {
          console.error('[StudentAnswerReview] No result for sessionID:', sessionId);
          throw new Error('Session not found in master database');
        }

        // Extract registration correctly
        const reg: any = Array.isArray(sessionData.registration) ? sessionData.registration[0] : sessionData.registration;
        
        if (!reg) {
          console.error('[StudentAnswerReview] Registration data is missing for session:', sessionData);
          throw new Error('This session has no associated registration record.');
        }

        // Since we need exam_name, let's fetch exam info separately to be safe from nested ambiguity
        const { data: examData, error: examErr } = await supabase
          .from('exams')
          .select('exam_name')
          .eq('id', reg.exam_id)
          .single();
        if (examErr) console.warn('[StudentAnswerReview] Could not fetch exam name:', examErr);

        // 2. Fetch Questions for this exam
        const { data: questionsData, error: qErr } = await supabase
          .from('questions')
          .select('*')
          .eq('exam_id', reg.exam_id)
          .order('question_number');
        if (qErr) throw qErr;

        // 3. Fetch current answers for this session
        const { data: answersData, error: aErr } = await supabase
          .from('student_answers')
          .select('*')
          .eq('session_id', sessionId);
        if (aErr) throw aErr;

        console.log('[StudentAnswerReview] Successfully loaded everything:', { reg, qCount: questionsData?.length, aCount: answersData?.length });

        setSessionInfo({
          session_id: sessionData.id,
          registration_number: reg.registration_number,
          exam_name: examData?.exam_name || 'N/A',
          student_name: reg.student?.full_name || 'Unknown',
          exam_id: reg.exam_id
        });

        setQuestions(questionsData || []);

        const answersMap = new Map<string, { option: string | null, text: string | null }>();
        (answersData || []).forEach((a: any) => {
          answersMap.set(a.question_id, { option: a.selected_option, text: a.text_answer });
        });
        setAnswers(answersMap);
        setOriginalAnswers(new Map(answersMap));
        
      } catch (error: any) {
        console.error('[StudentAnswerReview] Direct fetch fail:', error);
        toast.error(`Loading error: ${error.message}`);
        
        // Fallback strategy: Proxy
        console.warn('Direct fetch failed, trying proxy fallback...');
        await fetchUsingProxy();
      } finally {
        setIsLoading(false);
      }
    };

    const fetchUsingProxy = async () => {
      try {
        const { data: response, error: proxyError } = await invokeExternalFunction<any>(
          'admin-update-answers', 
          { session_id: sessionId }, 
          { method: 'GET' }
        );

        if (proxyError || !response?.success) {
          throw new Error(proxyError?.message || response?.error || 'Proxy loading failed too');
        }

        const { session, questions: questionsData, answers: answersData } = response;
        const reg = session.registration;

        setSessionInfo({
          session_id: session.id,
          registration_number: reg.registration_number,
          exam_name: reg.exams?.[0]?.exam_name || reg.exams?.exam_name || 'N/A',
          student_name: reg.profiles?.[0]?.full_name || reg.profiles?.full_name || 'Unknown',
          exam_id: reg.exam_id
        });

        setQuestions(questionsData || []);
        const answersMap = new Map<string, { option: string | null, text: string | null }>();
        (answersData || []).forEach((a: any) => {
          answersMap.set(a.question_id, { option: a.selected_option, text: a.text_answer });
        });
        setAnswers(answersMap);
        setOriginalAnswers(new Map(answersMap));
      } catch (err: any) {
        console.error('[StudentAnswerReview] Fallback proxy error:', err);
        // We already showing the main error toast, so we just log this
      }
    };

    fetchData();
  }, [sessionId, navigate]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => {
      const newMap = new Map(prev);
      const current = prev.get(questionId) || { option: null, text: null };
      if (value === 'none') {
        newMap.delete(questionId);
      } else {
        newMap.set(questionId, { ...current, option: value });
      }
      return newMap;
    });
  };

  const persistChangedAnswers = async () => {
    if (!sessionId) return 0;

    const changedAnswers: any[] = [];
    for (const question of questions) {
      const current = answers.get(question.id);
      const original = originalAnswers.get(question.id);

      if (current?.option !== original?.option || current?.text !== original?.text) {
        changedAnswers.push({
          session_id: sessionId,
          question_id: question.id,
          selected_option: current?.option || null,
          text_answer: current?.text || null,
        });
      }
    }

    if (changedAnswers.length === 0) return 0;

    // Try multiple update strategies
    try {
      // 1. Direct via Supabase (if RLS allows admins)
      const { error: upsertErr } = await supabase
        .from('student_answers')
        .upsert(changedAnswers, { onConflict: 'session_id,question_id' });

      if (upsertErr) {
        console.warn('Direct upsert failed, trying proxy...', upsertErr);
        // 2. Fallback to Edge function proxy
        const { data, error: proxyError } = await invokeExternalFunction<any>('admin-update-answers', {
          session_id: sessionId,
          changes: changedAnswers,
        });
        if (proxyError || !data?.success) throw proxyError || new Error(data?.error);
      }

      setOriginalAnswers(new Map(answers));
      return changedAnswers.length;
    } catch (err: any) {
      console.error('Final persist error:', err);
      throw err;
    }
  };

  const invokeRecalculate = async () => {
    if (!sessionId) return;

    const { data: result, error } = await invokeExternalFunction<any>('recalculate-result', { session_id: sessionId });

    if (error) {
      throw error;
    }

    if (!result?.success) {
      throw new Error(result?.error || 'Failed to recalculate');
    }

    return result;
  };

  const handleSaveAnswers = async () => {
    if (!sessionId) return;

    setIsSaving(true);
    try {
      const savedCount = await persistChangedAnswers();
      if (savedCount === 0) {
        toast.info('No changes to save');
        return;
      }

      toast.success(`Saved ${savedCount} answer(s). Recalculating result...`);

      setIsRecalculating(true);
      // Recalculation MUST be done via backend function because it triggers complex DB changes
      const { data: result, error: recErr } = await invokeExternalFunction<any>('recalculate-result', { session_id: sessionId });

      if (recErr || !result?.success) {
        throw new Error(recErr?.message || result?.error || 'Recalculation failed but answers were saved.');
      }

      toast.success(
        `Updated: ${result.obtained_marks}/${result.total_marks} marks (${result.correct_count} correct)`
      );

      // Navigate back
      if (sessionInfo?.exam_id) {
        navigate(`/admin/results/${sessionInfo.exam_id}`, { replace: true });
      } else {
        navigate('/admin/results', { replace: true });
      }
    } catch (error: any) {
      console.error('Save/recalculate error:', error);
      toast.error(error?.message || 'Failed to save & recalculate');
    } finally {
      setIsSaving(false);
      setIsRecalculating(false);
    }
  };

  const handleRecalculate = async () => {
    if (!sessionId) return;
    setIsRecalculating(true);

    try {
      const result = await invokeRecalculate();
      toast.success(
        `Result recalculated: ${result.obtained_marks}/${result.total_marks} marks, ${result.correct_count} correct`
      );
    } catch (error: any) {
      console.error('Recalculate error:', error);
      toast.error(error?.message || 'Failed to recalculate');
    } finally {
      setIsRecalculating(false);
    }
  };

  const sections = ['all', ...new Set(questions.map(q => q.section_name))];
  const filteredQuestions = activeSection === 'all' 
    ? questions 
    : questions.filter(q => q.section_name === activeSection);

  const getAnswerStatus = (question: any) => {
    const ansData = answers.get(question.id);
    const type = question.question_type || 'MCQ';

    if (!ansData) return 'unanswered';

    if (type === 'NUMERICAL') {
      const s = ansData.text?.toString().trim().toLowerCase();
      const c = question.correct_option?.toString().trim().toLowerCase();
      if (!s) return 'unanswered';
      return s === c ? 'correct' : 'wrong';
    }

    if (!ansData.option) return 'unanswered';
    return ansData.option === question.correct_option ? 'correct' : 'wrong';
  };

  const stats = {
    total: questions.length,
    answered: Array.from(answers.values()).filter(a => a?.option || a?.text).length,
    correct: questions.filter(q => {
      const ans = answers.get(q.id);
      if (q.question_type === 'NUMERICAL') {
        return ans?.text?.toString().trim().toLowerCase() === q.correct_option?.toString().trim().toLowerCase();
      }
      return ans?.option === q.correct_option;
    }).length,
    wrong: questions.filter(q => {
      const ans = answers.get(q.id);
      const hasAns = q.question_type === 'NUMERICAL' ? !!ans?.text : !!ans?.option;
      if (!hasAns) return false;
      
      if (q.question_type === 'NUMERICAL') {
        return ans?.text?.toString().trim().toLowerCase() !== q.correct_option?.toString().trim().toLowerCase();
      }
      return ans?.option !== q.correct_option;
    }).length,
  };

  if (isLoading) {
    return (
      <AdminLayout title="Answer Review" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!sessionInfo) {
    return null;
  }

  return (
    <AdminLayout 
      title="Manual Answer Review" 
      description={`Review and correct answers for ${sessionInfo.student_name}`}
    >
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => {
          if (sessionInfo?.exam_id) {
            navigate(`/admin/results/${sessionInfo.exam_id}`);
          } else {
            navigate('/admin/results');
          }
        }}
        className="mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      {/* DEBUG WARNING - Only visible if reloading worked */}
      <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6">
        <p className="font-bold text-yellow-700">DEBUG MODE ACTIVE (v4)</p>
        <p className="text-sm text-yellow-600">If you see this, the latest code is loaded. We are now using the Edge Function Proxy.</p>
      </div>

      {/* Student Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{sessionInfo.student_name}</CardTitle>
          <CardDescription>
            {sessionInfo.registration_number} | {sessionInfo.exam_name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Questions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.answered}</p>
              <p className="text-sm text-muted-foreground">Answered</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.correct}</p>
              <p className="text-sm text-muted-foreground">Correct</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{stats.wrong}</p>
              <p className="text-sm text-muted-foreground">Wrong</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {sections.map(section => (
            <Button
              key={section}
              variant={activeSection === section ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSection(section)}
            >
              {section === 'all' ? 'All Sections' : section}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSaveAnswers} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Answers
          </Button>
          <Button variant="secondary" onClick={handleRecalculate} disabled={isRecalculating}>
            {isRecalculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Recalculate Result
          </Button>
        </div>
      </div>

      {/* Questions Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Q.No</TableHead>
                  <TableHead className="w-24">Section</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="w-24 text-center">Correct</TableHead>
                  <TableHead className="w-48 text-center">Student Answer</TableHead>
                  <TableHead className="w-24 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {filteredQuestions.map(question => {
                    const status = getAnswerStatus(question);
                    const ansData = answers.get(question.id) || null;
                    const type = (question as any).question_type || 'MCQ';
                    
                    return (
                      <TableRow key={question.id}>
                        <TableCell className="font-medium">{question.question_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{question.section_name}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-lg">
                            <p className="text-sm line-clamp-2">{question.question_text}</p>
                            {type === 'MCQ' ? (
                              <div className="mt-1 text-xs text-muted-foreground space-x-2">
                                <span className={question.correct_option === 'A' ? 'font-bold text-green-600' : ''}>A: {question.option_a?.substring(0, 20)}</span>
                                <span className={question.correct_option === 'B' ? 'font-bold text-green-600' : ''}>B: {question.option_b?.substring(0, 20)}</span>
                                <span className={question.correct_option === 'C' ? 'font-bold text-green-600' : ''}>C: {question.option_c?.substring(0, 20)}</span>
                                <span className={question.correct_option === 'D' ? 'font-bold text-green-600' : ''}>D: {question.option_d?.substring(0, 20)}</span>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="mt-1 text-[10px]">Numerical Type</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-green-600">{question.correct_option}</Badge>
                        </TableCell>
                        <TableCell>
                          {type === 'MCQ' ? (
                            <Select
                              value={ansData?.option || 'none'}
                              onValueChange={(value) => handleAnswerChange(question.id, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                <SelectItem value="A">A</SelectItem>
                                <SelectItem value="B">B</SelectItem>
                                <SelectItem value="C">C</SelectItem>
                                <SelectItem value="D">D</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="px-3 py-2 border rounded-md bg-muted/30 text-center font-mono">
                              {ansData?.text || <span className="text-muted-foreground italic">No Answer</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {status === 'correct' && (
                            <CheckCircle className="w-5 h-5 text-green-600 inline" />
                          )}
                          {status === 'wrong' && (
                            <XCircle className="w-5 h-5 text-red-600 inline" />
                          )}
                          {status === 'unanswered' && (
                            <Minus className="w-5 h-5 text-muted-foreground inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
