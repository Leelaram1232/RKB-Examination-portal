import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Play, 
  StopCircle, 
  Eye,
  RefreshCw,
  User,
  Clock,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

interface ExamSession {
  id: string;
  registration_id: string;
  start_time: string | null;
  end_time: string | null;
  is_completed: boolean;
  is_auto_submitted: boolean;
  violation_count: number;
  proctoring_violations: Json;
  submitted_at: string | null;
  registration: {
    registration_number: string;
    student: {
      full_name: string;
      email: string;
    };
  };
}

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
  max_violations: number;
  auto_submit_on_violations: boolean;
}

const SessionManagement = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);
  const [showAllowContinueDialog, setShowAllowContinueDialog] = useState(false);
  const [showEndExamDialog, setShowEndExamDialog] = useState(false);
  const [showViolationsDialog, setShowViolationsDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchData = async () => {
    if (!examId) return;

    setIsLoading(true);

    // Fetch exam details
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .select('id, exam_name, exam_code, max_violations, auto_submit_on_violations')
      .eq('id', examId)
      .single();

    if (examError || !examData) {
      toast.error('Exam not found');
      navigate('/admin/exams');
      return;
    }

    setExam(examData);

    // Fetch sessions with registration and student info
    const { data: sessionsData, error: sessionsError } = await supabase
      .from('exam_sessions')
      .select(`
        id,
        registration_id,
        start_time,
        end_time,
        is_completed,
        is_auto_submitted,
        violation_count,
        proctoring_violations,
        submitted_at,
        registration:registrations!registrations_exam_id_fkey(
          registration_number,
          exam_id,
          student:profiles!registrations_student_id_profiles_fkey(
            full_name,
            email
          )
        )
      `)
      .eq('registration.exam_id', examId)
      .order('start_time', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      toast.error('Failed to load sessions');
    } else {
      // Transform data to match our interface
      const transformedSessions = (sessionsData || []).map((s: any) => ({
        ...s,
        registration: {
          registration_number: s.registration?.registration_number || 'N/A',
          student: {
            full_name: s.registration?.student?.full_name || 'Unknown',
            email: s.registration?.student?.email || 'N/A',
          },
        },
      }));
      setSessions(transformedSessions);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [examId, navigate]);

  const handleAllowContinue = async () => {
    if (!selectedSession) return;

    setIsProcessing(true);

    // Reset the session to 'resumed' status - keep violation count for tracking
    const { error: sessionError } = await supabase
      .from('exam_sessions')
      .update({
        is_completed: false,
        is_auto_submitted: false,
        is_blocked: false,
        exam_status: 'resumed', // NEW: Set to resumed instead of just resetting flags
        submitted_at: null,
        resume_allowed_at: new Date().toISOString(),
        // Note: violation_count is NOT reset - kept for tracking
      })
      .eq('id', selectedSession.id);

    if (sessionError) {
      toast.error('Failed to reset session');
    } else {
      // Re-enable exam login for the student
      await supabase
        .from('registrations')
        .update({ exam_login_enabled: true })
        .eq('id', selectedSession.registration_id);

      // Also delete old result if exists (for resumed exams)
      await supabase
        .from('results')
        .delete()
        .eq('session_id', selectedSession.id);

      toast.success('Student can now continue the exam. They will resume from where they left off.');
      fetchData();
    }

    setIsProcessing(false);
    setShowAllowContinueDialog(false);
    setSelectedSession(null);
  };

  const handleEndExam = async () => {
    if (!selectedSession) return;

    setIsProcessing(true);

    // Mark the session as completed
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        is_completed: true,
        end_time: new Date().toISOString(),
      })
      .eq('id', selectedSession.id);

    if (error) {
      toast.error('Failed to end exam');
    } else {
      toast.success('Exam has been ended for this student');
      fetchData();
    }

    setIsProcessing(false);
    setShowEndExamDialog(false);
    setSelectedSession(null);
  };

  const getStatusBadge = (session: ExamSession) => {
    if (session.is_auto_submitted) {
      return <Badge variant="destructive">Auto-Submitted (Violations)</Badge>;
    }
    if (session.is_completed) {
      return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
    }
    if (session.start_time) {
      return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
    }
    return <Badge variant="secondary">Not Started</Badge>;
  };

  const autoSubmittedSessions = sessions.filter(s => s.is_auto_submitted);
  const activeSessions = sessions.filter(s => s.start_time && !s.is_completed);

  if (isLoading) {
    return (
      <AdminLayout title="Session Management" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Session Management" 
      description={`Manage exam sessions for ${exam?.exam_name || 'Exam'}`}
    >
      <div className="space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate('/admin/exams')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Exams
        </Button>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sessions</p>
                  <p className="text-2xl font-bold">{sessions.length}</p>
                </div>
                <User className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Now</p>
                  <p className="text-2xl font-bold text-blue-600">{activeSessions.length}</p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Auto-Submitted</p>
                  <p className="text-2xl font-bold text-destructive">{autoSubmittedSessions.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Max Violations</p>
                  <p className="text-2xl font-bold">{exam?.max_violations || 3}</p>
                </div>
                <Shield className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Auto-Submitted Sessions Alert */}
        {autoSubmittedSessions.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Students Auto-Submitted Due to Violations
              </CardTitle>
              <CardDescription>
                These students exceeded the maximum violations ({exam?.max_violations || 3}) and their exams were auto-submitted. 
                You can allow them to continue or keep the exam ended.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Registration #</TableHead>
                    <TableHead>Violations</TableHead>
                    <TableHead>Auto-Submitted At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoSubmittedSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{session.registration.student.full_name}</p>
                          <p className="text-sm text-muted-foreground">{session.registration.student.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{session.registration.registration_number}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{session.violation_count || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        {session.submitted_at ? format(new Date(session.submitted_at), 'PPp') : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSession(session);
                            setShowViolationsDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            setSelectedSession(session);
                            setShowAllowContinueDialog(true);
                          }}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Allow Continue
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>All Exam Sessions</CardTitle>
              <CardDescription>View and manage all student exam sessions</CardDescription>
            </div>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No exam sessions found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Registration #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Violations</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{session.registration.student.full_name}</p>
                          <p className="text-sm text-muted-foreground">{session.registration.student.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{session.registration.registration_number}</TableCell>
                      <TableCell>{getStatusBadge(session)}</TableCell>
                      <TableCell>
                        <Badge variant={session.violation_count > 0 ? "destructive" : "secondary"}>
                          {session.violation_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {session.start_time ? format(new Date(session.start_time), 'PPp') : 'Not started'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {session.violation_count > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedSession(session);
                              setShowViolationsDialog(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {!session.is_completed && session.start_time && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedSession(session);
                              setShowEndExamDialog(true);
                            }}
                          >
                            <StopCircle className="w-4 h-4 mr-1" />
                            End Exam
                          </Button>
                        )}
                        {session.is_auto_submitted && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedSession(session);
                              setShowAllowContinueDialog(true);
                            }}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Allow Continue
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allow Continue Dialog */}
      <AlertDialog open={showAllowContinueDialog} onOpenChange={setShowAllowContinueDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow Student to Continue Exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the student's violation count and allow them to continue their exam.
              The student will need to log in again to resume.
              <br /><br />
              <strong>Student:</strong> {selectedSession?.registration.student.full_name}
              <br />
              <strong>Current Violations:</strong> {selectedSession?.violation_count || 0}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAllowContinue} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Allow Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* End Exam Dialog */}
      <AlertDialog open={showEndExamDialog} onOpenChange={setShowEndExamDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Exam for Student?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately end the exam for this student. Their current answers will be saved.
              <br /><br />
              <strong>Student:</strong> {selectedSession?.registration.student.full_name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEndExam} 
              disabled={isProcessing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isProcessing ? 'Processing...' : 'End Exam'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Violations Detail Dialog */}
      <Dialog open={showViolationsDialog} onOpenChange={setShowViolationsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Violation Details</DialogTitle>
            <DialogDescription>
              Violations recorded for {selectedSession?.registration.student.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <span className="font-medium">Total Violations:</span>
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {selectedSession?.violation_count || 0}
              </Badge>
            </div>
            
            {selectedSession?.proctoring_violations && Array.isArray(selectedSession.proctoring_violations) && (
              <div className="space-y-2">
                <h4 className="font-medium">Violation Log:</h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {(selectedSession.proctoring_violations as any[]).map((violation, index) => (
                    <div key={index} className="p-3 border rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{violation.type || 'Violation'}</span>
                        <span className="text-muted-foreground">
                          {violation.timestamp ? format(new Date(violation.timestamp), 'PPp') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(!selectedSession?.proctoring_violations || 
              !Array.isArray(selectedSession.proctoring_violations) || 
              selectedSession.proctoring_violations.length === 0) && (
              <p className="text-muted-foreground text-center py-4">
                No detailed violation log available
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default SessionManagement;
