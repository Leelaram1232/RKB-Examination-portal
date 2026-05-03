import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Mail, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { PublicLayout } from '@/components/layout/PublicLayout';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be 6 digits (DDMMYY format)').max(6, 'Password must be 6 digits'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface ExamInfo {
  exam_name: string;
  exam_code: string;
  exam_date: string;
}

export default function ResultLogin() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [isFetchingExam, setIsFetchingExam] = useState(true);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    const fetchExamInfo = async () => {
      if (!examId) return;

      const { data, error } = await supabase
        .from('exams')
        .select('exam_name, exam_code, exam_date, results_published')
        .eq('id', examId)
        .single();

      if (error || !data) {
        toast({
          title: 'Exam Not Found',
          description: 'The requested exam does not exist.',
          variant: 'destructive',
        });
        navigate('/results');
        return;
      }

      if (!data.results_published) {
        toast({
          title: 'Results Not Published',
          description: 'Results for this exam have not been published yet.',
          variant: 'destructive',
        });
        navigate('/results');
        return;
      }

      setExamInfo(data);
      setIsFetchingExam(false);
    };

    fetchExamInfo();
  }, [examId, navigate, toast]);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('result-login', {
        body: {
          email: data.email,
          password: data.password,
          exam_id: examId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data.success) {
        throw new Error(response.data.error || 'Login failed');
      }

      // Store result data for scorecard page
      sessionStorage.setItem('studentResult', JSON.stringify(response.data));
      navigate(`/results/${examId}/scorecard`);
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid credentials. Please check your email and date of birth.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetchingExam) {
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
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate('/results')}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Results
          </Button>

          <Card>
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>View Your Result</CardTitle>
              <CardDescription>
                {examInfo && (
                  <span className="block mt-2 font-medium text-foreground">
                    {examInfo.exam_name}
                  </span>
                )}
                Enter your credentials to access your scorecard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="your.email@example.com"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Email used during exam registration
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="DDMMYY"
                              className="pl-10"
                              maxLength={6}
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Your Date of Birth in DDMMYY format (e.g., 150100 for 15th Jan 2000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'View Scorecard'
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
