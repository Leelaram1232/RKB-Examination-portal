import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  BrainCircuit
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedQuestion } from '@/lib/questionParser';
import { QuestionPreviewCard } from '@/components/admin/QuestionPreviewCard';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/externalSupabase';

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
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

      const { data: { publicUrl } } = supabase.storage.from('question-uploads').getPublicUrl(path);
      setFileUrl(publicUrl);
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

      const { data, error } = await supabase.functions.invoke('ai-question-assistant', {
        body: {
          messages: conversationHistory,
          file_url: fileUrl,
          exam_id: selectedExam,
          subject_id: selectedSubject,
        }
      });

      if (error) throw error;

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      if (data.questions && data.questions.length > 0) {
        const newQuestions = data.questions.map((q: any, idx: number) => ({
          ...q,
          id: Math.random().toString(36).substring(2, 11),
          questionNumber: generatedQuestions.length + idx + 1,
          isValid: true,
          errors: [],
          hasLatex: true,
          sectionName: q.section_name || 'General',
          questionText: q.question_text,
          optionA: q.option_a,
          optionB: q.option_b,
          optionC: q.option_c,
          optionD: q.option_d,
          correctOption: q.correct_option,
          marks: q.marks || 4,
        }));
        setGeneratedQuestions(prev => [...prev, ...newQuestions]);
        toast.success(`Generated ${newQuestions.length} questions!`);
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

      const questionsToInsert = validQuestions.map((q, idx) => ({
        exam_id: selectedExam,
        subject_id: selectedSubject || null,
        question_number: nextNum + idx,
        section_name: q.sectionName || 'General',
        question_text: q.questionText,
        option_a: q.optionA,
        option_b: q.optionB,
        option_c: q.optionC,
        option_d: q.optionD,
        correct_option: q.correctOption,
        marks: q.marks || 4,
        question_type: 'MCQ',
      }));

      const { error } = await supabase.from('questions').insert(questionsToInsert);
      if (error) throw error;

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
      <AdminLayout title="AI Assistant" description="...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="AI Question Assistant" description="Generate and extract exam questions with AI">
      <div className="flex flex-col h-[calc(100vh-180px)] space-y-4">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Chat Sidebar */}
          <Card className="flex flex-col h-full lg:col-span-1 shadow-md border-primary/20">
            <CardHeader className="py-3 px-4 bg-primary/5">
              <CardTitle className="text-sm flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                AI Assistant (Groq Llama 3)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border'
                    }`}>
                      {m.content}
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
              </div>
              
              <div className="p-4 border-t bg-muted/30 space-y-2">
                {fileName && (
                   <div className="flex items-center gap-2 bg-primary/10 p-2 rounded text-xs text-primary mb-2">
                     <FileText className="h-3 w-3" />
                     {fileName}
                     <button onClick={() => {setFileUrl(null); setFileName(null)}} className="ml-auto">
                        <Trash2 className="h-3 w-3" />
                     </button>
                   </div>
                )}
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
          <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            <Card className="flex flex-col h-full shadow-lg">
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
              <CardContent className="flex-1 p-0 overflow-hidden">
                {generatedQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center">
                    <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-1">No questions generated yet</h3>
                    <p className="text-sm max-w-xs">
                      Use the AI Assistant on the left to generate new questions or analyze an uploaded PDF.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-full p-6">
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
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
