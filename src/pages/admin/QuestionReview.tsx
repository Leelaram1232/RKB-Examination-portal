import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Eye, Save, Loader2, RefreshCw } from 'lucide-react';
import { MathRenderer, containsLatex } from '@/components/exam/MathRenderer';

interface Question {
  id: string;
  exam_id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string | null;
  section_name: string;
  marks: number;
  ocr_confidence: number | null;
  needs_review: boolean;
  review_status: string;
  exams?: {
    exam_name: string;
  };
}

interface Exam {
  id: string;
  exam_name: string;
}

export default function QuestionReview() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending');

  useEffect(() => {
    fetchExams();
    fetchQuestions();
  }, [selectedExam, filter]);

  const fetchExams = async () => {
    const { data } = await supabase
      .from('exams')
      .select('id, exam_name')
      .order('created_at', { ascending: false });
    
    if (data) {
      setExams(data);
    }
  };

  const fetchQuestions = async () => {
    setIsLoading(true);
    
    let query = supabase
      .from('questions')
      .select(`
        *,
        exams:exam_id (exam_name)
      `)
      .eq('needs_review', true)
      .order('created_at', { ascending: false });

    if (selectedExam !== 'all') {
      query = query.eq('exam_id', selectedExam);
    }

    if (filter !== 'all') {
      query = query.eq('review_status', filter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching questions:', error);
      toast.error('Failed to load questions');
    } else {
      setQuestions(data || []);
    }

    setIsLoading(false);
  };

  const handleReview = (question: Question) => {
    setSelectedQuestion({ ...question });
    setShowReviewDialog(true);
  };

  const handleSaveReview = async () => {
    if (!selectedQuestion) return;

    if (!selectedQuestion.correct_option) {
      toast.error('Please select a correct answer');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('questions')
        .update({
          question_text: selectedQuestion.question_text,
          option_a: selectedQuestion.option_a,
          option_b: selectedQuestion.option_b,
          option_c: selectedQuestion.option_c,
          option_d: selectedQuestion.option_d,
          correct_option: selectedQuestion.correct_option,
          section_name: selectedQuestion.section_name,
          marks: selectedQuestion.marks,
          review_status: 'approved',
          needs_review: false,
        })
        .eq('id', selectedQuestion.id);

      if (error) throw error;

      toast.success('Question reviewed and approved');
      setShowReviewDialog(false);
      setSelectedQuestion(null);
      fetchQuestions();
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast.error('Failed to save review');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkApprove = async () => {
    const pendingQuestions = questions.filter(q => q.review_status === 'pending' && q.correct_option);
    
    if (pendingQuestions.length === 0) {
      toast.error('No questions with answers ready for approval');
      return;
    }

    try {
      const { error } = await supabase
        .from('questions')
        .update({
          review_status: 'approved',
          needs_review: false,
        })
        .in('id', pendingQuestions.map(q => q.id));

      if (error) throw error;

      toast.success(`Approved ${pendingQuestions.length} questions`);
      fetchQuestions();
    } catch (error: any) {
      console.error('Error bulk approving:', error);
      toast.error('Failed to approve questions');
    }
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;
    
    if (confidence >= 0.8) {
      return (
        <Badge variant="default" className="bg-green-500">
          {Math.round(confidence * 100)}%
        </Badge>
      );
    } else if (confidence >= 0.5) {
      return (
        <Badge variant="secondary" className="bg-yellow-500 text-white">
          {Math.round(confidence * 100)}%
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="border-red-500 text-red-500">
          {Math.round(confidence * 100)}%
        </Badge>
      );
    }
  };

  const pendingCount = questions.filter(q => q.review_status === 'pending').length;
  const approvedCount = questions.filter(q => q.review_status === 'approved').length;

  return (
    <AdminLayout title="Question Review" description="Review and approve flagged questions from OCR extraction">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{approvedCount}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Flagged</p>
                  <p className="text-3xl font-bold">{questions.length}</p>
                </div>
                <Eye className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Flagged Questions</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchQuestions}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                {pendingCount > 0 && (
                  <Button size="sm" onClick={handleBulkApprove}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve All with Answers
                  </Button>
                )}
              </div>
            </div>
            <CardDescription>
              Questions flagged for review due to low OCR confidence or missing answers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <div className="w-64">
                <Label>Filter by Exam</Label>
                <Select value={selectedExam} onValueChange={setSelectedExam}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Exams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Exams</SelectItem>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.exam_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label>Status</Label>
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : questions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p>No questions pending review</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Exam</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Answer</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questions.map((question) => (
                      <TableRow key={question.id}>
                        <TableCell>{question.question_number}</TableCell>
                        <TableCell className="font-medium">
                          {question.exams?.exam_name || 'N/A'}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <MathRenderer content={question.question_text} />
                        </TableCell>
                        <TableCell>
                          {question.correct_option ? (
                            <Badge>{question.correct_option}</Badge>
                          ) : (
                            <Badge variant="destructive">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getConfidenceBadge(question.ocr_confidence)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={question.review_status === 'approved' ? 'default' : 'secondary'}>
                            {question.review_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReview(question)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Question</DialogTitle>
            <DialogDescription>
              Verify and correct the extracted question details
            </DialogDescription>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground">OCR Confidence:</span>
                {getConfidenceBadge(selectedQuestion.ocr_confidence)}
                {selectedQuestion.ocr_confidence && selectedQuestion.ocr_confidence < 0.7 && (
                  <span className="text-sm text-yellow-600">
                    Low confidence - please verify carefully
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Question Number</Label>
                  <Input
                    type="number"
                    value={selectedQuestion.question_number}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      question_number: parseInt(e.target.value) || 1
                    })}
                  />
                </div>
                <div>
                  <Label>Section</Label>
                  <Input
                    value={selectedQuestion.section_name}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      section_name: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label>Marks</Label>
                  <Input
                    type="number"
                    value={selectedQuestion.marks}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      marks: parseInt(e.target.value) || 4
                    })}
                  />
                </div>
              </div>

              <div>
                <Label>Question Text</Label>
                <Textarea
                  rows={3}
                  value={selectedQuestion.question_text}
                  onChange={(e) => setSelectedQuestion({
                    ...selectedQuestion,
                    question_text: e.target.value
                  })}
                />
                {selectedQuestion.question_text && (
                  <div className="mt-2 p-2 border rounded bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase">Preview:</p>
                    <MathRenderer content={selectedQuestion.question_text} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Option A</Label>
                  <Input
                    value={selectedQuestion.option_a}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      option_a: e.target.value
                    })}
                  />
                  <div className="p-1.5 border rounded bg-muted/30 text-sm">
                    <MathRenderer content={selectedQuestion.option_a} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Option B</Label>
                  <Input
                    value={selectedQuestion.option_b}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      option_b: e.target.value
                    })}
                  />
                  <div className="p-1.5 border rounded bg-muted/30 text-sm">
                    <MathRenderer content={selectedQuestion.option_b} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Option C</Label>
                  <Input
                    value={selectedQuestion.option_c}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      option_c: e.target.value
                    })}
                  />
                  <div className="p-1.5 border rounded bg-muted/30 text-sm">
                    <MathRenderer content={selectedQuestion.option_c} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Option D</Label>
                  <Input
                    value={selectedQuestion.option_d}
                    onChange={(e) => setSelectedQuestion({
                      ...selectedQuestion,
                      option_d: e.target.value
                    })}
                  />
                  <div className="p-1.5 border rounded bg-muted/30 text-sm">
                    <MathRenderer content={selectedQuestion.option_d} />
                  </div>
                </div>
              </div>

              <div>
                <Label>Correct Answer *</Label>
                <Select
                  value={selectedQuestion.correct_option || ''}
                  onValueChange={(value) => setSelectedQuestion({
                    ...selectedQuestion,
                    correct_option: value
                  })}
                >
                  <SelectTrigger className={!selectedQuestion.correct_option ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select correct answer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Option A</SelectItem>
                    <SelectItem value="B">Option B</SelectItem>
                    <SelectItem value="C">Option C</SelectItem>
                    <SelectItem value="D">Option D</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReview} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Approve & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
