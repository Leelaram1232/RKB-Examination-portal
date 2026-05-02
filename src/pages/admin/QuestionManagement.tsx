import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Edit, Trash2, ArrowLeft, Save, Loader2, Upload, CheckSquare, Settings2, BrainCircuit, Image, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  question_type?: 'MCQ' | 'NUMERICAL' | 'MATCH_COLUMN' | null;
  correct_answer?: string | null;
  section_name: string;
  marks: number;
  subject_id: string | null;
  image_url?: string | null;
  option_a_image?: string | null;
  option_b_image?: string | null;
  option_c_image?: string | null;
  option_d_image?: string | null;
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
  question_type: 'MCQ' as const,
  correct_answer: null as string | null,
  section_name: 'General',
  marks: 4,
  subject_id: null as string | null,
  image_url: null as string | null,
  option_a_image: null as string | null,
  option_b_image: null as string | null,
  option_c_image: null as string | null,
  option_d_image: null as string | null,
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Partial<Question>>(defaultQuestion);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(examId || '');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examSubjects, setExamSubjects] = useState<Subject[]>([]);

  const isFillBlankDialog = (currentQuestion.question_type || 'MCQ') === 'NUMERICAL';
  
  // Bulk selection state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<'section' | 'subject' | 'marks'>('section');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
  // Advanced selection state
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [dragActionType, setDragActionType] = useState<'select' | 'deselect'>('select');
  const mouseYRef = useRef<number>(0);
  const [isReordering, setIsReordering] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

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
        .map((es) => (es as { subjects: Subject | null }).subjects)
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

  const uploadImageToQuestionUploads = async (file: File) => {
    if (!selectedExamId) throw new Error('No exam selected');

    const fileName = `${selectedExamId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('question-uploads')
      .upload(fileName, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } = supabase.storage
      .from('question-uploads')
      .getPublicUrl(fileName);

    return publicData.publicUrl as string;
  };

  const handleSaveQuestion = async () => {
    if (!selectedExamId) {
      toast.error('Please select an exam first');
      return;
    }

    const questionType = currentQuestion.question_type || 'MCQ';
    const isFillBlank = questionType === 'NUMERICAL';

    if (!currentQuestion.question_text) {
      toast.error('Please enter question text');
      return;
    }

    if (isFillBlank) {
      if (!currentQuestion.correct_answer) {
        toast.error('Please enter the correct answer for this fill-in-the-blank question');
        return;
      }
    } else {
      // MCQ required fields
      if (!currentQuestion.option_a || !currentQuestion.option_b || !currentQuestion.option_c || !currentQuestion.option_d) {
        toast.error('Please fill in all required fields');
        return;
      }
    }

    setIsSaving(true);

    // Supabase types are generated for MCQ fields; for NUMERICAL we set options/correct_option to null.
    // Cast to keep runtime behavior correct while allowing schema flexibility.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questionData: any = {
      exam_id: selectedExamId,
      question_number: currentQuestion.question_number || questions.length + 1,
      question_text: currentQuestion.question_text,
      section_name: currentQuestion.section_name || 'General',
      marks: currentQuestion.marks || 4,
      subject_id: currentQuestion.subject_id || null,
      image_url: currentQuestion.image_url || null,
      question_type: isFillBlank ? 'NUMERICAL' : (questionType || 'MCQ'),
      correct_answer: isFillBlank ? (currentQuestion.correct_answer || null) : null,
      correct_option: isFillBlank ? null : (currentQuestion.correct_option || 'A'),
      option_a: isFillBlank ? null : currentQuestion.option_a,
      option_b: isFillBlank ? null : currentQuestion.option_b,
      option_c: isFillBlank ? null : currentQuestion.option_c,
      option_d: isFillBlank ? null : currentQuestion.option_d,
    };

    let error;
    let savedQuestionId: string | null = null;

    if (isEditing && currentQuestion.id) {
      const { error: updateError } = await supabase
        .from('questions')
        .update(questionData)
        .eq('id', currentQuestion.id);
      error = updateError;
      savedQuestionId = currentQuestion.id;
    } else {
      const { error: insertError, data: inserted } = await supabase
        .from('questions')
        .insert([questionData])
        .select('id')
        .single();
      error = insertError;
      savedQuestionId = inserted?.id || null;
    }

    if (error) {
      setIsSaving(false);
      toast.error(isEditing ? 'Failed to update question' : 'Failed to add question');
      console.error(error);
    } else {
      // Save option images into `question_images`
      if (savedQuestionId) {
        const { error: deleteErr } = await supabase
          .from('question_images')
          .delete()
          .eq('question_id', savedQuestionId)
          .in('option_key', ['A', 'B', 'C', 'D']);

        if (deleteErr) {
          toast.error('Failed to clear existing option images');
          console.error(deleteErr);
          setIsSaving(false);
          return;
        }

        const imageInserts: Array<{
          question_id: string;
          image_url: string;
          image_type: string;
          option_key: 'A' | 'B' | 'C' | 'D';
          display_order: number;
        }> = [];

        const optA = currentQuestion.option_a_image || null;
        const optB = currentQuestion.option_b_image || null;
        const optC = currentQuestion.option_c_image || null;
        const optD = currentQuestion.option_d_image || null;

        if (optA) imageInserts.push({ question_id: savedQuestionId, image_url: optA, image_type: 'option', option_key: 'A', display_order: 1 });
        if (optB) imageInserts.push({ question_id: savedQuestionId, image_url: optB, image_type: 'option', option_key: 'B', display_order: 1 });
        if (optC) imageInserts.push({ question_id: savedQuestionId, image_url: optC, image_type: 'option', option_key: 'C', display_order: 1 });
        if (optD) imageInserts.push({ question_id: savedQuestionId, image_url: optD, image_type: 'option', option_key: 'D', display_order: 1 });

        if (imageInserts.length > 0) {
          const { error: imageErr } = await supabase.from('question_images').insert(imageInserts);
          if (imageErr) {
            toast.error('Failed to save option images');
            console.error(imageErr);
            setIsSaving(false);
            return;
          }
        }
      }

      setIsSaving(false);
      toast.success(isEditing ? 'Question updated' : 'Question added');
      setShowQuestionDialog(false);
      setCurrentQuestion(defaultQuestion);
      setIsEditing(false);
      fetchExamAndQuestions(selectedExamId);
    }
  };

  const handleEditQuestion = (question: Question) => {
    // Load existing option images so they can be edited/saved.
    const loadImages = async () => {
      setIsLoading(true);
      try {
        const { data: optImgs, error: imgsErr } = await supabase
          .from('question_images')
          .select('option_key, image_url')
          .eq('question_id', question.id)
          .in('option_key', ['A', 'B', 'C', 'D']);

        if (imgsErr) {
          toast.error('Failed to load option images for edit');
          console.error(imgsErr);
          setCurrentQuestion(question);
          setIsEditing(true);
          setShowQuestionDialog(true);
          return;
        }

        const byKey: Record<string, string> = {};
        (optImgs || []).forEach((img) => {
          const key = (img as { option_key: string | null; image_url: string | null }).option_key;
          const url = (img as { option_key: string | null; image_url: string | null }).image_url;
          if (key && url) byKey[String(key).toUpperCase()] = url;
        });

        setCurrentQuestion({
          ...question,
          option_a_image: byKey['A'] || null,
          option_b_image: byKey['B'] || null,
          option_c_image: byKey['C'] || null,
          option_d_image: byKey['D'] || null,
        });
      } finally {
        setIsEditing(true);
        setShowQuestionDialog(true);
        setIsLoading(false);
      }
    };

    void loadImages();
  };

  const reorderQuestions = async (id: string) => {
    const { data: currentQuestions, error: fetchError } = await supabase
      .from('questions')
      .select('id, question_number')
      .eq('exam_id', id)
      .order('question_number');

    if (fetchError || !currentQuestions) return;

    const updates = currentQuestions
      .map((q, index) => ({ id: q.id, question_number: index + 1 }))
      .filter((u, index) => currentQuestions[index].question_number !== u.question_number);

    if (updates.length === 0) return;

    const { error: updateError } = await supabase
      .from('questions')
      .upsert(updates);

    if (updateError) {
      console.error('Failed to reorder questions:', updateError);
      throw updateError;
    }
  };

  const handleManualReorder = async () => {
    if (!selectedExamId) return;
    
    setIsReordering(true);
    try {
      await reorderQuestions(selectedExamId);
      await fetchExamAndQuestions(selectedExamId);
      toast.success('Question numbers rearranged successfully');
    } catch (error) {
      toast.error('Failed to rearrange question numbers');
    } finally {
      setIsReordering(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    const { error } = await supabase.from('questions').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete question');
    } else {
      toast.success('Question deleted');
      if (selectedExamId) {
        await reorderQuestions(selectedExamId);
        fetchExamAndQuestions(selectedExamId);
      }
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

  const handleSelectQuestion = (id: string, checked: boolean, index: number, isShiftKey: boolean = false) => {
    const newSelected = new Set(selectedQuestionIds);
    
    if (isShiftKey && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      
      const rangeIds = questions.slice(start, end + 1).map(q => q.id);
      
      if (checked) {
        rangeIds.forEach(rangeId => newSelected.add(rangeId));
      } else {
        rangeIds.forEach(rangeId => newSelected.delete(rangeId));
      }
    } else {
      // Single selection
      if (checked) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
    }
    
    setSelectedQuestionIds(newSelected);
    setLastSelectedIndex(index);
  };

  const startDragSelection = (id: string, currentlySelected: boolean, index: number) => {
    setIsDraggingSelection(true);
    const newAction = currentlySelected ? 'deselect' : 'select';
    setDragActionType(newAction);
    
    const newSelected = new Set(selectedQuestionIds);
    if (newAction === 'select') {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedQuestionIds(newSelected);
    setLastSelectedIndex(index);

    // Add global mouseup listener to stop dragging
    const stopDragging = () => {
      setIsDraggingSelection(false);
      window.removeEventListener('mouseup', stopDragging);
    };
    window.addEventListener('mouseup', stopDragging);
  };

  useEffect(() => {
    if (!isDraggingSelection) return;

    let rafId: number;
    const scrollSpeed = 20;
    const scrollThreshold = 120; // Slightly larger threshold for easier triggering

    const handleMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
    };

    const autoScroll = () => {
      if (!scrollContainerRef.current) {
        scrollContainerRef.current = document.querySelector('main');
      }
      
      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const currentY = mouseYRef.current;
      
      if (currentY > rect.bottom - scrollThreshold) {
        // Scroll down
        container.scrollTop += scrollSpeed;
      } else if (currentY < rect.top + scrollThreshold) {
        // Scroll up
        container.scrollTop -= scrollSpeed;
      }
      
      rafId = requestAnimationFrame(autoScroll);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafId = requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [isDraggingSelection]);

  const onMouseEnterRow = (id: string, index: number) => {
    if (!isDraggingSelection) return;

    const newSelected = new Set(selectedQuestionIds);
    if (dragActionType === 'select') {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedQuestionIds(newSelected);
    setLastSelectedIndex(index);
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
      const updateData: {
        section_name?: string;
        subject_id?: string | null;
        marks?: number;
      } = {};
      
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
      
      if (selectedExamId) {
        await reorderQuestions(selectedExamId);
        fetchExamAndQuestions(selectedExamId);
      }
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
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link to="/admin/questions/ai-assistant">
                    <BrainCircuit className="w-4 h-4 mr-2 text-primary" />
                    AI Assistant
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/admin/questions/smart-paste">
                    <Plus className="w-4 h-4 mr-2" />
                    Smart Paste
                  </Link>
                </Button>
              </div>
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
                    {questions.length > 0 && (
                      <Button variant="outline" onClick={handleManualReorder} disabled={isReordering}>
                        {isReordering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ListOrdered className="w-4 h-4 mr-2" />}
                        Rearrange Numbers
                      </Button>
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
                        {questions.map((question, index) => {
                          const questionSubject = subjects.find(s => s.id === question.subject_id);
                          return (
                            <TableRow 
                              key={question.id}
                              className={cn(
                                "transition-colors cursor-default select-none",
                                selectedQuestionIds.has(question.id) ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                              )}
                              onMouseEnter={() => onMouseEnterRow(question.id, index)}
                            >
                              <TableCell className="w-12">
                                <div 
                                  className="flex items-center justify-center h-full w-full py-3"
                                  onMouseDown={(e) => {
                                    // Don't start drag if clicking the checkbox directly (let handleSelectQuestion handle it)
                                    // but we want to allow dragging from the cell
                                    startDragSelection(question.id, selectedQuestionIds.has(question.id), index);
                                  }}
                                >
                                  <Checkbox
                                    checked={selectedQuestionIds.has(question.id)}
                                    onCheckedChange={(checked) => {
                                      // Note: native Event is not available in onCheckedChange, 
                                      // so we might need a workaround for shift-click or just use onMouseDown
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectQuestion(question.id, !selectedQuestionIds.has(question.id), index, e.shiftKey);
                                    }}
                                  />
                                </div>
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
                                  {question.question_type === 'NUMERICAL'
                                    ? (question.correct_answer ?? '-')
                                    : question.correct_option}
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

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-muted-foreground" />
                  Question Image (optional)
                </Label>
                <Input
                  type="file"
                  accept="image/*"
                  disabled={isSaving || isUploadingImage}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    setIsUploadingImage(true);
                    try {
                      const publicUrl = await uploadImageToQuestionUploads(file);
                      setCurrentQuestion((curr) => ({ ...curr, image_url: publicUrl }));
                      toast.success('Question image uploaded');
                    } catch (err) {
                      console.error(err);
                      toast.error('Failed to upload question image');
                    } finally {
                      setIsUploadingImage(false);
                    }
                  }}
                />

                {currentQuestion.image_url && (
                  <div className="space-y-2">
                    <img
                      src={currentQuestion.image_url}
                      alt="Question diagram"
                      className="max-h-40 w-full object-contain rounded border bg-white"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSaving || isUploadingImage}
                      onClick={() => setCurrentQuestion((curr) => ({ ...curr, image_url: null }))}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Option A</Label>
                  <Input
                    value={currentQuestion.option_a || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_a: e.target.value
                    })}
                  />
                  <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={isSaving || isUploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingImage(true);
                      try {
                        const publicUrl = await uploadImageToQuestionUploads(file);
                        setCurrentQuestion((curr) => ({ ...curr, option_a_image: publicUrl }));
                        toast.success('Option A image uploaded');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to upload Option A image');
                      } finally {
                        setIsUploadingImage(false);
                      }
                    }}
                  />
                  {currentQuestion.option_a_image && (
                    <div className="space-y-2">
                      <img
                        src={currentQuestion.option_a_image}
                        alt="Option A diagram"
                        className="max-h-32 w-full object-contain rounded border bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isUploadingImage}
                        onClick={() => setCurrentQuestion((curr) => ({ ...curr, option_a_image: null }))}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Option B</Label>
                  <Input
                    value={currentQuestion.option_b || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_b: e.target.value
                    })}
                  />
                  <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={isSaving || isUploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingImage(true);
                      try {
                        const publicUrl = await uploadImageToQuestionUploads(file);
                        setCurrentQuestion((curr) => ({ ...curr, option_b_image: publicUrl }));
                        toast.success('Option B image uploaded');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to upload Option B image');
                      } finally {
                        setIsUploadingImage(false);
                      }
                    }}
                  />
                  {currentQuestion.option_b_image && (
                    <div className="space-y-2">
                      <img
                        src={currentQuestion.option_b_image}
                        alt="Option B diagram"
                        className="max-h-32 w-full object-contain rounded border bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isUploadingImage}
                        onClick={() => setCurrentQuestion((curr) => ({ ...curr, option_b_image: null }))}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Option C</Label>
                  <Input
                    value={currentQuestion.option_c || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_c: e.target.value
                    })}
                  />
                  <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={isSaving || isUploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingImage(true);
                      try {
                        const publicUrl = await uploadImageToQuestionUploads(file);
                        setCurrentQuestion((curr) => ({ ...curr, option_c_image: publicUrl }));
                        toast.success('Option C image uploaded');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to upload Option C image');
                      } finally {
                        setIsUploadingImage(false);
                      }
                    }}
                  />
                  {currentQuestion.option_c_image && (
                    <div className="space-y-2">
                      <img
                        src={currentQuestion.option_c_image}
                        alt="Option C diagram"
                        className="max-h-32 w-full object-contain rounded border bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isUploadingImage}
                        onClick={() => setCurrentQuestion((curr) => ({ ...curr, option_c_image: null }))}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Option D</Label>
                  <Input
                    value={currentQuestion.option_d || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      option_d: e.target.value
                    })}
                  />
                  <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={isSaving || isUploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingImage(true);
                      try {
                        const publicUrl = await uploadImageToQuestionUploads(file);
                        setCurrentQuestion((curr) => ({ ...curr, option_d_image: publicUrl }));
                        toast.success('Option D image uploaded');
                      } catch (err) {
                        console.error(err);
                        toast.error('Failed to upload Option D image');
                      } finally {
                        setIsUploadingImage(false);
                      }
                    }}
                  />
                  {currentQuestion.option_d_image && (
                    <div className="space-y-2">
                      <img
                        src={currentQuestion.option_d_image}
                        alt="Option D diagram"
                        className="max-h-32 w-full object-contain rounded border bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || isUploadingImage}
                        onClick={() => setCurrentQuestion((curr) => ({ ...curr, option_d_image: null }))}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Correct Answer</Label>
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Question Type</Label>
                  <Select
                    value={isFillBlankDialog ? 'NUMERICAL' : 'MCQ'}
                    onValueChange={(value) => {
                      const nextType = value as 'MCQ' | 'NUMERICAL';
                      setCurrentQuestion((curr) => ({
                        ...curr,
                        question_type: nextType,
                        correct_option: nextType === 'NUMERICAL' ? curr.correct_option : (curr.correct_option || 'A'),
                        correct_answer: nextType === 'NUMERICAL' ? (curr.correct_answer || '') : null,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCQ">MCQ</SelectItem>
                      <SelectItem value="NUMERICAL">Fill in the blank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isFillBlankDialog ? (
                  <Input
                    value={currentQuestion.correct_answer || ''}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      correct_answer: e.target.value
                    })}
                    placeholder="Enter the correct fill-in answer"
                  />
                ) : (
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
                )}
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
