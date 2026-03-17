import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Monitor,
  FileText,
  BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useToast } from '@/hooks/use-toast';
import { CameraGate } from '@/components/exam/CameraGate';

interface ExamSession {
  session_id: string;
  registration_id: string;
  registration_number: string;
  student_name: string;
  start_time: string;
  is_resume: boolean;
  exam: {
    exam_name: string;
    duration_minutes: number;
    total_marks: number;
    negative_marking: boolean;
    negative_mark_value: number | null;
    instructions: string | null;
    proctoring_enabled?: boolean | null;
  };
}

export default function ExamInstructions() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showCameraGate, setShowCameraGate] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  useEffect(() => {
    const sessionData = sessionStorage.getItem('examSession');
    
    if (!sessionData) {
      toast({
        title: 'Session Not Found',
        description: 'Please login again to start the exam',
        variant: 'destructive',
      });
      navigate(`/exam/${examId}/login`);
      return;
    }

    try {
      const parsed = JSON.parse(sessionData) as ExamSession;
      setSession(parsed);
    } catch (error) {
      navigate(`/exam/${examId}/login`);
    }
    
    setIsLoading(false);
  }, [examId, navigate, toast]);

  // Check if proctoring requires camera
  const proctoringEnabled = session?.exam?.proctoring_enabled ?? false;

  // Show camera gate when proctoring is enabled
  useEffect(() => {
    if (session && proctoringEnabled && !cameraReady) {
      setShowCameraGate(true);
    }
  }, [session, proctoringEnabled, cameraReady]);

  const handleCameraReady = (stream: MediaStream) => {
    setCameraStream(stream);
    setCameraReady(true);
    setShowCameraGate(false);
    // Store stream reference in sessionStorage for ExamInterface
    sessionStorage.setItem('cameraReady', 'true');
  };

  const handleCameraDenied = () => {
    toast({
      title: 'Camera Required',
      description: 'Camera access is required for this proctored exam. Please allow camera access to continue.',
      variant: 'destructive',
    });
  };

  const handleStartExam = () => {
    if (!termsAccepted || !declarationAccepted) {
      toast({
        title: 'Accept Terms',
        description: 'Please accept all terms and declarations before starting',
        variant: 'destructive',
      });
      return;
    }

    // Check camera if proctoring is enabled
    if (proctoringEnabled && !cameraReady) {
      setShowCameraGate(true);
      toast({
        title: 'Camera Required',
        description: 'Please allow camera access before starting the exam',
        variant: 'destructive',
      });
      return;
    }

    navigate(`/exam/${examId}/take`);
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

  if (!session) {
    return null;
  }

  const generalInstructions = [
    'The examination will start as soon as you click "Start Exam".',
    `Total time allotted is ${session.exam.duration_minutes} minutes.`,
    `The exam contains questions worth ${session.exam.total_marks} marks in total.`,
    session.exam.negative_marking 
      ? `Negative marking is applicable. ${session.exam.negative_mark_value} marks will be deducted for each wrong answer.`
      : 'There is no negative marking for wrong answers.',
    'You can navigate between questions using the question palette on the right.',
    'You can mark questions for review and revisit them later.',
    'Your answers are saved automatically when you navigate to another question.',
    'The exam will be auto-submitted when the time expires.',
  ];

  const technicalInstructions = [
    'Do NOT refresh or close the browser during the exam.',
    'Do NOT switch tabs or windows during the exam.',
    'Ensure stable internet connectivity throughout the exam.',
    'Use a desktop or laptop for best experience.',
    'Keep your browser zoom at 100% for optimal display.',
  ];

  return (
    <PublicLayout>
      {/* Camera Gate Overlay */}
      {showCameraGate && proctoringEnabled && (
        <CameraGate
          onCameraReady={handleCameraReady}
          onCameraDenied={handleCameraDenied}
        />
      )}

      <div className="container max-w-4xl py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate(`/exam/${examId}/login`)} 
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Button>

        <Card className="mb-6">
          <CardHeader className="text-center border-b">
            <CardTitle className="text-2xl">{session.exam.exam_name}</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">Candidate: {session.student_name}</span>
              <span className="block">Registration No: {session.registration_number}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Exam Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="text-center p-4 bg-secondary/30 rounded-lg">
                <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-semibold">{session.exam.duration_minutes} mins</p>
              </div>
              <div className="text-center p-4 bg-secondary/30 rounded-lg">
                <FileText className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Total Marks</p>
                <p className="font-semibold">{session.exam.total_marks}</p>
              </div>
              <div className="text-center p-4 bg-secondary/30 rounded-lg">
                <BookOpen className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Negative Marks</p>
                <p className="font-semibold">
                  {session.exam.negative_marking ? session.exam.negative_mark_value : 'None'}
                </p>
              </div>
              <div className="text-center p-4 bg-secondary/30 rounded-lg">
                <Monitor className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">Mode</p>
                <p className="font-semibold">Online</p>
              </div>
            </div>

            {/* Resume Alert */}
            {session.is_resume && (
              <Alert className="mb-6 border-yellow-500 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  You are resuming a previous session. Your previous answers have been saved.
                </AlertDescription>
              </Alert>
            )}

            {/* Custom Instructions */}
            {session.exam.instructions && (
              <Card className="mb-6 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-lg">Exam-Specific Instructions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {session.exam.instructions}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* General Instructions */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  General Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {generalInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs">
                        {index + 1}
                      </span>
                      {instruction}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Technical Instructions */}
            <Card className="mb-6 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Technical Guidelines (Important)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {technicalInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-destructive/80">
                      <span className="text-destructive">•</span>
                      {instruction}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Question Palette Legend */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Question Status Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gray-300 border" />
                    <span className="text-sm">Not Visited</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-red-500" />
                    <span className="text-sm">Not Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-green-500" />
                    <span className="text-sm">Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-purple-500" />
                    <span className="text-sm">Marked for Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-purple-500 border-2 border-green-400" />
                    <span className="text-sm">Answered & Marked</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Terms & Declaration */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <Checkbox 
                  id="terms" 
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                />
                <label 
                  htmlFor="terms" 
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  I have read and understood all the instructions mentioned above. I understand that 
                  any violation of the examination rules may result in disqualification.
                </label>
              </div>

              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <Checkbox 
                  id="declaration" 
                  checked={declarationAccepted}
                  onCheckedChange={(checked) => setDeclarationAccepted(checked === true)}
                />
                <label 
                  htmlFor="declaration" 
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  I declare that I am the registered candidate and I will not use any unfair means 
                  during the examination. I understand that my session may be terminated if any 
                  malpractice is detected.
                </label>
              </div>
            </div>

            {/* Camera Status for Proctored Exams */}
            {proctoringEnabled && (
              <Alert className={`mb-6 ${cameraReady ? 'border-green-500 bg-green-50' : 'border-amber-500 bg-amber-50'}`}>
                <Monitor className={`h-4 w-4 ${cameraReady ? 'text-green-600' : 'text-amber-600'}`} />
                <AlertDescription className={cameraReady ? 'text-green-800' : 'text-amber-800'}>
                  {cameraReady 
                    ? '✓ Camera is ready. You can start the exam.'
                    : 'This is a proctored exam. Camera access will be required before starting.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center">
              <Button 
                size="lg" 
                className="px-12"
                disabled={!termsAccepted || !declarationAccepted || (proctoringEnabled && !cameraReady)}
                onClick={handleStartExam}
              >
                {session.is_resume ? 'Resume Exam' : 'I Agree & Start Exam'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
