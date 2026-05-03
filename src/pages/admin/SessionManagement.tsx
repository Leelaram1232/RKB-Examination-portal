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
  Shield,
  MessageSquare,
  CheckSquare
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { externalSupabase, invokeExternalFunction } from '@/lib/externalSupabase';

interface ExamSession {
  id: string;
  registration_id: string;
  start_time: string | null;
  end_time: string | null;
  is_completed: boolean;
  is_auto_submitted: boolean;
  violation_count: number;
  proctoring_violations: Json;
  exam_status: string | null;
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

const PREDEFINED_MESSAGES = [
  { title: "Head Rotation Detected", content: "“Eyes on Your Own Paper, Please 👀”\nWe noticed frequent head movement. Please keep your face directed toward the screen.\nLooking around won’t help your score… but staying focused will 🙂" },
  { title: "Talking Detected", content: "“Silent Mode Activated 🤫”\nIt seems like you’re speaking. Kindly maintain complete silence during the exam.\nThis isn’t a podcast recording session — let’s keep it exam-focused!" },
  { title: "Multiple Faces Detected", content: "“You +1? Not Allowed 🚫”\nMore than one person is visible on camera. Only the registered student must be present.\nPlease ensure you're alone, or the session may be flagged." },
  { title: "Unauthorized Device Usage", content: "“Extra Gadgets Detected 📱⚠️”\nAnother device appears to be in use. Please remove any phones, tablets, or secondary screens.\nThis is a single-player game — no external help allowed." },
  { title: "Looking Away Frequently", content: "“Stay With Us 👁️”\nYou’ve been looking away from the screen repeatedly.\nKindly keep your attention on the exam window — distractions can wait!" },
  { title: "Looking Left for Long Time", content: "“Left Side Seems Interesting 🤔”\nYou’ve been looking left for an extended period.\nPlease keep your focus centered — answers won’t magically appear on the side wall." },
  { title: "Looking Right for Long Time", content: "“Right Side Exploration Detected 👉”\nExtended right-side viewing detected.\nLet’s bring your attention back to the screen — that’s where the real action is." },
  { title: "Looking Down for Long Time", content: "“Desk Checking? 📄”\nYou’ve been looking down for quite a while.\nEnsure no notes or materials are being used. Keep your eyes on the screen." },
  { title: "Face Not Clearly Visible", content: "“Camera Needs You 😊”\nYour face is not clearly visible. Please adjust your position or lighting.\nWe can’t mark what we can’t see!" },
  { title: "Suspicious Behavior Warning", content: "“Careful Now ⚠️”\nYour recent activity may violate exam rules.\nPlease follow guidelines strictly to avoid disqualification." },
  { title: "Final Warning", content: "“Last Reminder 🚨”\nThis is your final warning. Continued violations may lead to exam termination.\nStay focused, stay fair." },
  { title: "Positive Reinforcement", content: "“Good Focus 👍”\nGreat job maintaining proper exam behavior. Keep going — you’re doing well!" }
];

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
  
  // Message feature states
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [messageTarget, setMessageTarget] = useState<'selected' | 'individual' | 'all'>('individual');
  const [individualTargetId, setIndividualTargetId] = useState<string | null>(null);

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
          'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, exam_status, submitted_at'
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
        'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, exam_status, submitted_at'
      )
      .in('registration_id', regIds)
      .order('start_time', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      // Fallback: try other DB for sessions at least.
      const { data: extSessionsData, error: extSessionsError } = await (usingExternalRegistrations ? supabase : (externalSupabase as any))
        .from('exam_sessions')
        .select(
          'id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, exam_status, submitted_at'
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
      // Merge logic: prefer external data if it has more info/violations
      const internalSessionsData = sessionsData || [];
      const externalSessionsData = await externalSupabase
            .from('exam_sessions')
            .select('id, registration_id, start_time, end_time, is_completed, is_auto_submitted, violation_count, proctoring_violations, exam_status, submitted_at')
            .in('registration_id', regIds)
            .order('start_time', { ascending: false })
            .then((r) => r.data || []);

      const sessionMap = new Map<string, any>();
      internalSessionsData.forEach(s => sessionMap.set(s.id, s));
      externalSessionsData.forEach(s => {
        const existing = sessionMap.get(s.id);
        if (!existing || (s.violation_count || 0) >= (existing.violation_count || 0)) {
          sessionMap.set(s.id, s);
        }
      });

      const sessionsToUse = Array.from(sessionMap.values());

      const transformedSessions = sessionsToUse.map((s: any) => {
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

    // Subscribe to real-time updates for violations
    const channel = supabase
      .channel('session-mgmt-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions' }, () => fetchData())
      .subscribe();

    const externalChannel = externalSupabase
      .channel('session-mgmt-realtime-ext')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      externalSupabase.removeChannel(externalChannel);
    };
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

    try {
      // Call the edge function to properly grade and end the exam, instead of just updating the table
      const { data, error } = await invokeExternalFunction<any>('submit-exam', {
        session_id: selectedSession.id,
        is_auto_submit: false, 
        is_terminated_by_admin: true,
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Submission failed');
      }

      // Signal the student's browser to submit and close immediately
      try {
        const channel = supabase.channel(`exam_messages_${examId}`);
        await channel.send({
          type: 'broadcast',
          event: 'force_end',
          payload: {
            sessionId: selectedSession.id
          }
        });
      } catch (broadcastErr) {
        console.warn('Failed to send force_end broadcast:', broadcastErr);
      }

      toast.success('Exam has been ended for this student and results calculated');
      fetchData();
    } catch (error: any) {
      console.error('Error ending exam via submit-exam:', error);
      
      // Fallback: If edge function fails, at least close the session
      const { error: fallbackError } = await supabase
        .from('exam_sessions')
        .update({
          is_completed: true,
          end_time: new Date().toISOString(),
        })
        .eq('id', selectedSession.id);

      if (fallbackError) {
        toast.error('Failed to end exam');
      } else {
        toast.warning('Exam ended, but result calculation may have been delayed.');
        fetchData();
      }
    }

    setIsProcessing(false);
    setShowEndExamDialog(false);
    setSelectedSession(null);
  };

  const handleSelectSession = (sessionId: string, checked: boolean) => {
    if (checked) {
      setSelectedSessions(prev => [...prev, sessionId]);
    } else {
      setSelectedSessions(prev => prev.filter(id => id !== sessionId));
    }
  };

  const handleSelectAllActive = (checked: boolean) => {
    if (checked) {
      setSelectedSessions(activeSessions.map(s => s.id));
    } else {
      setSelectedSessions([]);
    }
  };

  const handleSendMessage = async () => {
    let targetIds: string[] = [];
    if (messageTarget === 'individual' && individualTargetId) {
      targetIds = [individualTargetId];
    } else if (messageTarget === 'selected') {
      targetIds = selectedSessions;
    } else if (messageTarget === 'all') {
      targetIds = activeSessions.map(s => s.id);
    }

    if (targetIds.length === 0) {
      toast.error('No students selected to send message');
      return;
    }

    let finalMessage = customMessage;
    if (typeof selectedMessageIndex === 'number') {
      finalMessage = PREDEFINED_MESSAGES[selectedMessageIndex].content;
    }

    if (!finalMessage.trim()) {
      toast.error('Message content cannot be empty');
      return;
    }

    setIsProcessing(true);
    
    try {
      // Use Supabase realtime broadcast to send messages instantly
      const channel = supabase.channel(`exam_messages_${examId}`);
      await channel.send({
        type: 'broadcast',
        event: 'admin_msg',
        payload: {
          sessionIds: targetIds,
          message: finalMessage
        }
      });
      
      toast.success(`Message sent to ${targetIds.length} student(s)`);
      setShowMessageDialog(false);
      setCustomMessage('');
      setSelectedMessageIndex('');
      if (messageTarget === 'selected') {
        setSelectedSessions([]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (session: ExamSession) => {
    if (session.exam_status === 'terminated_by_admin') {
      return <Badge variant="destructive">Terminated by Admin</Badge>;
    }
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
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto">
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Sessions */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>All Exam Sessions</CardTitle>
              <CardDescription>View and manage all student exam sessions</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={() => {
                  setMessageTarget('selected');
                  setShowMessageDialog(true);
                }}
                disabled={selectedSessions.length === 0}
                className="gap-2 flex-1 sm:flex-none"
              >
                <MessageSquare className="w-4 h-4" />
                Send Msg ({selectedSessions.length})
              </Button>
              <Button variant="outline" onClick={fetchData} className="flex-1 sm:flex-none">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No exam sessions found
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox 
                            checked={selectedSessions.length === activeSessions.length && activeSessions.length > 0}
                            onCheckedChange={handleSelectAllActive}
                            aria-label="Select all active"
                          />
                        </TableHead>
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
                            <Checkbox 
                              checked={selectedSessions.includes(session.id)}
                              onCheckedChange={(checked) => handleSelectSession(session.id, !!checked)}
                              disabled={session.is_completed}
                              aria-label={`Select ${session.registration.student.full_name}`}
                            />
                          </TableCell>
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
                            <SessionActions session={session} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {sessions.map((session) => (
                    <Card key={session.id} className={cn(
                      "overflow-hidden border-l-4",
                      session.is_completed ? "border-l-green-500" : 
                      session.start_time ? "border-l-blue-500" : "border-l-gray-300"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-start gap-3">
                            <Checkbox 
                              checked={selectedSessions.includes(session.id)}
                              onCheckedChange={(checked) => handleSelectSession(session.id, !!checked)}
                              disabled={session.is_completed}
                              className="mt-1"
                            />
                            <div>
                              <p className="font-bold">{session.registration.student.full_name}</p>
                              <p className="text-xs text-muted-foreground">{session.registration.registration_number}</p>
                            </div>
                          </div>
                          {getStatusBadge(session)}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs uppercase font-semibold">Violations</p>
                            <Badge variant={session.violation_count > 0 ? "destructive" : "secondary"} className="mt-1">
                              {session.violation_count || 0} / {exam?.max_violations || 3}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs uppercase font-semibold">Started At</p>
                            <p className="mt-1 text-xs">
                              {session.start_time ? format(new Date(session.start_time), 'MMM d, h:mm a') : 'Not started'}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-3 border-t border-dashed">
                          <SessionActions session={session} isMobile />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
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

      {/* Send Message Dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Message to Student(s)</DialogTitle>
            <DialogDescription>
              {messageTarget === 'individual' && 'Send an instant popup message to the selected student.'}
              {messageTarget === 'selected' && `Send an instant popup message to ${selectedSessions.length} selected student(s).`}
              {messageTarget === 'all' && `Send an instant popup message to all ${activeSessions.length} active student(s).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <Label className="text-base font-semibold">Select a predefined message</Label>
              <RadioGroup 
                value={selectedMessageIndex.toString()} 
                onValueChange={(val) => {
                  setSelectedMessageIndex(val === 'custom' ? 'custom' : parseInt(val));
                  if (val !== 'custom') setCustomMessage('');
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {PREDEFINED_MESSAGES.map((msg, index) => (
                  <div key={index} className="flex items-start space-x-2 p-3 border rounded-lg bg-card hover:bg-accent/50 cursor-pointer" onClick={() => {
                    setSelectedMessageIndex(index);
                    setCustomMessage('');
                  }}>
                    <RadioGroupItem value={index.toString()} id={`msg-${index}`} className="mt-1" />
                    <Label htmlFor={`msg-${index}`} className="flex-1 cursor-pointer">
                      <p className="font-semibold">{msg.title}</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{msg.content}</p>
                    </Label>
                  </div>
                ))}
                
                <div className="flex items-start space-x-2 p-3 border rounded-lg bg-card hover:bg-accent/50 cursor-pointer" onClick={() => setSelectedMessageIndex('custom')}>
                  <RadioGroupItem value="custom" id="msg-custom" className="mt-1" />
                  <Label htmlFor="msg-custom" className="flex-1 cursor-pointer">
                    <p className="font-semibold">Custom Message</p>
                    <p className="text-xs text-muted-foreground mt-1">Write your own message</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {selectedMessageIndex === 'custom' && (
              <div className="space-y-2">
                <Label>Custom Message Content</Label>
                <Textarea 
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Enter your message here..."
                  className="min-h-[100px]"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowMessageDialog(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={handleSendMessage} disabled={isProcessing}>
                {isProcessing ? 'Sending...' : 'Send Message'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default SessionManagement;
