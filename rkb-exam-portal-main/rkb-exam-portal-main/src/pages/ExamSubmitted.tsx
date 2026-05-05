import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ExamSubmitted() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>

          {/* Thank You Message */}
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-foreground">
              Thank You for Attending the Examination
            </h1>
            <p className="text-muted-foreground text-lg">
              Your responses have been submitted successfully.
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              Your answers have been recorded and will be evaluated. 
              Results will be published by the administrator after the evaluation process is complete.
            </p>
          </div>

          {/* Important Notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
            <p className="text-amber-800 dark:text-amber-200">
              <strong>Important:</strong> You can view your results once they are published by the administrator. 
              Please check the Results section on the main website.
            </p>
          </div>

          {/* Action Button */}
          <Button
            onClick={() => navigate('/')}
            size="lg"
            className="gap-2"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
