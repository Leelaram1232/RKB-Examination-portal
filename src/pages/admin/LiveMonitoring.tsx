import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  RefreshCw, 
  AlertTriangle,
  Video,
  VideoOff,
  User,
  Clock,
  Shield,
  Eye,
  Wifi,
  WifiOff,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { externalSupabase } from '@/lib/externalSupabase';

interface ActiveSession {
  id: string;
  registration_id: string;
  start_time: string | null;
  is_completed: boolean;
  is_auto_submitted: boolean | null;
  violation_count: number;
  latest_snapshot_url: string | null;
  snapshot_updated_at: string | null;
  latest_screen_url?: string | null;
  snapshotUrl?: string | null;
  screenUrl?: string | null;
  camera_status: string | null;
  camera_heartbeat_at: string | null;
  registration: {
    registration_number: string;
    student: {
      id: string;
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
  proctoring_enabled: boolean;
  duration_minutes: number;
}

const LiveMonitoring = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const fetchData = async () => {
    if (!examId) return;

    // Fetch exam details
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .select('id, exam_name, exam_code, max_violations, proctoring_enabled, duration_minutes')
      .eq('id', examId)
      .single();

    let resolvedExam = examData;
    if (examError || !examData) {
      // Fallback: some setups may have exams/sessions on external DB.
      const { data: extExamData, error: extExamError } = await externalSupabase
        .from('exams')
        .select('id, exam_name, exam_code, max_violations, proctoring_enabled, duration_minutes')
        .eq('id', examId)
        .single();
      if (!extExamError && extExamData) resolvedExam = extExamData;
    }

    if (!resolvedExam) {
      toast.error('Exam not found');
      navigate('/admin/exams');
      return;
    }

    setExam(resolvedExam);

    const fetchRegsAndProfiles = async (client: typeof supabase) => {
      const { data: regs, error: regErr } = await client
        .from('registrations')
        .select('id, registration_number, student_id')
        .eq('exam_id', examId);

      if (regErr || !regs || regs.length === 0) {
        return { regMap: new Map<string, any>(), profileMap: new Map<string, any>() };
      }

      const regMap = new Map<string, any>(regs.map((r: any) => [r.id, r]));
      const studentIds = [...new Set(regs.map((r: any) => r.student_id).filter(Boolean))];

      if (studentIds.length === 0) {
        return { regMap, profileMap: new Map<string, any>() };
      }

      const { data: profiles, error: profilesErr } = await client
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);

      if (profilesErr || !profiles) {
        return { regMap, profileMap: new Map<string, any>() };
      }

      const profileMap = new Map<string, any>(profiles.map((p: any) => [p.id, p]));
      return { regMap, profileMap };
    };

    // Some deployments have sessions in one DB and registrations/profiles in another.
    // Merge both sources so we can still load active sessions reliably.
    const internalData = await fetchRegsAndProfiles(supabase);
    const externalData = await fetchRegsAndProfiles(externalSupabase as any);

    const regMapMerged = new Map<string, any>(internalData.regMap);
    for (const [id, reg] of externalData.regMap.entries()) {
      if (!regMapMerged.has(id)) regMapMerged.set(id, reg);
    }

    const profileMapMerged = new Map<string, any>(internalData.profileMap);
    for (const [id, profile] of externalData.profileMap.entries()) {
      if (!profileMapMerged.has(id)) profileMapMerged.set(id, profile);
    }

    const allRegIds = Array.from(regMapMerged.keys());
    if (allRegIds.length === 0) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    const fetchActiveSessions = async (client: typeof supabase) => {
      const { data: sessionsData, error: sessionsError } = await client
        .from('exam_sessions')
        .select(
          'id, registration_id, start_time, is_completed, is_auto_submitted, violation_count, latest_snapshot_url, snapshot_updated_at, latest_screen_url, camera_status, camera_heartbeat_at'
        )
        .in('registration_id', allRegIds)
        // Include running exams + auto-submitted sessions (even if completed=true)
        .or('is_completed.eq.false,is_auto_submitted.eq.true')
        .order('start_time', { ascending: false });

      if (sessionsError || !sessionsData) return [];

      return await Promise.all(
        sessionsData.map(async (s: any) => {
          const reg = regMapMerged.get(s.registration_id);
          const profile = reg?.student_id ? profileMapMerged.get(reg.student_id) : null;
          const snapshotUrl = await getSignedUrl(client, s.latest_snapshot_url || null);
          const screenUrl = await getSignedUrl(client, s.latest_screen_url || null);

          return {
            ...s,
            registration: {
              registration_number: reg?.registration_number || 'N/A',
              student: {
                id: reg?.student_id || '',
                full_name: profile?.full_name || 'Unknown',
                email: profile?.email || 'N/A',
              },
            },
            snapshotUrl,
            screenUrl,
          };
        })
      );
    };

    const internalSessions = await fetchActiveSessions(supabase);
    const externalSessions = await fetchActiveSessions(externalSupabase as any);

    // Deduplicate by session id; prefer internal version if both exist.
    const byId = new Map<string, ActiveSession>();
    for (const s of internalSessions) byId.set(s.id, s);
    for (const s of externalSessions) if (!byId.has(s.id)) byId.set(s.id, s);

    const merged = Array.from(byId.values()).sort((a, b) => {
      const at = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bt = b.start_time ? new Date(b.start_time).getTime() : 0;
      return bt - at;
    });

    setSessions(merged);
    setIsLoading(false);
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [examId]);

  // Set up realtime subscription
  useEffect(() => {
    if (!examId) return;

    const channel = supabase
      .channel('exam-sessions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_sessions'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          // Refetch to get complete data with joins
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId]);

  const getSignedUrl = async (client: typeof supabase, path: string | null) => {
    if (!path) return null;
    const { data, error } = await client.storage
      .from('proctoring-snapshots')
      .createSignedUrl(path, 60 * 5); // 5 minutes
    if (error) {
      console.error('Signed URL error:', error);
      return null;
    }
    return data?.signedUrl || null;
  };

  const getViolationColor = (count: number, max: number) => {
    const ratio = count / max;
    if (ratio >= 1) return 'bg-red-500';
    if (ratio >= 0.66) return 'bg-orange-500';
    if (ratio >= 0.33) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const calculateTimeRemaining = (startTime: string, durationMinutes: number) => {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const now = new Date();
    const remaining = end.getTime() - now.getTime();
    
    if (remaining <= 0) return 'Time up';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  if (isLoading) {
    return (
      <AdminLayout title="Live Monitoring" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Live Monitoring" 
      description={`Real-time monitoring for ${exam?.exam_name || 'Exam'}`}
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate(`/admin/exams/${examId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Exam
          </Button>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">Disconnected</span>
                </>
              )}
            </div>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Sessions</p>
                  <p className="text-2xl font-bold text-blue-600">{sessions.length}</p>
                </div>
                <User className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">With Violations</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {sessions.filter(s => s.violation_count > 0).length}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Camera Active</p>
                  <p className="text-2xl font-bold text-green-600">
                    {sessions.filter(s => s.latest_snapshot_url).length}
                  </p>
                </div>
                <Video className="w-8 h-8 text-green-500" />
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
                <Shield className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Grid */}
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No Active Sessions</p>
              <p className="text-muted-foreground">
                There are currently no students taking this exam
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sessions.map((session) => (
              <Card 
                key={session.id} 
                className={`relative overflow-hidden ${
                  session.violation_count >= (exam?.max_violations || 3) 
                    ? 'border-red-500 border-2' 
                    : session.violation_count > 0 
                      ? 'border-amber-500' 
                      : ''
                }`}
              >
                {/* Camera Preview */}
                <div className="relative aspect-video bg-muted">
                  {session.snapshotUrl ? (
                    <>
                      <img
                        src={session.snapshotUrl || ''}
                        alt={`${session.registration.student.full_name}'s camera`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2 opacity-80 hover:opacity-100"
                        onClick={() => setSelectedSnapshot(session.snapshotUrl || null)}
                      >
                        <Maximize2 className="w-3 h-3" />
                      </Button>
                      {session.snapshot_updated_at && (
                        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                          {format(new Date(session.snapshot_updated_at), 'HH:mm:ss')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <VideoOff className="w-8 h-8 mb-2" />
                      <span className="text-xs">No camera feed</span>
                    </div>
                  )}
                  
                  {/* Live indicator - use camera_heartbeat_at for accurate status */}
                  {(() => {
                    // Check if heartbeat is within last 10 seconds
                    const isOnline = session.camera_heartbeat_at && 
                      (new Date().getTime() - new Date(session.camera_heartbeat_at).getTime()) < 10000;
                    
                    return (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 px-2 py-1 rounded">
                        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-white text-xs">
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Screen Capture Preview */}
                <div className="relative aspect-video bg-muted border-t">
                  {session.screenUrl ? (
                    <img
                      src={session.screenUrl || ''}
                      alt={`${session.registration.student.full_name}'s screen`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <VideoOff className="w-8 h-8 mb-2" />
                      <span className="text-xs">No screen capture</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                    SCREEN
                  </div>
                </div>

                <CardContent className="p-4">
                  {/* Student Info */}
                  <div className="mb-3">
                    <h4 className="font-semibold truncate">{session.registration.student.full_name}</h4>
                    <p className="text-xs text-muted-foreground">{session.registration.registration_number}</p>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-sm">
                    {/* Violations */}
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${session.violation_count > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                      <span className={session.violation_count > 0 ? 'font-medium text-amber-600' : ''}>
                        {session.violation_count}/{exam?.max_violations || 3}
                      </span>
                    </div>

                    {/* Time Remaining */}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">
                        {session.start_time && exam
                          ? calculateTimeRemaining(session.start_time, exam.duration_minutes)
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Violation Bar */}
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${getViolationColor(session.violation_count, exam?.max_violations || 3)}`}
                      style={{ 
                        width: `${Math.min(100, (session.violation_count / (exam?.max_violations || 3)) * 100)}%` 
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => navigate(`/admin/exams/${examId}/sessions`)}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Snapshot Fullscreen Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={() => setSelectedSnapshot(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Camera Snapshot</DialogTitle>
          </DialogHeader>
          {selectedSnapshot && (
            <img 
              src={selectedSnapshot} 
              alt="Camera snapshot" 
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default LiveMonitoring;
