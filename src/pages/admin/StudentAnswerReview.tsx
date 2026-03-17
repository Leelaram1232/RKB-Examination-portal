import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, XCircle, Minus, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeExternalFunction } from '@/lib/externalSupabase';
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
}

interface StudentAnswer {
  question_id: string;
  selected_option: string | null;
}

interface SessionInfo {
  session_id: string;
  student_name: string;
  registration_number: string;
  exam_name: string;
  exam_id: string;
}

export default function StudentAnswerReview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Map<string, string | null>>(new Map());
  const [originalAnswers, setOriginalAnswers] = useState<Map<string, string | null>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) return;

      try {
        // Fetch session info
        const { data: session, error: sessionError } = await supabase
          .from('exam_sessions')
          .select(`
            id,
            registrations (
              registration_number,
              exam_id,
              student_id,
              profiles (full_name),
              exams (exam_name)
            )
          `)
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          toast.error('Session not found');
          navigate('/admin/results');
          return;
        }

        const reg = session.registrations as any;
        setSessionInfo({
          session_id: session.id,
          student_name: reg.profiles?.full_name || 'Unknown',
          registration_number: reg.registration_number || 'N/A',
          exam_name: reg.exams?.exam_name || 'Unknown Exam',
          exam_id: reg.exam_id,
        });

        // Fetch questions
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, section_name, marks')
          .eq('exam_id', reg.exam_id)
          .order('question_number');

        if (questionsError) {
          console.error('Error fetching questions:', questionsError);
          toast.error('Failed to load questions');
          return;
        }

        setQuestions(questionsData || []);

        // Fetch existing answers
        const { data: answersData, error: answersError } = await supabase
          .from('student_answers')
          .select('question_id, selected_option')
          .eq('session_id', sessionId);

        if (answersError) {
          console.error('Error fetching answers:', answersError);
        }

        const answersMap = new Map<string, string | null>();
        (answersData || []).forEach(a => {
          answersMap.set(a.question_id, a.selected_option);
        });
        setAnswers(answersMap);
        setOriginalAnswers(new Map(answersMap));

      } catch (error) {
        console.error('Unexpected error:', error);
        toast.error('An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [sessionId, navigate]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => {
      const newMap = new Map(prev);
      if (value === 'none') {
        newMap.delete(questionId);
      } else {
        newMap.set(questionId, value);
      }
      return newMap;
    });
  };

  const persistChangedAnswers = async () => {
    if (!sessionId) return 0;

    // Find changed answers
    const changedAnswers: { question_id: string; selected_option: string | null }[] = [];

    for (const question of questions) {
      const newAnswer = answers.get(question.id) ?? null;
      const oldAnswer = originalAnswers.get(question.id) ?? null;

      if (newAnswer !== oldAnswer) {
        changedAnswers.push({
          question_id: question.id,
          selected_option: newAnswer,
        });
      }
    }

    if (changedAnswers.length === 0) return 0;

    // Admin corrections must go through backend function (RLS blocks direct writes)
    const { data, error } = await supabase.functions.invoke('admin-update-answers', {
      body: {
        session_id: sessionId,
        changes: changedAnswers,
      },
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Failed to save answers');

    setOriginalAnswers(new Map(answers));
    return changedAnswers.length;
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
      const result = await invokeRecalculate();
      toast.success(
        `Updated: ${result.obtained_marks}/${result.total_marks} marks (${result.correct_count} correct)`
      );

      // Always go back to the exam results page (history back can fail if opened directly)
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

  const getAnswerStatus = (question: Question) => {
    const answer = answers.get(question.id);
    if (!answer) return 'unanswered';
    return answer === question.correct_option ? 'correct' : 'wrong';
  };

  const stats = {
    total: questions.length,
    answered: Array.from(answers.values()).filter(a => a !== null).length,
    correct: questions.filter(q => answers.get(q.id) === q.correct_option).length,
    wrong: questions.filter(q => {
      const ans = answers.get(q.id);
      return ans && ans !== q.correct_option;
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
                  <TableHead className="w-32 text-center">Student Answer</TableHead>
                  <TableHead className="w-24 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuestions.map(question => {
                  const status = getAnswerStatus(question);
                  const studentAnswer = answers.get(question.id) || null;
                  
                  return (
                    <TableRow key={question.id}>
                      <TableCell className="font-medium">{question.question_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{question.section_name}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-lg">
                          <p className="text-sm line-clamp-2">{question.question_text}</p>
                          <div className="mt-1 text-xs text-muted-foreground space-x-2">
                            <span className={question.correct_option === 'A' ? 'font-bold text-green-600' : ''}>A: {question.option_a?.substring(0, 20)}{question.option_a?.length > 20 ? '...' : ''}</span>
                            <span className={question.correct_option === 'B' ? 'font-bold text-green-600' : ''}>B: {question.option_b?.substring(0, 20)}{question.option_b?.length > 20 ? '...' : ''}</span>
                            <span className={question.correct_option === 'C' ? 'font-bold text-green-600' : ''}>C: {question.option_c?.substring(0, 20)}{question.option_c?.length > 20 ? '...' : ''}</span>
                            <span className={question.correct_option === 'D' ? 'font-bold text-green-600' : ''}>D: {question.option_d?.substring(0, 20)}{question.option_d?.length > 20 ? '...' : ''}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-green-600">{question.correct_option}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={studentAnswer || 'none'}
                          onValueChange={(value) => handleAnswerChange(question.id, value)}
                        >
                          <SelectTrigger className="w-24">
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
