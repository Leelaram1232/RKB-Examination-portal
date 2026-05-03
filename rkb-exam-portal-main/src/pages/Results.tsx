import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Calendar, ExternalLink, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PublicLayout } from '@/components/layout/PublicLayout';

interface PublishedExam {
  id: string;
  exam_name: string;
  exam_code: string;
  exam_date: string;
  results_published_at: string | null;
  total_marks: number;
}

export default function Results() {
  const [publishedExams, setPublishedExams] = useState<PublishedExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPublishedResults = async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('id, exam_name, exam_code, exam_date, results_published_at, total_marks')
        .eq('results_published', true)
        .order('results_published_at', { ascending: false });

      if (!error && data) {
        setPublishedExams(data);
      }
      setIsLoading(false);
    };

    fetchPublishedResults();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Examination Results</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            View and download your scorecard for published examination results. 
            Login with your registered email and date of birth to access your result.
          </p>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        ) : publishedExams.length === 0 ? (
          /* Empty State */
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-8 pb-8 text-center">
              <Award className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Results Published Yet</h3>
              <p className="text-muted-foreground">
                Results will appear here once they are published by the administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Results Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {publishedExams.map((exam) => (
              <Card key={exam.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{exam.exam_name}</CardTitle>
                      <CardDescription className="mt-1">
                        Code: {exam.exam_code}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Published
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Exam Date: {formatDate(exam.exam_date)}</span>
                    </div>
                    {exam.results_published_at && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Award className="w-4 h-4" />
                        <span>Published: {formatDate(exam.results_published_at)}</span>
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      Total Marks: {exam.total_marks}
                    </div>
                  </div>

                  <Button asChild className="w-full gap-2">
                    <Link to={`/results/${exam.id}/login`}>
                      <ExternalLink className="w-4 h-4" />
                      View Result
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Section */}
        <Card className="mt-10 bg-muted/30">
          <CardContent className="py-6">
            <h3 className="font-semibold text-foreground mb-3">How to View Your Result</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Click on "View Result" for the exam you want to check.</li>
              <li>Enter your registered email address.</li>
              <li>Enter your password (Date of Birth in DDMMYY format, e.g., 15012000 for 15th Jan 2000).</li>
              <li>View and download your scorecard.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
