import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Minus, Trophy, Download, Home, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PublicLayout } from '@/components/layout/PublicLayout';

interface SectionScore {
  correct: number;
  wrong: number;
  unanswered: number;
  marks: number;
  total_marks: number;
  total_questions: number;
}

interface ExamResult {
  success: boolean;
  result_id: string;
  total_marks: number;
  obtained_marks: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  passing_marks: number;
  is_pass: boolean;
  section_wise_scores?: Record<string, SectionScore>;
}

export default function ExamResult() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<ExamResult | null>(null);

  useEffect(() => {
    const resultData = sessionStorage.getItem('examResult');
    if (!resultData) {
      navigate('/');
      return;
    }

    setResult(JSON.parse(resultData));
  }, [navigate]);

  const handlePrint = () => {
    window.print();
  };

  if (!result) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </PublicLayout>
    );
  }

  const totalQuestions = result.correct_count + result.wrong_count + result.unanswered_count;
  const percentage = Math.round((result.obtained_marks / result.total_marks) * 100);
  const accuracy = totalQuestions > 0 
    ? Math.round((result.correct_count / (result.correct_count + result.wrong_count || 1)) * 100)
    : 0;

  const sectionScores = result.section_wise_scores || {};
  const hasSections = Object.keys(sectionScores).length > 0;

  return (
    <PublicLayout>
      <div className="container max-w-3xl py-8 print:py-2">
        {/* Header */}
        <div className="text-center mb-8 print:mb-4">
          <div
            className={cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full mb-4',
              result.is_pass ? 'bg-success/20' : 'bg-destructive/20'
            )}
          >
            {result.is_pass ? (
              <Trophy className="h-10 w-10 text-success" />
            ) : (
              <XCircle className="h-10 w-10 text-destructive" />
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {result.is_pass ? 'Congratulations!' : 'Better Luck Next Time'}
          </h1>
          <p className="text-muted-foreground">
            {result.is_pass
              ? 'You have successfully passed the examination'
              : 'You did not meet the passing criteria'}
          </p>
          <Badge
            variant={result.is_pass ? 'default' : 'destructive'}
            className="mt-3 text-lg px-4 py-1"
          >
            {result.is_pass ? 'PASSED' : 'NOT PASSED'}
          </Badge>
        </div>

        {/* Score Card */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="text-center border-b">
            <CardTitle>Examination Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Main Score */}
            <div className="text-center mb-8">
              <div className="text-6xl font-bold text-primary mb-2">
                {result.obtained_marks}
                <span className="text-2xl text-muted-foreground">/{result.total_marks}</span>
              </div>
              <Progress value={percentage} className="h-3 max-w-xs mx-auto" />
              <p className="text-muted-foreground mt-2">{percentage}% Score</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span className="text-sm font-medium text-success">Correct</span>
                </div>
                <p className="text-3xl font-bold text-success">{result.correct_count}</p>
              </div>

              <div className="text-center p-4 bg-destructive/10 rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Wrong</span>
                </div>
                <p className="text-3xl font-bold text-destructive">{result.wrong_count}</p>
              </div>

              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Minus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Skipped</span>
                </div>
                <p className="text-3xl font-bold">{result.unanswered_count}</p>
              </div>
            </div>

            {/* Section-wise Scores */}
            {hasSections && (
              <div className="mb-8">
                <h3 className="font-semibold mb-4 text-lg">Section-wise Performance</h3>
                <div className="space-y-4">
                  {Object.entries(sectionScores).map(([sectionName, scores]) => {
                    const sectionPercentage = scores.total_marks > 0 
                      ? Math.round((scores.marks / scores.total_marks) * 100) 
                      : 0;
                    return (
                      <div key={sectionName} className="border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{sectionName}</span>
                          <span className="text-primary font-bold">
                            {scores.marks.toFixed(1)} / {scores.total_marks}
                          </span>
                        </div>
                        <Progress value={sectionPercentage} className="h-2 mb-2" />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span className="text-success">✓ {scores.correct} correct</span>
                          <span className="text-destructive">✗ {scores.wrong} wrong</span>
                          <span>○ {scores.unanswered} skipped</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Additional Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Questions:</span>
                <span className="font-medium">{totalQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Passing Marks:</span>
                <span className="font-medium">{result.passing_marks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Accuracy:</span>
                <span className="font-medium">{accuracy}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Result:</span>
                <span className={cn('font-medium', result.is_pass ? 'text-success' : 'text-destructive')}>
                  {result.is_pass ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-4 no-print">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print Scorecard
          </Button>
          <Button onClick={() => navigate('/')} className="gap-2">
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </div>

        {/* Notice */}
        <div className="mt-8 p-4 bg-info/10 border border-info/20 rounded-lg text-center no-print">
          <p className="text-sm text-info">
            Your detailed result will be available on the Results page after official publication.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
