import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Edit, Trash2, ArrowLeft, Save, Loader2, Upload, CheckSquare, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { QuestionUpload } from '@/components/admin/QuestionUpload';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  section_name: string;
  marks: number;
  subject_id: string | null;
}

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
}

interface Subject {
  id: string;
  name: string;
  code: string | null;
}

const defaultQuestion = {
  question_number: 1,
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'A' as const,
  section_name: 'General',
  marks: 4,
  subject_id: null as string | null,
};

const QuestionManagement = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Partial<Question>>(defaultQuestion);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(examId || '');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examSubjects, setExamSubjects] = useState<Subject[]>([]);
  
  // Bulk selection state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<'section' | 'subject' | 'marks'>('section');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from('exams')
      .select('id, exam_name, exam_code')
      .order('exam_name');

    if (!error && data) {
      setExams(data);
      if (!examId && data.length > 0) {
        setSelectedExamId(data[0].id);
      }
    }
  };

  const fetchSubjects = async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setSubjects(data);
    }
  };

  const fetchExamSubjects = async (examId: string) => {
    const { data, error } = await supabase
      .from('exam_subjects')
      .select('subject_id, subjects(id, name, code)')
      .eq('exam_id', examId)
      .order('display_order');
    
    if (!error && data) {
      const subs = data
        .map((es: any) => es.subjects)
        .filter((s: Subject | null): s is Subject => s !== null);
      setExamSubjects(subs);
    } else {
      setExamSubjects([]);
    }
  };

  const fetchExamAndQuestions = async (id: string) => {
    // Fetch exam details
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .select('id, exam_name, exam_code')
      .eq('id', id)
      .single();

    if (examError) {
      toast.error('Failed to fetch exam details');
      return;
    }

    setExam(examData);

    // Fetch exam subjects
    await fetchExamSubjects(id);

    // Fetch questions with subject info
    const { data: questionsData, error: questionsError } = await supabase
      .from('questions')
      .select('*, subjects(id, name, code)')
      .eq('exam_id', id)
      .order('question_number');

    if (questionsError) {
      toast.error('Failed to fetch questions');
    } else {
      setQuestions((questionsData as Question[]) || []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchExams();
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      setIsLoading(true);
      fetchExamAndQuestions(selectedExamId);
    } else {
      setIsLoading(false);
    }
  }, [selectedExamId]);

  const handleSaveQuestion = async () => {
    if (!selectedExamId) {
      toast.error('Please select an exam first');
      return;
    }

    if (!currentQuestion.question_text || !currentQuestion.option_a || 
        !currentQuestion.option_b || !currentQuestion.option_c || 
        !currentQuestion.option_d) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);

    const questionData = {
      exam_id: selectedExamId,
      question_number: currentQuestion.question_number || questions.length + 1,
      question_text: currentQuestion.question_text,
      option_a: currentQuestion.option_a,
      option_b: currentQuestion.option_b,
      option_c: currentQuestion.option_c,
      option_d: currentQuestion.option_d,
      correct_option: currentQuestion.correct_option || 'A',
      section_name: currentQuestion.section_name || 'General',
      marks: currentQuestion.marks || 4,
      subject_id: currentQuestion.subject_id || null,
    };

    let error;

    if (isEditing && currentQuestion.id) {
      const { error: updateError } = await supabase
        .from('questions')
        .update(questionData)
        .eq('id', currentQuestion.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('questions')
        .insert([questionData]);
      error = insertError;
    }

    setIsSaving(false);

    if (error) {
      toast.error(isEditing ? 'Failed to update question' : 'Failed to add question');
      console.error(error);
    } else {
      toast.success(isEditing ? 'Question updated' : 'Question added');
      setShowQuestionDialog(false);
      setCurrentQuestion(defaultQuestion);
      setIsEditing(false);
      fetchExamAndQuestions(selectedExamId);
    }
  };

  const handleEditQuestion = (question: Question) => {
    setCurrentQuestion(question);
    setIsEditing(true);
    setShowQuestionDialog(true);
  };

  const handleDeleteQuestion = async (id: string) => {
    const { error } = await supabase.from('questions').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete question');
    } else {
      toast.success('Question deleted');
      fetchExamAndQuestions(selectedExamId);
    }
  };

  const openAddDialog = () => {
    setCurrentQuestion({
      ...defaultQuestion,
      question_number: questions.length + 1,
    });
    setIsEditing(false);
    setShowQuestionDialog(true);
  };

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuestionIds(new Set(questions.map(q => q.id)));
    } else {
      setSelectedQuestionIds(new Set());
    }
  };

  const handleSelectQuestion = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedQuestionIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedQuestionIds(newSelected);
  };

  const handleBulkUpdate = async () => {
    if (selectedQuestionIds.size === 0) {
      toast.error('No questions selected');
      return;
    }

    if (!bulkEditValue && bulkEditField !== 'subject') {
      toast.error('Please enter a value');
      return;
    }

    setIsBulkUpdating(true);

    try {
      const updateData: Record<string, any> = {};
      
      if (bulkEditField === 'section') {
        updateData.section_name = bulkEditValue;
      } else if (bulkEditField === 'subject') {
        updateData.subject_id = bulkEditValue === 'none' ? null : bulkEditValue;
      } else if (bulkEditField === 'marks') {
        updateData.marks = parseInt(bulkEditValue) || 4;
      }

      const { error } = await supabase
        .from('questions')
        .update(updateData)
        .in('id', Array.from(selectedQuestionIds));

      if (error) throw error;

      toast.success(`Updated ${selectedQuestionIds.size} questions`);
      setSelectedQuestionIds(new Set());
      setShowBulkEditDialog(false);
      setBulkEditValue('');
      fetchExamAndQuestions(selectedExamId);
    } catch (error) {
      console.error('Bulk update error:', error);
      toast.error('Failed to update questions');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuestionIds.size === 0) {
      toast.error('No questions selected');
      return;
    }

    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .in('id', Array.from(selectedQuestionIds));

      if (error) throw error;

      toast.success(`Deleted ${selectedQuestionIds.size} questions`);
      setSelectedQuestionIds(new Set());
      fetchExamAndQuestions(selectedExamId);
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Failed to delete questions');
    }
  };

  const openBulkEditDialog = (field: 'section' | 'subject' | 'marks') => {
    setBulkEditField(field);
    setBulkEditValue('');
    setShowBulkEditDialog(true);
  };

  if (isLoading) {
    return (
      <AdminLayout title="Question Bank" description="Manage exam questions">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Question Bank" description="Manage exam questions">
      <div className="space-y-6">
        {/* Exam Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex-1 max-w-md">
                <Label className="mb-2 block">Select Exam</Label>
                <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an exam to manage questions" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.exam_name} ({exam.exam_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Manual Entry and Upload */}
        {selectedExamId && (
          <Tabs defaultValue="questions" className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="questions">Question List</TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Questions
                </TabsTrigger>
              </TabsList>
              <Button variant="outline" asChild>
                <Link to="/admin/questions/smart-paste">
                  <Plus className="w-4 h-4 mr-2" />
                  Smart Paste Questions
                </Link>
              </Button>
            </div>

            <TabsContent value="upload">
              <QuestionUpload 
                examId={selectedExamId} 
                onQuestionsImported={() => fetchExamAndQuestions(selectedExamId)} 
              />
            </TabsContent>

            <TabsContent value="questions">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Questions for {exam?.exam_name}</CardTitle>
                    <CardDescription>
                      {questions.length} question{questions.length !== 1 ? 's' : ''} in this exam
                      {selectedQuestionIds.size > 0 && (
                        <span className="ml-2 text-primary font-medium">
                          ({selectedQuestionIds.size} selected)
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedQuestionIds.size > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">
                            <Settings2 className="w-4 h-4 mr-2" />
                            Bulk Actions ({selectedQuestionIds.size})
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openBulkEditDialog('section')}>
                            Change Section
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openBulkEditDialog('subject')}>
                            Change Subject
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openBulkEditDialog('marks')}>
                            Change Marks
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onSelect={(e) => e.preventDefault()}
                              >
                                Delete Selected
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Questions</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {selectedQuestionIds.size} selected questions? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete All
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button onClick={openAddDialog}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Question
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {questions.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No questions added yet</p>
                      <Button onClick={openAddDialog}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Question
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedQuestionIds.size === questions.length && questions.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                          <TableHead className="w-16">#</TableHead>
                          <TableHead>Question</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Correct</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {questions.map((question) => {
                          const questionSubject = subjects.find(s => s.id === question.subject_id);
                          return (
                            <TableRow 
                              key={question.id}
                              className={selectedQuestionIds.has(question.id) ? 'bg-muted/50' : ''}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedQuestionIds.has(question.id)}
                                  onCheckedChange={(checked) => handleSelectQuestion(question.id, !!checked)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{question.question_number}</TableCell>
                              <TableCell className="max-w-md truncate">
                                {question.question_text}
                              </TableCell>
                              <TableCell>
                                {questionSubject ? (
                                  <span className="text-xs bg-secondary px-2 py-1 rounded">
                                    {questionSubject.name}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>{question.section_name}</TableCell>
                              <TableCell>
                                <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                  {question.correct_option}
                                </span>
                              </TableCell>
                              <TableCell>{question.marks}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditQuestion(question)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="text-destructive">
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Question</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete question #{question.question_number}?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteQuestion(question.id)}>
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {!selectedExamId && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Select an exam above to manage its questions
              </p>
            </CardContent>
          </Card>
        )}

        {/* Question Dialog */}
        <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Question' : 'Add New Question'}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Update the question details' : 'Fill in the question details'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Question Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={currentQuestion.question_number || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      question_number: parseInt(e.target.value) || 1
                    })}
                  />
                </div>
                <div>
                  <Label>Section</Label>
                  <Input
                    value={currentQuestion.section_name || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      section_name: e.target.value
                    })}
                    placeholder="e.g., General, Physics"
                  />
                </div>
                <div>
                  <Label>Marks</Label>
                  <Input
                    type="number"
                    min={1}
                    value={currentQuestion.marks || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      marks: parseInt(e.target.value) || 4
                    })}
                  />
                </div>
              </div>

              {/* Subject Selection */}
              <div>
                <Label>Subject {examSubjects.length > 0 ? '' : '(No subjects assigned to this exam)'}</Label>
                <Select
                  value={currentQuestion.subject_id || 'none'}
                  onValueChange={(value) => setCurrentQuestion({
                    ...currentQuestion,
                    subject_id: value === 'none' ? null : value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Subject</SelectItem>
                    {examSubjects.length > 0 ? (
                      examSubjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} {subject.code ? `(${subject.code})` : ''}
                        </SelectItem>
                      ))
                    ) : (
                      subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} {subject.code ? `(${subject.code})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {examSubjects.length === 0 && subjects.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Tip: Assign subjects to this exam in the Exam Form for better organization.
                  </p>
                )}
              </div>

              <div>
                <Label>Question Text</Label>
                <Textarea
                  rows={3}
                  value={currentQuestion.question_text || ''}
                  onChange={(e) => setCurrentQuestion({
                    ...currentQuestion,
                    question_text: e.target.value
                  })}
                  placeholder="Enter the question..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Option A</Label>
                  <Input
                    value={currentQuestion.option_a || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_a: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label>Option B</Label>
                  <Input
                    value={currentQuestion.option_b || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_b: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label>Option C</Label>
                  <Input
                    value={currentQuestion.option_c || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_c: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label>Option D</Label>
                  <Input
                    value={currentQuestion.option_d || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_d: e.target.value
                    })}
                  />
                </div>
              </div>

              <div>
                <Label>Correct Answer</Label>
                <Select
                  value={currentQuestion.correct_option || 'A'}
                  onValueChange={(value) => setCurrentQuestion({
                    ...currentQuestion,
                    correct_option: value as 'A' | 'B' | 'C' | 'D'
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowQuestionDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveQuestion} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Update' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Edit Dialog */}
        <Dialog open={showBulkEditDialog} onOpenChange={setShowBulkEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Bulk Update {bulkEditField === 'section' ? 'Section' : bulkEditField === 'subject' ? 'Subject' : 'Marks'}
              </DialogTitle>
              <DialogDescription>
                Update {selectedQuestionIds.size} selected questions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {bulkEditField === 'section' && (
                <div>
                  <Label>New Section Name</Label>
                  <Input
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    placeholder="e.g., Physics, Chemistry, General"
                  />
                </div>
              )}
              {bulkEditField === 'subject' && (
                <div>
                  <Label>New Subject</Label>
                  <Select value={bulkEditValue || 'none'} onValueChange={setBulkEditValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Subject</SelectItem>
                      {(examSubjects.length > 0 ? examSubjects : subjects).map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} {subject.code ? `(${subject.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {bulkEditField === 'marks' && (
                <div>
                  <Label>New Marks Value</Label>
                  <Input
                    type="number"
                    min={1}
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    placeholder="e.g., 4"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkUpdate} disabled={isBulkUpdating}>
                {isBulkUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update {selectedQuestionIds.size} Questions
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default QuestionManagement;
