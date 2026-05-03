import { useState, useEffect, useRef } from 'react';
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
import { Room, RemoteParticipant, RemoteTrackPublication } from 'livekit-client';
import { invokeExternalFunction } from '@/lib/externalSupabase';
import { cn } from '@/lib/utils';

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
  const livekitRoomRef = useRef<Room | null>(null);

  const fetchData = async () => {
    if (!examId) return;

    setIsLoading(true);
    console.log('[LiveMonitoring] Starting robust data fetch for exam:', examId);

    try {
      // 1. Fetch exam details first
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('id, exam_name, exam_code, max_violations, proctoring_enabled, duration_minutes')
        .eq('id', examId)
        .maybeSingle();

      if (examData) {
        setExam(examData);
      } else {
        // Try external
        const { data: extExamData } = await externalSupabase
          .from('exams')
          .select('id, exam_name, exam_code, max_violations, proctoring_enabled, duration_minutes')
          .eq('id', examId)
          .maybeSingle();
        if (extExamData) setExam(extExamData);
      }

      // 2. Load registrations and profiles from both databases
      const fetchRegsAndProfiles = async (client: any, dbName: string) => {
        try {
          const { data: regs, error: regErr } = await client
            .from('registrations')
            .select('id, registration_number, student_id, exam_id')
            .eq('exam_id', examId);

          if (regErr) {
            console.error(`[LiveMonitoring] Error fetching registrations from ${dbName}:`, regErr);
            return { regs: [], profiles: [] };
          }

          if (!regs || regs.length === 0) {
            console.log(`[LiveMonitoring] No registrations found in ${dbName}`);
            return { regs: [], profiles: [] };
          }

          const studentIds = Array.from(new Set(regs.map((r: any) => r.student_id)));
          const { data: profiles, error: profErr } = await client
            .from('profiles')
            .select('id, full_name, photo_url, email')
            .in('id', studentIds);

          if (profErr) {
            console.error(`[LiveMonitoring] Error fetching profiles from ${dbName}:`, profErr);
            return { regs, profiles: [] };
          }

          return { regs, profiles };
        } catch (err) {
          console.error(`[LiveMonitoring] Unexpected error fetching from ${dbName}:`, err);
          return { regs: [], profiles: [] };
        }
      };

      const [internalData, externalData] = await Promise.all([
        fetchRegsAndProfiles(supabase, 'INTERNAL'),
        fetchRegsAndProfiles(externalSupabase, 'EXTERNAL')
      ]);

      // Merge registrations and profiles
      const regMap = new Map<string, any>();
      const profileMap = new Map<string, any>();

      [...internalData.regs, ...externalData.regs].forEach(r => {
        if (!regMap.has(r.id)) regMap.set(r.id, r);
      });

      [...internalData.profiles, ...externalData.profiles].forEach(p => {
        if (!profileMap.has(p.id)) profileMap.set(p.id, p);
      });

      const allRegIds = Array.from(regMap.keys());
      console.log(`[LiveMonitoring] Found ${allRegIds.length} total registrations for this exam across both databases.`);

      if (allRegIds.length === 0) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch sessions for these registrations from both databases
      const fetchSessions = async (client: any, dbName: string) => {
        try {
          const { data, error } = await client
            .from('exam_sessions')
            .select('id, registration_id, start_time, is_completed, is_auto_submitted, violation_count, latest_snapshot_url, snapshot_updated_at, latest_screen_url, camera_status, camera_heartbeat_at')
            .in('registration_id', allRegIds);

          if (error) {
            console.error(`[LiveMonitoring] Error fetching sessions from ${dbName}:`, error);
            return [];
          }

          // Filter for active/recent sessions
          return (data || []).filter((s: any) => !s.is_completed || s.is_auto_submitted === true);
        } catch (err) {
          console.error(`[LiveMonitoring] Unexpected error fetching sessions from ${dbName}:`, err);
          return [];
        }
      };

      const [internalSessions, externalSessions] = await Promise.all([
        fetchSessions(supabase, 'INTERNAL'),
        fetchSessions(externalSupabase, 'EXTERNAL')
      ]);

      console.log(`[LiveMonitoring] Sessions found: Internal=${internalSessions.length}, External=${externalSessions.length}`);

      // 3. Merge and map sessions to final format
      const mergedSessionsMap = new Map<string, any>();
      
      const processSession = (s: any) => {
        const reg = regMap.get(s.registration_id);
        const profile = reg ? profileMap.get(reg.student_id) : null;
        
        const session: ActiveSession = {
          id: s.id,
          registration_id: s.registration_id,
          registration: {
            registration_number: reg?.registration_number || 'N/A',
            student: {
              id: reg?.student_id || '',
              full_name: profile?.full_name || 'Unknown Student',
              email: profile?.email || 'N/A',
            }
          },
          start_time: s.start_time,
          is_completed: s.is_completed,
          is_auto_submitted: s.is_auto_submitted,
          violation_count: s.violation_count || 0,
          latest_snapshot_url: s.latest_snapshot_url,
          snapshot_updated_at: s.snapshot_updated_at,
          latest_screen_url: s.latest_screen_url,
          camera_status: s.camera_status || 'offline',
          camera_heartbeat_at: s.camera_heartbeat_at
        };

        // If duplicate (same session ID in both DBs), prefer the one with more information
        const existing = mergedSessionsMap.get(s.id);
        if (!existing || (s.violation_count || 0) >= (existing.violation_count || 0)) {
          mergedSessionsMap.set(s.id, session);
        }
      };

      internalSessions.forEach(processSession);
      externalSessions.forEach(processSession);

      const finalSessions = Array.from(mergedSessionsMap.values())
        .sort((a, b) => {
          const at = a.start_time ? new Date(a.start_time).getTime() : 0;
          const bt = b.start_time ? new Date(b.start_time).getTime() : 0;
          return bt - at; // Latest first
        });

      console.log(`[LiveMonitoring] Final merged active sessions: ${finalSessions.length}`);
      
      // 4. Get signed URLs for snapshots/screens
      const sessionsWithSignedUrls = await Promise.all(finalSessions.map(async (s) => {
        try {
          const snapshotUrl = s.latest_snapshot_url ? await getSignedUrl(externalSupabase as any, s.latest_snapshot_url) : null;
          const screenUrl = s.latest_screen_url ? await getSignedUrl(externalSupabase as any, s.latest_screen_url) : null;
          return { ...s, snapshotUrl, screenUrl };
        } catch (e) {
          return s;
        }
      }));

      setSessions(sessionsWithSignedUrls);
    } catch (error) {
      console.error('[LiveMonitoring] Fatal error in fetchData:', error);
      toast.error('Failed to load live sessions');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [examId]);

  // Connect admin to LiveKit room for this exam and subscribe to student camera tracks
  useEffect(() => {
    if (!examId) return;

    let cancelled = false;

    const joinLiveKit = async () => {
      try {
        if (livekitRoomRef.current) return;

        const { data, error } = await invokeExternalFunction<any>('get-stream-token', {
          exam_id: examId,
          session_id: `admin-${Date.now()}`,
          role: 'admin',
        });
        if (error || !data || cancelled) {
          console.error('[LiveKit] get-stream-token error (admin):', error);
          return;
        }

        const room = new Room();
        await room.connect(data.url, data.token);
        livekitRoomRef.current = room;

        const handleTrack = (pub: RemoteTrackPublication) => {
          const track = pub.track;
          if (!track) return;

          const sessionId = pub.participant.identity;
          const elementId = pub.trackName === 'camera' ? `cam-${sessionId}` : `screen-${sessionId}`;
          const el = document.getElementById(elementId) as HTMLVideoElement | null;
          if (el) {
            track.attach(el);
          }
        };

        const handleParticipant = (p: RemoteParticipant) => {
          p.tracks.forEach((pub) => handleTrack(pub));
          p.on('trackSubscribed', (_track, pub) => handleTrack(pub));
        };

        room.participants.forEach(handleParticipant);
        room.on('participantConnected', handleParticipant);

        console.log('[LiveKit] Admin connected to room for exam', examId);
      } catch (e) {
        console.error('[LiveKit] Admin connect failed:', e);
      }
    };

    joinLiveKit();

    return () => {
      cancelled = true;
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
    };
  }, [examId]);

  // Set up realtime subscription
  useEffect(() => {
    if (!examId) return;

    const channel = supabase
      .channel('exam-sessions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_sessions' },
        (payload) => {
          console.log('Internal Realtime update:', payload);
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('Internal subscription status:', status);
        if (status === 'SUBSCRIBED') setIsConnected(true);
      });

    const externalChannel = externalSupabase
      .channel('exam-sessions-realtime-ext')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_sessions' },
        (payload) => {
          console.log('External Realtime update:', payload);
          fetchData();
        }
      )
      .subscribe((status) => {
        console.log('External subscription status:', status);
        if (status === 'SUBSCRIBED') setIsConnected(true);
      });

    return () => {
      supabase.removeChannel(channel);
      externalSupabase.removeChannel(externalChannel);
    };
  }, [examId]);

  const extractObjectPath = (imageUrl: string | null, bucket: string): string | null => {
    if (!imageUrl) return null;
    const cleaned = String(imageUrl).split('?')[0];

    // Typical Supabase URL:
    // /storage/v1/object/public/<bucket>/<path> OR /storage/v1/object/authenticated/<bucket>/<path>
    const re = new RegExp(`/storage/v1/object/(?:public|authenticated)/${bucket}/(.+)$`);
    const m = cleaned.match(re);
    if (m?.[1]) return m[1];

    // Fallback: last occurrence of `${bucket}/...`
    const idx = cleaned.lastIndexOf(`${bucket}/`);
    if (idx >= 0) return cleaned.slice(idx + bucket.length + 1);

    // If it's already an object path, return as-is.
    return cleaned;
  };

  const getSignedUrl = async (client: typeof supabase, path: string | null) => {
    if (!path) return null;

    const bucket = 'proctoring-snapshots';
    const objectPath = extractObjectPath(path, bucket);
    if (!objectPath) return null;

    // Helper to try a specific Supabase client (internal or external) for this object.
    const tryClient = async (c: typeof supabase | typeof externalSupabase | null) => {
      if (!c) return null;
      try {
        const { data, error } = await (c as any).storage
          .from(bucket)
          .createSignedUrl(objectPath, 60 * 5); // 5 minutes
        if (!error && data?.signedUrl) return data.signedUrl as string;

        if (error) {
          console.warn('Signed URL error for client:', error);
          const { data: publicData } = (c as any).storage.from(bucket).getPublicUrl(objectPath);
          return (publicData && (publicData as any).publicUrl) || null;
        }
      } catch (e) {
        console.warn('Signed URL exception for client:', e);
      }
      return null;
    };

    // First try the provided client, then fall back to the "other" Supabase project.
    const primary = await tryClient(client);
    if (primary) return primary;

    const isPrimaryExternal = (client as any) === (externalSupabase as any);
    const secondary = await tryClient(isPrimaryExternal ? supabase : (externalSupabase as any));
    return secondary;
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/admin/exams/${examId}`)} className="pl-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Exam
          </Button>
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600">Live Connection</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">Disconnected</span>
                </>
              )}
            </div>
            <Button variant="outline" onClick={fetchData} className="flex-1 sm:flex-none">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Active</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">{sessions.length}</p>
                </div>
                <User className="w-6 h-6 sm:w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Alerts</p>
                  <p className="text-xl sm:text-2xl font-bold text-amber-600">
                    {sessions.filter(s => s.violation_count > 0).length}
                  </p>
                </div>
                <AlertTriangle className="w-6 h-6 sm:w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Video</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">
                    {sessions.filter(s => s.latest_snapshot_url).length}
                  </p>
                </div>
                <Video className="w-6 h-6 sm:w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Max Viol.</p>
                  <p className="text-xl sm:text-2xl font-bold">{exam?.max_violations || 3}</p>
                </div>
                <Shield className="w-6 h-6 sm:w-8 h-8 text-primary" />
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
                className={cn(
                  "relative overflow-hidden transition-all duration-300 hover:shadow-lg",
                  session.violation_count >= (exam?.max_violations || 3) 
                    ? "border-2 border-destructive animate-pulse shadow-destructive/20" 
                    : session.violation_count > 0 
                    ? "border-2 border-amber-500 shadow-amber-500/10" 
                    : "border-border hover:border-primary/50"
                )}
              >
                {/* Camera Preview (LiveKit video) */}
                <div className="relative aspect-video bg-muted">
                  <video
                    id={`cam-${session.id}`}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover bg-black"
                  />
                  
                  {/* Violation Overlay */}
                  {session.violation_count > 0 && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-destructive text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-bounce z-10">
                      <AlertTriangle className="w-3 h-3" />
                      {session.violation_count}
                    </div>
                  )}
                  
                  {/* Live indicator - use camera_heartbeat_at when available, otherwise fall back to snapshot info */}
                  {(() => {
                    const now = Date.now();
                    let isOnline = false;

                    if (session.camera_heartbeat_at) {
                      // Heartbeat within the last 20 seconds => online
                      const diff = now - new Date(session.camera_heartbeat_at).getTime();
                      isOnline = diff >= 0 && diff < 20000;
                    } else if (session.snapshot_updated_at) {
                      // When heartbeat is not wired up on this project, treat a fresh snapshot
                      // (captured within the last 60 seconds) as "online" so you can still monitor.
                      const diff = now - new Date(session.snapshot_updated_at).getTime();
                      isOnline = diff >= 0 && diff < 60000;
                    } else if (session.snapshotUrl) {
                      // Last-resort: if we have any snapshot URL at all, consider the camera online.
                      // This covers deployments where timestamps/heartbeat aren't stored but images are.
                      isOnline = true;
                    }
                    
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

                {/* Screen Capture Preview (LiveKit video, optional) */}
                <div className="relative aspect-video bg-muted border-t">
                  <video
                    id={`screen-${session.id}`}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover bg-black"
                  />
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
                      <AlertTriangle className={cn(
                        "w-4 h-4",
                        session.violation_count >= (exam?.max_violations || 3) ? "text-destructive" :
                        session.violation_count > 0 ? "text-amber-500" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "font-bold",
                        session.violation_count >= (exam?.max_violations || 3) ? "text-destructive" :
                        session.violation_count > 0 ? "text-amber-600" : "text-muted-foreground"
                      )}>
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
