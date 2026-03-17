import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { parseQuestionText, type ParseResult, type ParsedQuestion, type ParsedSection } from '@/lib/questionParser';
import { QuestionPreviewCard } from '@/components/admin/QuestionPreviewCard';
import { useEffect } from 'react';

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
}

interface Subject {
  id: string;
  name: string;
}

export default function SmartQuestionPaste() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const [defaultMarks, setDefaultMarks] = useState(4);
  const [defaultNegativeMarks, setDefaultNegativeMarks] = useState(1);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch exams and subjects
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [examsRes, subjectsRes] = await Promise.all([
          supabase.from('exams').select('id, exam_name, exam_code').order('created_at', { ascending: false }),
          supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
        ]);

        if (examsRes.data) setExams(examsRes.data);
        if (subjectsRes.data) setSubjects(subjectsRes.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load exams and subjects');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Parse the raw text
  const handleParse = () => {
    if (!rawText.trim()) {
      toast.error('Please paste some question text first');
      return;
    }

    setIsParsing(true);
    
    // Simulate slight delay for UX
    setTimeout(() => {
      const result = parseQuestionText(rawText, defaultMarks, defaultNegativeMarks);
      setParseResult(result);
      setIsParsing(false);

      if (result.success) {
        toast.success(`Parsed ${result.totalQuestions} questions (${result.validQuestions} valid)`);
      } else if (result.totalQuestions > 0) {
        toast.warning(`Parsed ${result.totalQuestions} questions with ${result.invalidQuestions} errors`);
      } else {
        toast.error('Could not parse any questions from the text');
      }
    }, 100);
  };

  // Update a single question
  const handleUpdateQuestion = (sectionId: string, questionId: string, updatedQuestion: ParsedQuestion) => {
    if (!parseResult) return;

    const updatedSections = parseResult.sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          questions: section.questions.map((q) => (q.id === questionId ? updatedQuestion : q)),
        };
      }
      return section;
    });

    const validCount = updatedSections.reduce(
      (sum, s) => sum + s.questions.filter((q) => q.isValid).length,
      0
    );

    setParseResult({
      ...parseResult,
      sections: updatedSections,
      validQuestions: validCount,
      invalidQuestions: parseResult.totalQuestions - validCount,
    });
  };

  // Check if we can save
  const canSave = useMemo(() => {
    if (!parseResult || !selectedExam) return false;
    return parseResult.invalidQuestions === 0 && parseResult.totalQuestions > 0;
  }, [parseResult, selectedExam]);

  // Save questions to database
  const handleSave = async () => {
    if (!canSave || !parseResult) return;

    setIsSaving(true);
    try {
      // Get existing question count for this exam
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('question_number')
        .eq('exam_id', selectedExam)
        .order('question_number', { ascending: false })
        .limit(1);

      let nextQuestionNumber = 1;
      if (existingQuestions && existingQuestions.length > 0) {
        nextQuestionNumber = existingQuestions[0].question_number + 1;
      }

      // Collect all questions with their images
      const allQuestions = parseResult.sections.flatMap((section, sectionIdx) =>
        section.questions.map((q, idx) => ({
          question: q,
          sectionName: section.name,
          globalIdx: sectionIdx * 1000 + idx
        }))
      );

      // Prepare questions for insert
      const questionsToInsert = allQuestions.map((item, idx) => {
        const q = item.question;
        const type = q.questionType || (q.correctAnswer ? 'FILL_BLANK' : 'MCQ');
        const isFillBlank = type === 'FILL_BLANK';

        return {
          exam_id: selectedExam,
          subject_id: selectedSubject || null,
          question_number: nextQuestionNumber + idx,
          section_name: item.sectionName,
          question_text: q.questionText,
          option_a: isFillBlank ? null : q.optionA,
          option_b: isFillBlank ? null : q.optionB,
          option_c: isFillBlank ? null : q.optionC,
          option_d: isFillBlank ? null : q.optionD,
          correct_option: isFillBlank ? null : q.correctOption,
          correct_answer: isFillBlank ? (q.correctAnswer || null) : null,
          question_type: isFillBlank ? 'NUMERICAL' : 'MCQ',
          marks: q.marks,
          image_url: q.imageUrl || null,
        };
      });

      const { data: insertedQuestions, error } = await supabase
        .from('questions')
        .insert(questionsToInsert)
        .select('id, question_number');

      if (error) throw error;

      // Insert into question_images table for questions that have images (question-level and option-level)
      if (insertedQuestions) {
        const imageInserts: Array<{
          question_id: string;
          image_url: string;
          image_type: string;
          option_key?: string | null;
          display_order: number;
        }> = [];

        allQuestions.forEach((item, idx) => {
          const questionId = insertedQuestions[idx]?.id;
          if (!questionId) return;

          // Question-level image
          if (item.question.imageUrl) {
            imageInserts.push({
              question_id: questionId,
              image_url: item.question.imageUrl,
              image_type: 'question',
              option_key: null,
              display_order: 1
            });
          }

          // Option-level images
          if (item.question.optionAImage) {
            imageInserts.push({
              question_id: questionId,
              image_url: item.question.optionAImage,
              image_type: 'option',
              option_key: 'A',
              display_order: 1
            });
          }
          if (item.question.optionBImage) {
            imageInserts.push({
              question_id: questionId,
              image_url: item.question.optionBImage,
              image_type: 'option',
              option_key: 'B',
              display_order: 1
            });
          }
          if (item.question.optionCImage) {
            imageInserts.push({
              question_id: questionId,
              image_url: item.question.optionCImage,
              image_type: 'option',
              option_key: 'C',
              display_order: 1
            });
          }
          if (item.question.optionDImage) {
            imageInserts.push({
              question_id: questionId,
              image_url: item.question.optionDImage,
              image_type: 'option',
              option_key: 'D',
              display_order: 1
            });
          }
        });

        if (imageInserts.length > 0) {
          const { error: imageError } = await supabase
            .from('question_images')
            .insert(imageInserts);

          if (imageError) {
            console.error('Failed to insert question images:', imageError);
          }
        }
      }

      toast.success(`Successfully saved ${questionsToInsert.length} questions!`);
      
      // Reset form
      setRawText('');
      setParseResult(null);
      
    } catch (error) {
      console.error('Error saving questions:', error);
      toast.error('Failed to save questions. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Clear everything
  const handleClear = () => {
    setRawText('');
    setParseResult(null);
  };

  if (isLoading) {
    return (
      <AdminLayout title="Add Questions (Smart Paste)" description="Paste and parse exam questions">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Add Questions (Smart Paste)" description="Paste and parse exam questions automatically">
      <div className="space-y-6">
        {/* Back button and header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/questions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Questions
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardPaste className="h-5 w-5" />
                  Paste Questions
                </CardTitle>
                <CardDescription>
                  Paste your exam content with sections, questions, options, and answers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Exam Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Select Exam *</Label>
                    <Select value={selectedExam} onValueChange={setSelectedExam}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose exam" />
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
                  <div>
                    <Label>Subject (Optional)</Label>
                    <Select value={selectedSubject || "all"} onValueChange={(val) => setSelectedSubject(val === "all" ? "" : val)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All subjects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subjects</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Default marks settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Default Marks per Question</Label>
                    <Input
                      type="number"
                      value={defaultMarks}
                      onChange={(e) => setDefaultMarks(parseInt(e.target.value) || 4)}
                      className="mt-1"
                      min={1}
                    />
                  </div>
                  <div>
                    <Label>Default Negative Marks</Label>
                    <Input
                      type="number"
                      step="0.25"
                      value={defaultNegativeMarks}
                      onChange={(e) => setDefaultNegativeMarks(parseFloat(e.target.value) || 0)}
                      className="mt-1"
                      min={0}
                    />
                  </div>
                </div>

                <Separator />

                {/* Text input */}
                <div>
                  <Label>Paste Exam Content</Label>
                  <Textarea
                    placeholder={`SECTION: Mathematics

Q1. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B

Q2. What is the square root of 16?
A) 2
B) 3
C) 4
D) 5
Answer: C

SECTION: Physics

Q1. What is the SI unit of force?
A) Joule
B) Watt
C) Newton
D) Pascal
Ans: C`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="mt-1 min-h-[300px] font-mono text-sm"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleParse}
                    disabled={!rawText.trim() || isParsing || !selectedExam}
                    className="flex-1"
                  >
                    {isParsing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Parse Questions
                  </Button>
                  <Button variant="outline" onClick={handleClear} disabled={!rawText && !parseResult}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Format Help */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Supported Formats
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>Sections:</strong> SECTION: Mathematics</p>
                <p><strong>Questions:</strong> Q1. or 1. or 1)</p>
                <p><strong>Options:</strong> A) B) C) D) or a) b) c) d) or 1) 2) 3) 4)</p>
                <p><strong>Answers:</strong> Answer: A or Ans: B or Correct: C</p>
              </CardContent>
            </Card>
          </div>

          {/* Preview Section */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Preview & Validation
                  </span>
                  {parseResult && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{parseResult.totalQuestions} total</Badge>
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {parseResult.validQuestions} valid
                      </Badge>
                      {parseResult.invalidQuestions > 0 && (
                        <Badge variant="destructive">{parseResult.invalidQuestions} errors</Badge>
                      )}
                    </div>
                  )}
                </CardTitle>
                <CardDescription>
                  Review and edit parsed questions before saving
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!parseResult ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardPaste className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Paste your questions and click "Parse Questions" to preview</p>
                  </div>
                ) : parseResult.errors.length > 0 && parseResult.totalQuestions === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                    <p className="text-destructive font-medium">Parsing Failed</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {parseResult.errors.join('. ')}
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {parseResult.sections.map((section) => (
                        <div key={section.id}>
                          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <Badge>{section.name}</Badge>
                            <span className="text-sm text-muted-foreground font-normal">
                              ({section.questions.length} questions)
                            </span>
                          </h3>
                          <div className="space-y-3">
                            {section.questions.map((question) => (
                              <QuestionPreviewCard
                                key={question.id}
                                question={question}
                                sectionName={section.name}
                                onUpdate={(updated) => handleUpdateQuestion(section.id, question.id, updated)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Save Button */}
            {parseResult && parseResult.totalQuestions > 0 && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {parseResult.invalidQuestions > 0 ? (
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-5 w-5" />
                          <span>Fix {parseResult.invalidQuestions} error(s) before saving</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span>All {parseResult.totalQuestions} questions are valid</span>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleSave}
                      disabled={!canSave || isSaving}
                      size="lg"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save {parseResult.validQuestions} Questions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
