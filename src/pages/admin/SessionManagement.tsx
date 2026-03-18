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
import { externalSupabase } from '@/lib/externalSupabase';

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

    // Robust fetch: avoid fragile joins by mapping registrations -> profiles -> sessions.
    // If internal registrations query fails (RLS / wrong DB), fall back to external.
    const { data: regsInternal, error: regErr } = await supabase
      .from('registrations')
      .select('id, registration_number, student_id')
      .eq('exam_id', examId);

    const usingExternalRegistrations = !!regErr;
    let regs: any[] = regsInternal || [];
    if (regErr) {
      console.error('Error fetching internal registrations:', regErr);
      const { data: regsExternal, error: regsExternalErr } = await externalSupabase
        .from('registrations')
        .select('id, registration_number, student_id')
        .eq('exam_id', examId);

      if (regsExternalErr || !regsExternal) {
        toast.error('Failed to load sessions');
        setIsLoading(false);
        return;
      }
      regs = regsExternal;
    }

    const regIds = (regs || []).map((r) => r.id);
    const studentIds = [...new Set((regs || []).map((r) => r.student_id).filter(Boolean))];

    if (regIds.length === 0) {
      // Fallback: sessions might exist in external DB even if registrations mapping is missing internally.
      const { data: externalSessionsData } = await externalSupabase
        .from('exam_sessions')
        .select(
          'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, submitted_at'
        )
        .order('start_time', { ascending: false })
        .limit(200);

      const extSessions = externalSessionsData || [];
      const extRegistrationIds = [...new Set(extSessions.map((s: any) => s.registration_id).filter(Boolean))];

      if (extRegistrationIds.length === 0) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      // Sessions were found in external DB; map them using external registrations/profiles too.
      const { data: extRegs } = await externalSupabase
        .from('registrations')
        .select('id, registration_number, student_id, exam_id')
        .in('id', extRegistrationIds);

      const extRegMap = new Map((extRegs || []).map((r: any) => [r.id, r]));
      const filteredSessions = extSessions.filter((s: any) => {
        const reg = extRegMap.get(s.registration_id);
        return reg?.exam_id === examId;
      });

      const extStudentIds = [...new Set(filteredSessions.map((s: any) => extRegMap.get(s.registration_id)?.student_id).filter(Boolean))];
      const { data: extProfiles } = await externalSupabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', extStudentIds);
      const extProfileMap = new Map((extProfiles || []).map((p: any) => [p.id, p]));

      const transformedSessions = (filteredSessions || []).map((s: any) => {
        const reg = extRegMap.get(s.registration_id);
        const profile = reg?.student_id ? extProfileMap.get(reg.student_id) : null;
        return {
          ...s,
          registration: {
            registration_number: reg?.registration_number || 'N/A',
            student: {
              full_name: profile?.full_name || 'Unknown',
              email: profile?.email || 'N/A',
            },
          },
        };
      });

      setSessions(transformedSessions);
      setIsLoading(false);
      return;
    }

    const profilesClient = usingExternalRegistrations ? (externalSupabase as any) : supabase;
    const { data: profiles, error: profErr } = await profilesClient
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);

    if (profErr) {
      console.error('Error fetching profiles:', profErr);
    }

    const regMap = new Map((regs || []).map((r) => [r.id, r]));
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const sessionsClient = usingExternalRegistrations ? (externalSupabase as any) : supabase;
    const { data: sessionsData, error: sessionsError } = await sessionsClient
      .from('exam_sessions')
      .select(
        'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, submitted_at'
      )
      .in('registration_id', regIds)
      .order('start_time', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      // Fallback: try other DB for sessions at least.
      const { data: extSessionsData, error: extSessionsError } = await (usingExternalRegistrations ? supabase : (externalSupabase as any))
        .from('exam_sessions')
        .select(
          'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, submitted_at'
        )
        .in('registration_id', regIds)
        .order('start_time', { ascending: false });

      if (extSessionsError) {
        toast.error('Failed to load sessions');
        setSessions([]);
      } else {
        const transformedSessions = (extSessionsData || []).map((s: any) => {
          const reg = regMap.get(s.registration_id);
          const profile = reg?.student_id ? profileMap.get(reg.student_id) : null;
          return {
            ...s,
            registration: {
              registration_number: reg?.registration_number || 'N/A',
              student: {
                full_name: profile?.full_name || 'Unknown',
                email: profile?.email || 'N/A',
              },
            },
          };
        });
        setSessions(transformedSessions);
      }
    } else {
      // If internal sessions are empty, fallback to external sessions.
      const sessionsToUse = (sessionsData || []).length
        ? sessionsData
        : await externalSupabase
            .from('exam_sessions')
            .select(
              'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, submitted_at'
            )
            .in('registration_id', regIds)
            .order('start_time', { ascending: false })
            .then((r) => r.data || []);

      const transformedSessions = (sessionsToUse || []).map((s: any) => {
        const reg = regMap.get(s.registration_id);
        const profile = reg?.student_id ? profileMap.get(reg.student_id) : null;
        return {
          ...s,
          registration: {
            registration_number: reg?.registration_number || 'N/A',
            student: {
              full_name: profile?.full_name || 'Unknown',
              email: profile?.email || 'N/A',
            },
          },
        };
      });

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
    const resumePayload = {
      is_completed: false,
      is_auto_submitted: false,
      is_blocked: false,
      exam_status: 'resumed',
      submitted_at: null,
      resume_allowed_at: new Date().toISOString(),
      // Keep violation_count for tracking
    };

    // Update both internal and external to guarantee the student can resume.
    const [internalSessionRes, externalSessionRes] = await Promise.all([
      supabase
        .from('exam_sessions')
        .update(resumePayload)
        .eq('id', selectedSession.id),
      externalSupabase
        .from('exam_sessions')
        .update(resumePayload)
        .eq('id', selectedSession.id),
    ]);

    if (internalSessionRes.error || externalSessionRes.error) {
      console.error('Failed to reset session:', internalSessionRes.error, externalSessionRes.error);
      toast.error('Failed to reset session');
    } else {
      await Promise.all([
        // Re-enable exam login for the student (both DBs)
        supabase
          .from('registrations')
          .update({ exam_login_enabled: true })
          .eq('id', selectedSession.registration_id),
        externalSupabase
          .from('registrations')
          .update({ exam_login_enabled: true })
          .eq('id', selectedSession.registration_id),
      ]);

      // Also delete old result if exists (for resumed exams)
      await Promise.all([
        supabase.from('results').delete().eq('session_id', selectedSession.id),
        externalSupabase.from('results').delete().eq('session_id', selectedSession.id),
      ]);

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
              This will unblock the session and allow the student to continue their exam.
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
