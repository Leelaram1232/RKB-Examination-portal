import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Lock, Mail, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { invokeExternalFunction } from '@/lib/externalSupabase';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().length(6, 'Password must be 6 digits (DDMMYY format)'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface Exam {
  id: string;
  exam_name: string;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  instructions: string | null;
}

// Helper function to parse exam datetime
const parseExamDateTime = (examDate: string, examTime: string): Date => {
  const date = new Date(examDate);
  const [hours, minutes, seconds] = examTime.split(':').map(Number);
  date.setHours(hours, minutes, seconds || 0, 0);
  return date;
};

export default function ExamLogin() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    const fetchExam = async () => {
      if (!examId) return;

      const { data, error } = await supabase
        .from('exams')
        .select('id, exam_name, exam_date, exam_time, duration_minutes, instructions, status')
        .eq('id', examId)
        .maybeSingle();

      if (error || !data) {
        toast({
          title: 'Error',
          description: 'Exam not found',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      // Check if exam is in draft or results published (not available)
      if (data.status === 'draft' || data.status === 'results_published') {
        toast({
          title: 'Exam Not Available',
          description: 'This exam is not currently available for taking',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      // Validate exam is within time window
      const now = new Date();
      const examStart = parseExamDateTime(data.exam_date, data.exam_time);
      const examEnd = new Date(examStart.getTime() + data.duration_minutes * 60000);

      if (now < examStart || now > examEnd) {
        toast({
          title: 'Exam Not Available',
          description: 'This exam is not currently within its scheduled time window',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      setExam(data);
      setIsLoading(false);
    };

    fetchExam();
  }, [examId, navigate, toast]);

  const onSubmit = async (data: LoginFormData) => {
    if (!examId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      console.log(`[ExamLogin] Attempting login for exam: ${examId} with email: ${data.email}`);
      const { data: result, error: invocationError } = await invokeExternalFunction<any>('exam-login', {
        exam_id: examId,
        email: data.email.toLowerCase(),
        password: data.password,
      });

      if (invocationError) {
        console.error('[ExamLogin] Function invocation error:', invocationError);
        throw new Error(invocationError.message || 'Login failed');
      }

      if (!result || !result.success) {
        console.log('[ExamLogin] Login rejected:', result?.error || 'Unknown error');
        throw new Error(result?.error || 'Login failed. Please check your credentials or approval status.');
      }

      // Store session info in sessionStorage
      sessionStorage.setItem('examSession', JSON.stringify({
        session_id: result.session_id,
        registration_id: result.registration_id,
        registration_number: result.registration_number,
        student_name: result.student_name,
        start_time: result.start_time,
        is_resume: result.is_resume,
        exam: result.exam,
        questions: result.questions,
        existing_answers: result.existing_answers,
      }));

      toast({
        title: result.is_resume ? 'Session Resumed' : 'Login Successful',
        description: result.is_resume 
          ? 'Resuming your previous exam session' 
          : 'Starting your exam...',
      });

      navigate(`/exam/${examId}/instructions`);

    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container max-w-md py-8">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Exam Login</CardTitle>
            {exam && (
              <CardDescription className="space-y-1">
                <span className="block font-medium text-foreground">{exam.exam_name}</span>
                <span className="block">
                  {format(new Date(exam.exam_date), 'PPP')} at {exam.exam_time}
                </span>
                <span className="block">Duration: {exam.duration_minutes} minutes</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 text-sm">
                <strong>Login Credentials:</strong><br />
                Email: Your registered email<br />
                Password: Your Date of Birth (DDMMYY format)<br />
                Example: DOB 25-08-2005 → Password: 250805
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="email" 
                            placeholder="Enter your registered email" 
                            className="pl-10"
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password (DOB)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            type="password" 
                            placeholder="DDMMYY (e.g., 250805)" 
                            className="pl-10"
                            maxLength={6}
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? 'Logging in...' : 'Start Exam'}
                </Button>
              </form>
            </Form>

            <div className="text-center text-sm text-muted-foreground">
              <p>Only approved students can login.</p>
              <p>Contact admin if you face any issues.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
