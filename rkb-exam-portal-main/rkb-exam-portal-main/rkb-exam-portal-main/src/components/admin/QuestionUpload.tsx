import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileImage, FileText, Loader2, Check, X, Save, Edit, Trash2, AlertTriangle, CheckCircle, HelpCircle, RefreshCw, StopCircle, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { MathRenderer } from '@/components/exam/MathRenderer';

interface ExtractedQuestion {
  question_number: number;
  question_text: string;
  question_type?: 'MCQ' | 'NUMERICAL' | 'MATCH_COLUMN';
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  section_name: string;
  suggested_marks: number;
  correct_option?: 'A' | 'B' | 'C' | 'D' | null;
  correct_answer?: string | null;
  solution_text?: string | null;
  confidence_score?: number;
  has_image?: boolean;
  image_description?: string | null;
  selected?: boolean;
}

interface QuestionUploadProps {
  examId: string;
  onQuestionsImported: () => void;
}

interface ExtractionProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_questions: number | null;
  review_notes: string | null;
  error_message: string | null;
}

// Confidence score badge component
function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 0.8) {
    return (
      <Badge variant="default" className="bg-green-500 hover:bg-green-600">
        <CheckCircle className="w-3 h-3 mr-1" />
        {Math.round(score * 100)}%
      </Badge>
    );
  } else if (score >= 0.5) {
    return (
      <Badge variant="secondary" className="bg-yellow-500 text-white hover:bg-yellow-600">
        <AlertTriangle className="w-3 h-3 mr-1" />
        {Math.round(score * 100)}%
      </Badge>
    );
  } else {
    return (
      <Badge variant="outline" className="border-red-500 text-red-500">
        <HelpCircle className="w-3 h-3 mr-1" />
        {score > 0 ? `${Math.round(score * 100)}%` : 'No answer'}
      </Badge>
    );
  }
}

export function QuestionUpload({ examId, onQuestionsImported }: QuestionUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestion | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [extractionStats, setExtractionStats] = useState<{
    total: number;
    withAnswers: number;
    flagged: number;
    withImages: number;
  } | null>(null);
  
  // Live progress tracking
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<ExtractionProgress | null>(null);
  const [ocrSource, setOcrSource] = useState<'cloud' | 'local' | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Poll for extraction progress
  useEffect(() => {
    if (!uploadId || !isExtracting) return;

    const pollProgress = async () => {
      try {
        const { data, error } = await supabase
          .from('exam_question_uploads')
          .select('status, total_questions, review_notes, error_message, extracted_data')
          .eq('id', uploadId)
          .single();

        if (error) {
          console.error('Poll error:', error);
          return;
        }

        setLiveProgress({
          status: data.status as any,
          total_questions: data.total_questions,
          review_notes: data.review_notes,
          error_message: data.error_message,
        });

        // Update progress bar based on questions extracted
        if (data.total_questions && data.total_questions > 0) {
          const estimatedTotal = 75; // Expected for JEE papers
          const progressPct = Math.min(50 + (data.total_questions / estimatedTotal) * 45, 95);
          setProgress(progressPct);
        }

        // Check if completed or failed
        if (data.status === 'completed' && data.extracted_data) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          
          const extractedData = data.extracted_data as { questions?: any[]; answer_key_detected?: boolean, ocr_source?: string };
          if (extractedData.ocr_source === 'local_paddle') {
            setOcrSource('local');
          } else {
            setOcrSource('cloud');
          }
          
          const questions: ExtractedQuestion[] = (extractedData.questions || []).map((q: any, index: number) => ({
            ...q,
            question_number: q.question_number || index + 1,
            correct_option: q.correct_option || undefined,
            confidence_score: q.confidence_score || 0,
            has_image: q.has_image || false,
            image_description: q.image_description || null,
            selected: true,
          }));

          setExtractionStats({
            total: questions.length,
            withAnswers: questions.filter((q) => q.correct_option).length,
            flagged: questions.filter((q) => q.confidence_score && q.confidence_score < 0.7 && q.correct_option).length,
            withImages: questions.filter((q) => q.has_image).length,
          });

          setExtractedQuestions(questions);
          setShowPreview(true);
          setIsExtracting(false);
          setProgress(100);

          const answerCount = questions.filter((q) => q.correct_option).length;
          const imageCount = questions.filter((q) => q.has_image).length;
          toast.success(`Extracted ${questions.length} questions with ${answerCount} answers and ${imageCount} diagrams detected`);
        } else if (data.status === 'failed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setIsExtracting(false);
          setProgress(0);
          toast.error(data.error_message || 'Extraction failed');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(pollProgress, 2000);
    pollProgress(); // Initial poll

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [uploadId, isExtracting]);
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF or image file (JPEG, PNG, WebP)');
      return;
    }

    setIsUploading(true);
    setProgress(10);
    setIsCancelled(false);
    setLiveProgress(null);
    abortControllerRef.current = new AbortController();

    try {
      // Upload file to storage
      const fileName = `${examId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('question-uploads')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error('Failed to upload file');
      }

      setProgress(30);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('question-uploads')
        .getPublicUrl(fileName);

      // Create upload record
      const { data: uploadRecord, error: recordError } = await supabase
        .from('exam_question_uploads')
        .insert({
          exam_id: examId,
          file_url: publicUrl,
          file_name: file.name,
          file_type: file.type.includes('pdf') ? 'pdf' : 'image',
          status: 'pending',
        })
        .select('id')
        .single();

      if (recordError) {
        throw new Error('Failed to create upload record');
      }

      setProgress(50);
      setUploadId(uploadRecord.id);
      setIsUploading(false);
      setIsExtracting(true);

      // Call extraction edge function
      console.log('Attempting cloud extraction...');
      try {
        const { data, error } = await supabase.functions.invoke('extract-questions', {
          body: {
            upload_id: uploadRecord.id,
            file_url: publicUrl,
          },
        });

        if (error) throw error;
        console.log('Cloud extraction triggered successfully');
      } catch (cloudErr) {
        console.warn('Cloud extraction failed or not deployed. Falling back to LOCAL OCR...', cloudErr);
        
        // DIRECT FALLBACK TO LOCAL OCR (Port 8001)
        // This is for local testing when Edge Functions aren't deployed/working
        try {
          const localResp = await fetch('http://localhost:8001/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              upload_id: uploadRecord.id, // match the DB record
              file_url: publicUrl
            }),
          });
          
          if (!localResp.ok) throw new Error('Local OCR service is not running on port 8001');
          
          const result = await localResp.json();
          console.log('Local OCR Result:', result);

          // Update the database record manually since the cloud function didn't do it
          await supabase.from('exam_question_uploads').update({
            status: 'completed',
            extracted_data: { 
              questions: result.questions,
              ocr_source: 'local_fallback'
            },
            processed_at: new Date().toISOString(),
            total_questions: result.questions.length
          }).eq('id', uploadRecord.id);
          
          // The useEffect polling will detect this update and show the preview
        } catch (localErr: any) {
          console.error('Local fallback also failed:', localErr);
          toast.error('Extraction failed: Please ensure the local OCR service is running on port 8001');
          setIsExtracting(false);
          setProgress(0);
        }
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload document');
      setIsUploading(false);
      setIsExtracting(false);
      setProgress(0);
    }
  }, [examId, isCancelled]);

  const handleCancel = useCallback(() => {
    setIsCancelled(true);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Mark upload as failed in DB
    if (uploadId) {
      supabase
        .from('exam_question_uploads')
        .update({ status: 'failed', error_message: 'Cancelled by user' })
        .eq('id', uploadId)
        .then(() => {});
    }

    setIsUploading(false);
    setIsExtracting(false);
    setProgress(0);
    setUploadId(null);
    setLiveProgress(null);
    toast.info('Extraction cancelled');
  }, [uploadId]);

  const handleRetry = useCallback(async () => {
    if (!uploadId) return;

    setIsExtracting(true);
    setIsCancelled(false);
    setProgress(50);

    // Get the file URL from the upload record
    const { data: upload } = await supabase
      .from('exam_question_uploads')
      .select('file_url')
      .eq('id', uploadId)
      .single();

    if (!upload) {
      toast.error('Upload record not found');
      setIsExtracting(false);
      return;
    }

    // Reset status and retry
    await supabase
      .from('exam_question_uploads')
      .update({ status: 'pending', error_message: null })
      .eq('id', uploadId);

    supabase.functions.invoke('extract-questions', {
      body: {
        upload_id: uploadId,
        file_url: upload.file_url,
      },
    }).catch((err) => {
      if (!isCancelled) {
        console.error('Extraction error:', err);
      }
    });
  }, [uploadId, isCancelled]);

  const toggleQuestionSelection = (index: number) => {
    setExtractedQuestions(prev => 
      prev.map((q, i) => i === index ? { ...q, selected: !q.selected } : q)
    );
  };

  const toggleSelectAll = () => {
    const allSelected = extractedQuestions.every(q => q.selected);
    setExtractedQuestions(prev => prev.map(q => ({ ...q, selected: !allSelected })));
  };

  const handleEditQuestion = (question: ExtractedQuestion) => {
    setEditingQuestion({ ...question });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editingQuestion) return;
    
    setExtractedQuestions(prev =>
      prev.map(q => 
        q.question_number === editingQuestion.question_number ? editingQuestion : q
      )
    );
    setShowEditDialog(false);
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = (index: number) => {
    setExtractedQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleImportQuestions = async () => {
    const selectedQuestions = extractedQuestions.filter(q => q.selected);
    
    if (selectedQuestions.length === 0) {
      toast.error('Please select at least one question to import');
      return;
    }

    const missingAnswers = selectedQuestions.filter(q => q.question_type === 'MCQ' ? !q.correct_option : !q.correct_answer);
    if (missingAnswers.length > 0) {
      toast.error(`Please assign correct answers to all ${missingAnswers.length} selected questions`);
      return;
    }

    setIsImporting(true);

    try {
      // Get current max question number
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('question_number')
        .eq('exam_id', examId)
        .order('question_number', { ascending: false })
        .limit(1);

      const startNumber = (existingQuestions?.[0]?.question_number || 0) + 1;

      // Insert questions with expanded fields
      const questionsToInsert = selectedQuestions.map((q, index) => ({
        exam_id: examId,
        question_number: startNumber + index,
        question_text: q.question_text,
        question_type: q.question_type || 'MCQ',
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        correct_answer: q.correct_answer,
        solution_text: q.solution_text,
        section_name: q.section_name || 'General',
        marks: q.suggested_marks || 4,
        image_url: q.has_image ? 'placeholder' : null, // placeholder for now
      }));

      const { error } = await supabase.from('questions').insert(questionsToInsert);

      if (error) {
        throw new Error('Failed to import questions');
      }

      toast.success(`Successfully imported ${selectedQuestions.length} questions`);
      setShowPreview(false);
      setExtractedQuestions([]);
      setExtractionStats(null);
      setUploadId(null);
      onQuestionsImported();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import questions');
    } finally {
      setIsImporting(false);
    }
  };

  const setCorrectOption = (index: number, option: 'A' | 'B' | 'C' | 'D') => {
    setExtractedQuestions(prev =>
      prev.map((q, i) => i === index ? { ...q, correct_option: option, confidence_score: 1.0 } : q)
    );
  };

  if (showPreview && extractedQuestions.length > 0) {
    const selectedCount = extractedQuestions.filter(q => q.selected).length;
    const selectedWithAnswers = extractedQuestions.filter(q => q.selected && q.correct_option).length;
    const lowConfidenceCount = extractedQuestions.filter(q => q.confidence_score && q.confidence_score < 0.7 && q.correct_option).length;
    const imageCount = extractedQuestions.filter(q => q.has_image).length;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Review Extracted Questions
            {lowConfidenceCount > 0 && (
              <Badge variant="secondary" className="bg-yellow-500 text-white">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {lowConfidenceCount} need review
              </Badge>
            )}
            {imageCount > 0 && (
              <Badge variant="outline" className="border-blue-500 text-blue-500">
                <Image className="w-3 h-3 mr-1" />
                {imageCount} with diagrams
              </Badge>
            )}
            {ocrSource === 'local' && (
              <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">
                Local OCR Active
              </Badge>
            )}
            {ocrSource === 'cloud' && (
              <Badge variant="secondary">
                Cloud AI (Vision)
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {extractionStats && (
              <div className="flex gap-4 mt-2 flex-wrap">
                <span>Total: <strong>{extractionStats.total}</strong></span>
                <span>Answers: <strong className="text-green-600">{extractionStats.withAnswers}</strong></span>
                <span>Low Confidence: <strong className="text-yellow-600">{extractionStats.flagged}</strong></span>
                <span>With Diagrams: <strong className="text-blue-600">{extractionStats.withImages}</strong></span>
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Checkbox
                checked={extractedQuestions.every(q => q.selected)}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm">Select All ({selectedCount} of {extractedQuestions.length})</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Ready to import: <strong className={selectedWithAnswers === selectedCount ? 'text-green-600' : 'text-yellow-600'}>
                {selectedWithAnswers}/{selectedCount}
              </strong>
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Diagram</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TooltipProvider>
                  {extractedQuestions.map((question, index) => {
                    const isLowConfidence = question.confidence_score !== undefined && question.confidence_score < 0.7 && question.correct_option;
                    return (
                      <TableRow 
                        key={index} 
                        className={`${!question.selected ? 'opacity-50' : ''} ${isLowConfidence ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={question.selected}
                            onCheckedChange={() => toggleQuestionSelection(index)}
                          />
                        </TableCell>
                        <TableCell>
                          {question.question_number}
                          {isLowConfidence && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="w-4 h-4 text-yellow-500 ml-1 inline" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Low confidence - please verify
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs overflow-hidden">
                          <div className="truncate">
                            <MathRenderer content={question.question_text} />
                          </div>
                        </TableCell>
                        <TableCell>{question.section_name}</TableCell>
                        <TableCell>
                          {question.question_type === 'NUMERICAL' || question.question_type === 'MATCH_COLUMN' ? (
                            <div className="flex flex-col gap-1">
                              <Input 
                                className="w-24 h-8 text-xs font-mono"
                                value={question.correct_answer || ''}
                                onChange={(e) => {
                                  // Update logic for correct_answer
                                  const newQuestions = [...extractedQuestions];
                                  newQuestions[index].correct_answer = e.target.value;
                                  setExtractedQuestions(newQuestions);
                                }}
                                placeholder="Answer"
                              />
                              <span className="text-[9px] text-muted-foreground uppercase font-bold">{question.question_type}</span>
                            </div>
                          ) : (
                            <Select
                              value={question.correct_option || ''}
                              onValueChange={(value) => setCorrectOption(index, value as 'A' | 'B' | 'C' | 'D')}
                            >
                              <SelectTrigger className={`w-24 ${!question.correct_option ? 'border-red-300' : ''}`}>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="A">A</SelectItem>
                                <SelectItem value="B">B</SelectItem>
                                <SelectItem value="C">C</SelectItem>
                                <SelectItem value="D">D</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge score={question.confidence_score || 0} />
                        </TableCell>
                        <TableCell>
                          {question.has_image ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="border-blue-500 text-blue-500">
                                  <Image className="w-3 h-3" />
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {question.image_description || 'Has diagram/figure'}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditQuestion(question)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDeleteQuestion(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TooltipProvider>
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => {
              setShowPreview(false);
              setExtractedQuestions([]);
              setExtractionStats(null);
              setUploadId(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleImportQuestions} 
              disabled={isImporting || selectedWithAnswers === 0}
            >
              {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Import {selectedWithAnswers} Questions
            </Button>
          </div>
        </CardContent>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Question</DialogTitle>
              <DialogDescription>
                Modify the extracted question details
              </DialogDescription>
            </DialogHeader>
            {editingQuestion && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Question Number</Label>
                    <Input
                      type="number"
                      value={editingQuestion.question_number}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        question_number: parseInt(e.target.value) || 1
                      })}
                    />
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Input
                      value={editingQuestion.section_name}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        section_name: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>Marks</Label>
                    <Input
                      type="number"
                      value={editingQuestion.suggested_marks}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        suggested_marks: parseInt(e.target.value) || 4
                      })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Question Text</Label>
                  <Textarea
                    rows={3}
                    value={editingQuestion.question_text}
                    onChange={(e) => setEditingQuestion({
                      ...editingQuestion,
                      question_text: e.target.value
                    })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Option A</Label>
                    <Input
                      value={editingQuestion.option_a}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        option_a: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option B</Label>
                    <Input
                      value={editingQuestion.option_b}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        option_b: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option C</Label>
                    <Input
                      value={editingQuestion.option_c}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        option_c: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option D</Label>
                    <Input
                      value={editingQuestion.option_d}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        option_d: e.target.value
                      })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Correct Answer</Label>
                  <Select
                    value={editingQuestion.correct_option || ''}
                    onValueChange={(value) => setEditingQuestion({
                      ...editingQuestion,
                      correct_option: value as 'A' | 'B' | 'C' | 'D',
                      confidence_score: 1.0
                    })}
                  >
                    <SelectTrigger>
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

                {editingQuestion.has_image && editingQuestion.image_description && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Diagram Description:</span>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">{editingQuestion.image_description}</p>
                  </div>
                )}

                {editingQuestion.confidence_score !== undefined && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">OCR Confidence:</span>
                    <ConfidenceBadge score={editingQuestion.confidence_score} />
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                <Check className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Question Paper
        </CardTitle>
        <CardDescription>
          Upload a PDF or image containing exam questions. Our AI will extract questions, detect answers, and identify diagrams.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(isUploading || isExtracting) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  {isUploading ? 'Uploading document...' : 'Extracting questions with AI...'}
                </span>
              </div>
              <div className="flex gap-2">
                {isExtracting && liveProgress?.status === 'failed' && (
                  <Button size="sm" variant="outline" onClick={handleRetry}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Retry
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={handleCancel}>
                  <StopCircle className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
            
            <Progress value={progress} className="h-2" />
            
            {isExtracting && liveProgress && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={liveProgress.status === 'processing' ? 'secondary' : liveProgress.status === 'failed' ? 'destructive' : 'default'}>
                    {liveProgress.status === 'processing' ? 'Processing...' : liveProgress.status}
                  </Badge>
                </div>
                
                {liveProgress.total_questions !== null && liveProgress.total_questions > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Questions extracted:</span>
                    <span className="font-medium text-primary">{liveProgress.total_questions}/~75</span>
                  </div>
                )}
                
                {liveProgress.review_notes && (
                  <p className="text-xs text-muted-foreground">
                    {liveProgress.review_notes}
                  </p>
                )}
                
                {liveProgress.error_message && (
                  <p className="text-xs text-destructive">
                    Error: {liveProgress.error_message}
                  </p>
                )}
              </div>
            )}
            
            {isExtracting && !liveProgress && (
              <p className="text-xs text-muted-foreground">
                AI is analyzing the document to extract questions, detect answers from answer key, and identify diagrams...
              </p>
            )}
          </div>
        )}

        {!isUploading && !isExtracting && (
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <div className="flex justify-center gap-4 mb-4">
              <FileImage className="w-10 h-10 text-muted-foreground" />
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <Label 
              htmlFor="file-upload" 
              className="cursor-pointer text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="font-medium text-primary">Click to upload</span> or drag and drop
              <br />
              <span className="text-xs">PDF, JPEG, PNG or WebP (max 10MB)</span>
            </Label>
            <Input
              id="file-upload"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Enhanced OCR Features
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>Batch extraction:</strong> Extracts all 75+ questions in batches (won't get truncated)</li>
            <li>• <strong>Answer key detection:</strong> Finds and parses answer key tables at end of document</li>
            <li>• <strong>Diagram detection:</strong> Identifies questions with figures, graphs, and circuits</li>
            <li>• <strong>Live progress:</strong> See extraction progress in real-time</li>
            <li>• <strong>LaTeX support:</strong> Preserves mathematical notation</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
