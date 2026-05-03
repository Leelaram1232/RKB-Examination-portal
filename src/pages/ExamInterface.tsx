import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flag, RotateCcw, Send, AlertTriangle, Maximize, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase, invokeExternalFunction } from '@/lib/externalSupabase';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';
import { ExamHeader } from '@/components/exam/ExamHeader';
import { QuestionPanel } from '@/components/exam/QuestionPanel';
import { NavigationGrid, QuestionStatus } from '@/components/exam/NavigationGrid';
import { Card, CardContent } from '@/components/ui/card';
import { CameraMonitor } from '@/components/exam/CameraMonitor';
import { AudioMonitor } from '@/components/exam/AudioMonitor';
import { ScreenCapture } from '@/components/exam/ScreenCapture';
import { ExamBlockedOverlay } from '@/components/exam/ExamBlockedOverlay';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { Room, createLocalVideoTrack } from 'livekit-client';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  section_name: string;
  subject_name: string | null;
  subject_id: string | null;
  marks: number;
  question_type?: 'MCQ' | 'NUMERICAL' | 'MATCH_COLUMN' | null;
  // Image fields
  image_url?: string | null;
  option_a_image?: string | null;
  option_b_image?: string | null;
  option_c_image?: string | null;
  option_d_image?: string | null;
}

interface ExamSession {
  session_id: string;
  registration_id: string;
  registration_number: string;
  student_name: string;
  start_time: string;
  is_resume: boolean;
  remaining_minutes?: number; // For resumed sessions
  questions: Question[];
  existing_answers: { question_id: string; selected_option: string | null; is_marked_for_review: boolean }[];
  exam: {
    id: string;
    exam_name: string;
    duration_minutes: number;
    instructions: string | null;
    total_marks: number;
    negative_marking: boolean;
    negative_mark_value: number | null;
    proctoring_enabled: boolean | null;
    max_violations: number | null;
    auto_submit_on_violations: boolean | null;
    voice_monitoring_enabled: boolean | null;
    screen_recording_enabled: boolean | null;
    liberty_level: string | null;
  };
}

interface Answer {
  question_id: string;
  selected_option: string | null;
  text_answer?: string | null;
  is_marked_for_review: boolean;
}

interface ViolationRecord {
  type: string;
  timestamp: string;
  details?: string;
}

export default function ExamInterface() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [tempNumericalAnswer, setTempNumericalAnswer] = useState<string>('');
  
  // Fullscreen and violation tracking
  const [violationCount, setViolationCount] = useState(0);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [lastViolationType, setLastViolationType] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCameraWarning, setShowCameraWarning] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
  // Admin message states
  const [adminMessage, setAdminMessage] = useState('');
  const [showAdminMessageDialog, setShowAdminMessageDialog] = useState(false);

  const hasInitialized = useRef(false);
  const violationRef = useRef(0);
  const violationsRef = useRef<ViolationRecord[]>([]);
  const livekitRoomRef = useRef<Room | null>(null);
  
  // Get proctoring settings from exam
  const proctoringEnabled = session?.exam?.proctoring_enabled ?? false;
  const voiceMonitoringEnabled = session?.exam?.voice_monitoring_enabled ?? false;
  const screenRecordingEnabled = session?.exam?.screen_recording_enabled ?? false;
  const maxViolations = session?.exam?.max_violations ?? 3;
  const autoSubmitOnViolations = session?.exam?.auto_submit_on_violations ?? true;

  // Use heartbeat hook to keep session alive
  useHeartbeat({
    sessionId: session?.session_id,
    interval: 5000,
    enabled: !isBlocked && !isSubmitting
  });

  // Get unique sections (preferring subject_name over section_name)
  const sections = [...new Set(questions.map((q) => q.subject_name || q.section_name))];

  // Filter questions by section (using subject_name or section_name)
  const sectionQuestions = questions.filter(
    (q) => !activeSection || (q.subject_name || q.section_name) === activeSection
  );

  const currentQuestion = sectionQuestions[currentQuestionIndex];

  // Save violation to database
  const saveViolationToDatabase = useCallback(async (type: string, count: number, allViolations: ViolationRecord[]) => {
    if (!session) return;

    try {
      await supabase
        .from('exam_sessions')
        .update({
          violation_count: count,
          proctoring_violations: allViolations as any
        })
        .eq('id', session.session_id);
    } catch (error) {
      console.error('Failed to save violation:', error);
    }
  }, [session]);

  // Block exam session
  const blockExamSession = useCallback(async () => {
    if (!session) return;

    try {
      await supabase
        .from('exam_sessions')
        .update({
          is_blocked: true,
          blocked_at: new Date().toISOString()
        })
        .eq('id', session.session_id);
      
      setIsBlocked(true);
    } catch (error) {
      console.error('Failed to block session:', error);
    }
  }, [session]);

  // Load session and questions
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const loadExamData = async () => {
      const sessionData = sessionStorage.getItem('examSession');
      if (!sessionData) {
        toast({
          title: 'Session Not Found',
          description: 'Please login to access the exam',
          variant: 'destructive',
        });
        navigate(`/exam/${examId}/login`);
        return;
      }

      const parsedSession: ExamSession = JSON.parse(sessionData);
      setSession(parsedSession);

      // Calculate end time - handle resumed sessions properly
      const startTime = new Date(parsedSession.start_time);
      const originalEndTime = new Date(startTime.getTime() + parsedSession.exam.duration_minutes * 60 * 1000);
      const now = new Date();
      
      let end = originalEndTime;
      
      // For resumed sessions, check if original end time has passed
      if (parsedSession.is_resume) {
        if (parsedSession.remaining_minutes !== undefined && parsedSession.remaining_minutes > 0) {
          // Use remaining_minutes from server if provided
          end = new Date(now.getTime() + parsedSession.remaining_minutes * 60 * 1000);
          console.log('[EXAM] Resumed session with remaining_minutes:', parsedSession.remaining_minutes);
        } else if (originalEndTime <= now) {
          // Original time expired but admin allowed resume - grant full duration from now
          end = new Date(now.getTime() + parsedSession.exam.duration_minutes * 60 * 1000);
          console.log('[EXAM] Resumed session with expired time - granting full duration from now');
        }
      }
      
      console.log('[EXAM] End time set to:', end.toISOString());
      setEndTime(end);

      // Use questions from session (fetched during login via edge function)
      const questionsData = parsedSession.questions || [];
      
      if (questionsData.length === 0) {
        toast({
          title: 'No Questions',
          description: 'No questions are available for this exam. Please contact admin.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      setQuestions(questionsData);
      setActiveSection(questionsData[0]?.subject_name || questionsData[0]?.section_name || '');

      // Load existing answers from session (for resume)
      if (parsedSession.existing_answers && parsedSession.existing_answers.length > 0) {
        const answersMap = new Map<string, Answer>();
        parsedSession.existing_answers.forEach((ans) => {
          answersMap.set(ans.question_id, {
            question_id: ans.question_id,
            selected_option: ans.selected_option,
            is_marked_for_review: ans.is_marked_for_review || false,
          });
        });
        setAnswers(answersMap);
      }

      // Check if session is blocked
      const { data: sessionStatus } = await supabase
        .from('exam_sessions')
        .select('is_blocked, violation_count, proctoring_violations')
        .eq('id', parsedSession.session_id)
        .single();

      if (sessionStatus?.is_blocked) {
        setIsBlocked(true);
        setViolationCount(sessionStatus.violation_count || 0);
      } else if (sessionStatus) {
        setViolationCount(sessionStatus.violation_count || 0);
        violationRef.current = sessionStatus.violation_count || 0;
        if (sessionStatus.proctoring_violations && Array.isArray(sessionStatus.proctoring_violations)) {
          setViolations(sessionStatus.proctoring_violations as unknown as ViolationRecord[]);
          violationsRef.current = sessionStatus.proctoring_violations as unknown as ViolationRecord[];
        }
      }

      setIsLoading(false);
    };

    loadExamData();

    return () => {
      // Clean up LiveKit connection if still active when component unmounts.
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
    };
  }, [examId, navigate, toast]);

  // Real-time questions update subscription
  useEffect(() => {
    if (!session?.exam?.id) return;

    const channel = supabase
      .channel(`public:questions:exam_id=eq.${session.exam.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'questions',
          filter: `exam_id=eq.${session.exam.id}`,
        },
        (payload) => {
          console.log('[Real-time] Question updated from admin:', payload.new);
          setQuestions((prevQuestions) => {
            const updatedIndex = prevQuestions.findIndex((q) => q.id === payload.new.id);
            if (updatedIndex === -1) return prevQuestions;
            
            const newQuestions = [...prevQuestions];
            // Merge payload.new while preserving joined fields like subject_name
            newQuestions[updatedIndex] = { ...prevQuestions[updatedIndex], ...payload.new as any };
            return newQuestions;
          });
          
          toast({
            title: 'Question Updated',
            description: 'A question was just updated by the administrator.',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.exam?.id, toast]);

  // Real-time admin messages subscription
  useEffect(() => {
    if (!session?.exam?.id || !session?.session_id) return;

    const channel = supabase
      .channel(`exam_messages_${session.exam.id}`)
      .on(
        'broadcast',
        { event: 'admin_msg' },
        (payload) => {
          console.log('[Real-time] Admin message received:', payload);
          if (payload.payload?.sessionIds?.includes(session.session_id)) {
            setAdminMessage(payload.payload.message);
            setShowAdminMessageDialog(true);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'force_end' },
        (payload) => {
          console.log('[Real-time] Force end received:', payload);
          if (payload.payload?.sessionId === session.session_id) {
            toast({
              title: 'Exam Terminated',
              description: 'Your exam session has been ended by the administrator.',
              variant: 'destructive',
            });
            handleSubmit(false, true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.exam?.id, session?.session_id]);

  // Start LiveKit camera streaming once we have a valid session + exam id
  useEffect(() => {
    if (!session?.session_id || !session.exam?.id) return;

    let cancelled = false;

    const startStreaming = async () => {
      try {
        // Avoid creating multiple rooms if effect re-runs
        if (livekitRoomRef.current) return;

        const { data, error } = await invokeExternalFunction<any>('get-stream-token', {
          exam_id: session.exam.id,
          session_id: session.session_id,
          role: 'student',
        });
        if (error || !data || cancelled) {
          console.error('get-stream-token error:', error);
          return;
        }

        const room = new Room();
        await room.connect(data.url, data.token);
        livekitRoomRef.current = room;
        
        const camTrack = await createLocalVideoTrack();
        await room.localParticipant.publishTrack(camTrack, { name: 'camera' });

        console.log('[LiveKit] Student camera track published for session', session.session_id);
      } catch (e) {
        console.error('[LiveKit] Failed to start streaming:', e);
      }
    };

    startStreaming();

    return () => {
      cancelled = true;
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
    };
  }, [session?.session_id, session?.exam?.id, invokeExternalFunction]);

  // Sync numerical answer when question changes
  useEffect(() => {
    if (currentQuestion && currentQuestion.question_type === 'NUMERICAL') {
      const existingAnswer = answers.get(currentQuestion.id);
      setTempNumericalAnswer(existingAnswer?.text_answer || '');
    }
  }, [currentQuestion, answers]);

  // Save answer to database via edge function with retry logic
  const saveAnswer = useCallback(
    async (questionId: string, selectedOption: string | null, textAnswer: string | null, isMarkedForReview: boolean, retryCount = 0) => {
      if (!session) {
        console.error('Cannot save answer: No session');
        return;
      }

      const maxRetries = 3;
      console.log(`[SAVE_ANSWER] Saving answer for question ${questionId}, attempt ${retryCount + 1}`);
      console.log(`[SAVE_ANSWER] Session ID: ${session.session_id}`);
      console.log(`[SAVE_ANSWER] Selected option: ${selectedOption}, Marked for review: ${isMarkedForReview}`);

      // Optimistically update local state first for better UX
      setAnswers((prev) => {
        const newMap = new Map(prev);
        newMap.set(questionId, {
          question_id: questionId,
          selected_option: selectedOption,
          text_answer: textAnswer,
          is_marked_for_review: !!isMarkedForReview,
        });
        return newMap;
      });

      try {
        const payload = {
          session_id: session.session_id,
          question_id: questionId,
          selected_option: selectedOption,
          text_answer: textAnswer,
          is_marked_for_review: !!isMarkedForReview,
        };
        console.log('[SAVE_ANSWER] Sending payload:', payload);
        
        const { data: result, error: invocationError } = await invokeExternalFunction<any>('save-answer', payload);

        if (invocationError) {
          console.error('[SAVE_ANSWER] Function invocation error:', invocationError);
          throw new Error(invocationError.message || 'Save failed');
        }
        
        if (!result || !result.success) {
          console.error('[SAVE_ANSWER] Save rejected:', result?.error);
          throw new Error(result?.error || 'Save failed');
        }

        console.log('[SAVE_ANSWER] Answer saved successfully!');
      } catch (err: any) {
        console.error(`[SAVE_ANSWER] Error on attempt ${retryCount + 1}:`, err);
        
        // Retry logic
        if (retryCount < maxRetries) {
          console.log(`[SAVE_ANSWER] Retrying in ${(retryCount + 1) * 1000}ms...`);
          setTimeout(() => {
            saveAnswer(questionId, selectedOption, textAnswer, isMarkedForReview, retryCount + 1);
          }, (retryCount + 1) * 1000);
        } else {
          console.error('[SAVE_ANSWER] Max retries reached. Attempting direct DB fallback...');
          
          // --- EMERGENCY FALLBACK ---
          const { error: fallbackError } = await externalSupabase
            .from('student_answers')
            .upsert({
              session_id: session.session_id,
              question_id: questionId,
              selected_option: selectedOption,
              text_answer: textAnswer,
              is_marked_for_review: !!isMarkedForReview,
              answered_at: new Date().toISOString()
            }, {
              onConflict: 'session_id,question_id'
            });

          if (fallbackError) {
            console.error('[SAVE_ANSWER] Direct fallback also failed:', fallbackError);
            toast({
              title: 'Final Save Error',
              description: 'We could not save your answer. Please notify the invigilator.',
              variant: 'destructive',
            });
          } else {
            console.log('[SAVE_ANSWER] Direct fallback successful (Direct DB Save)');
          }
        }
      }
    },
    [session, toast]
  );

  const saveCurrentNumericalAnswer = useCallback(() => {
    if (currentQuestion?.question_type === 'NUMERICAL') {
      const existingAnswer = answers.get(currentQuestion.id);
      // Only save if it has changed
      if (tempNumericalAnswer !== (existingAnswer?.text_answer || '')) {
        saveAnswer(
          currentQuestion.id,
          null,
          tempNumericalAnswer,
          existingAnswer?.is_marked_for_review || false
        );
      }
    }
  }, [currentQuestion, tempNumericalAnswer, answers, saveAnswer]);

  // Handle option selection
  const handleSelectOption = useCallback(
    (option: string) => {
      if (!currentQuestion) return;
      const existingAnswer = answers.get(currentQuestion.id);
      saveAnswer(currentQuestion.id, option, null, existingAnswer?.is_marked_for_review || false);
    },
    [currentQuestion, answers, saveAnswer]
  );

  // Clear response
  const handleClearResponse = useCallback(() => {
    if (!currentQuestion) return;
    const existingAnswer = answers.get(currentQuestion.id);
    saveAnswer(currentQuestion.id, null, null, existingAnswer?.is_marked_for_review || false);
  }, [currentQuestion, answers, saveAnswer]);

  // Mark for review
  const handleMarkForReview = useCallback(() => {
    if (!currentQuestion) return;
    const existingAnswer = answers.get(currentQuestion.id);
    
    // If it's numerical, use the temp value
    const textToSave = currentQuestion.question_type === 'NUMERICAL' 
      ? tempNumericalAnswer 
      : (existingAnswer?.text_answer || null);

    saveAnswer(
      currentQuestion.id,
      existingAnswer?.selected_option || null,
      textToSave,
      !existingAnswer?.is_marked_for_review // This will be flipped to boolean by !! in saveAnswer
    );
  }, [currentQuestion, answers, saveAnswer, tempNumericalAnswer]);

  // Navigate to question using 1-based display index
  const handleNavigate = useCallback(
    (displayNumber: number) => {
      saveCurrentNumericalAnswer();
      // displayNumber is 1-based, convert to 0-based index
      const index = displayNumber - 1;
      if (index >= 0 && index < sectionQuestions.length) {
        setCurrentQuestionIndex(index);
      }
    },
    [sectionQuestions.length, saveCurrentNumericalAnswer]
  );

  const handleNext = useCallback(() => {
    saveCurrentNumericalAnswer();
    if (currentQuestionIndex < sectionQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  }, [currentQuestionIndex, sectionQuestions.length, saveCurrentNumericalAnswer]);

  const handlePrevious = useCallback(() => {
    saveCurrentNumericalAnswer();
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  }, [currentQuestionIndex, saveCurrentNumericalAnswer]);

  // Submit exam
  const handleSubmit = useCallback(
    async (isAutoSubmit = false, isTerminatedByAdmin = false) => {
      if (!session) return;
      
      if (currentQuestion?.question_type === 'NUMERICAL') {
        saveCurrentNumericalAnswer();
      }

      setIsSubmitting(true);

      try {
        console.log('[SUBMIT] Invoking submit-exam via external backend...');
        const { data: result, error: invocationError } = await invokeExternalFunction<any>('submit-exam', {
          session_id: session.session_id,
          is_auto_submit: isAutoSubmit,
          is_terminated_by_admin: isTerminatedByAdmin,
        });

        if (invocationError) {
          console.error('[SUBMIT] Function invocation error:', invocationError);
          throw invocationError;
        }

        if (!result || !result.success) {
          console.error('[SUBMIT] Submission rejected by server:', result?.error);
          throw new Error(result?.error || 'Submission failed');
        }

        console.log('[SUBMIT] Success! Redirecting...');
      } catch (error: any) {
        console.error('[SUBMIT] Main submission failed:', error);
        
        // --- EMERGENCY FALLBACK ---
        // If the edge function fails (401, 500, etc.), try to at least mark the session as finished
        // so the student can "come out" of the exam.
        try {
          console.log('[SUBMIT] Attempting emergency database fallback...');
          await externalSupabase
            .from('exam_sessions')
            .update({
              is_completed: true,
              exam_status: isTerminatedByAdmin ? 'terminated_by_admin' : 'finally_submitted',
              submitted_at: new Date().toISOString()
            })
            .eq('id', session.session_id);
          
          toast({
            title: 'Exam Finish (Manual Sync)',
            description: 'Your answers were saved, but evaluation might be delayed. You can close this window.',
          });
        } catch (fallbackError) {
          console.error('[SUBMIT] Emergency fallback also failed:', fallbackError);
          toast({
            title: 'Submission Connectivity Issue',
            description: 'We encountered a problem. Please notify the invigilator, but your session has been closed for safety.',
            variant: 'destructive',
          });
        }
      } finally {
        // ALWAYS let the student out of the interface if they clicked submit
        // This prevents them from being held "hostage" by a server error
        sessionStorage.removeItem('examSession');
        navigate(`/exam/${examId}/submitted`);
        setIsSubmitting(false);
      }
    },
    [session, examId, navigate, toast]
  );

  // Handle time up
  const handleTimeUp = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  // Handle violation
  const handleViolation = useCallback((type: string) => {
    if (isBlocked) return;
    
    // Prevent double-counting: if a violation occurred within the last 2 seconds, ignore this one.
    // (e.g. Escaping fullscreen triggers 'fullscreenchange' AND 'blur' almost instantly)
    const now = Date.now();
    const lastViolationTime = violationsRef.current.length > 0 
      ? new Date(violationsRef.current[violationsRef.current.length - 1].timestamp).getTime() 
      : 0;
      
    if (now - lastViolationTime < 2000) {
      return;
    }
    
    violationRef.current += 1;
    const newCount = violationRef.current;
    
    const newViolation: ViolationRecord = {
      type,
      timestamp: new Date().toISOString()
    };
    violationsRef.current = [...violationsRef.current, newViolation];
    
    setViolationCount(newCount);
    setViolations(violationsRef.current);
    setLastViolationType(type);
    setShowViolationWarning(true);

    // Save to database
    saveViolationToDatabase(type, newCount, violationsRef.current);

    // Check if should block or auto-submit
    if (newCount >= maxViolations) {
      if (autoSubmitOnViolations) {
        handleSubmit(true);
      } else {
        // Block the exam instead of auto-submit
        blockExamSession();
      }
    }
  }, [isBlocked, maxViolations, autoSubmitOnViolations, saveViolationToDatabase, blockExamSession, handleSubmit]);
  
  // Handle camera proctoring violation
  const handleCameraViolation = useCallback(() => {
    handleViolation('Head Movement Detected');
    setShowCameraWarning(true);
  }, [handleViolation]);

  // Handle audio violation
  const handleAudioViolation = useCallback((type: string) => {
    handleViolation(type);
  }, [handleViolation]);

  // Enter fullscreen
  const enterFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch (error) {
      console.log('Fullscreen request failed:', error);
    }
  }, []);

  // Prevent accidental navigation/refresh
  useEffect(() => {
    if (!session || isLoading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have an exam in progress. Are you sure you want to leave?';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [session, isLoading]);

  // Fullscreen enforcement effect
  useEffect(() => {
    if (!session || isLoading || isBlocked) return;

    // Request fullscreen on mount
    enterFullscreen();

    // Visibility change handler (tab switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation('Tab Switch Detected');
      }
    };

    // Window blur handler
    const handleBlur = () => {
      // Only trigger if we're in fullscreen to avoid false positives
      if (document.fullscreenElement) {
        handleViolation('Window Focus Lost');
      }
    };

    // Fullscreen exit handler
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        if (session && !isSubmitting && !isBlocked) {
          handleViolation('Fullscreen Exited');
        }
      } else {
        setIsFullscreen(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [session, isLoading, isSubmitting, isBlocked, handleViolation, enterFullscreen]);

  // Get question statuses for navigation grid (using section-relative indices)
  const getQuestionStatuses = useCallback((): Map<number, QuestionStatus> => {
    const statuses = new Map<number, QuestionStatus>();

    sectionQuestions.forEach((q, index) => {
      const answer = answers.get(q.id);
      let status: QuestionStatus = 'not_visited';

      if (answer) {
        const hasResponse =
          !!answer.selected_option ||
          (answer.text_answer !== undefined &&
            answer.text_answer !== null &&
            answer.text_answer.trim() !== '');

        if (hasResponse && answer.is_marked_for_review) {
          status = 'answered_marked';
        } else if (hasResponse) {
          status = 'answered';
        } else if (answer.is_marked_for_review) {
          status = 'marked_for_review';
        } else {
          status = 'not_answered';
        }
      }

      // Use 1-based index for display (not question_number from DB)
      statuses.set(index + 1, status);
    });

    return statuses;
  }, [sectionQuestions, answers]);


  // Calculate summary
  const getSummary = useCallback(() => {
    let answered = 0;
    let notAnswered = 0;
    let markedForReview = 0;

    questions.forEach((q) => {
      const answer = answers.get(q.id);
      const hasResponse =
        !!answer?.selected_option ||
        (answer?.text_answer !== undefined && answer.text_answer !== null && answer.text_answer.trim() !== '');
      if (hasResponse) {
        answered++;
      } else if (answer) {
        notAnswered++;
      }
      if (answer?.is_marked_for_review) {
        markedForReview++;
      }
    });

    return {
      total: questions.length,
      answered,
      notAnswered: questions.length - answered,
      markedForReview,
    };
  }, [questions, answers]);

  // Show blocked overlay if blocked
  if (isBlocked) {
    const last = violations.length > 0 ? violations[violations.length - 1] : null;
    return (
      <ExamBlockedOverlay 
        violationCount={violationCount} 
        maxViolations={maxViolations} 
        reason={last?.type || lastViolationType || 'Maximum violations exceeded'}
        recentViolations={violations.map(v => ({ type: v.type, timestamp: v.timestamp }))}
      />
    );
  }

  // If blocked, poll for admin unblock/resume so the student can continue without refresh.
  useEffect(() => {
    if (!session || !isBlocked) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('exam_sessions')
          .select('is_blocked, exam_status')
          .eq('id', session.session_id)
          .maybeSingle();

        if (data && data.is_blocked === false && data.exam_status === 'resumed') {
          setIsBlocked(false);
          // Re-enter fullscreen and continue
          enterFullscreen();
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [session, isBlocked, enterFullscreen]);

  if (isLoading || !session || !endTime) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const summary = getSummary();

  // Show fullscreen prompt if not in fullscreen
  if (!isFullscreen && !isSubmitting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Maximize className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Fullscreen Required</h2>
            <p className="text-muted-foreground">
              This exam must be taken in fullscreen mode to prevent cheating.
              Exiting fullscreen, switching tabs, or losing focus will count as violations.
            </p>
            <p className="text-sm text-destructive font-medium">
              {autoSubmitOnViolations 
                ? `After ${maxViolations} violations, your exam will be auto-submitted.`
                : `After ${maxViolations} violations, your exam will be blocked.`
              }
            </p>
            <Button onClick={enterFullscreen} className="w-full gap-2">
              <Maximize className="w-4 h-4" />
              Enter Fullscreen & Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <ExamHeader
        examName={session.exam.exam_name}
        studentName={session.student_name}
        registrationNumber={session.registration_number}
        endTime={endTime}
        onTimeUp={handleTimeUp}
        violationCount={violationCount}
      />

      {/* Main Content */}
      <div className="pt-20 pb-24">
        {/* Camera Monitor - only show if proctoring enabled */}
        {proctoringEnabled && (
          <CameraMonitor
            onViolation={handleCameraViolation}
            isEnabled={proctoringEnabled}
            sessionId={session.session_id}
          />
        )}
        
        {/* Audio Monitor - only show if voice monitoring enabled */}
        {voiceMonitoringEnabled && (
          <AudioMonitor
            onViolation={handleAudioViolation}
            isEnabled={voiceMonitoringEnabled}
            sessionId={session.session_id}
          />
        )}

        {/* Screen Capture - only if enabled */}
        {screenRecordingEnabled && (
          <ScreenCapture
            isEnabled={screenRecordingEnabled}
            sessionId={session.session_id}
          />
        )}
        
        <div className="container max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Question Area */}
            <div className="lg:col-span-3 space-y-4">
              {/* Section Tabs */}
              {sections.length > 1 && (
                <Tabs
                  value={activeSection}
                  onValueChange={(value) => {
                    setActiveSection(value);
                    setCurrentQuestionIndex(0);
                  }}
                >
                  <TabsList className="w-full justify-start">
                    {sections.map((section) => (
                      <TabsTrigger key={section} value={section}>
                        {section}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              {/* Question Panel */}
              {currentQuestion && (
                <div className="bg-card rounded-lg border p-6 shadow-sm">
                  <QuestionPanel
                    question={currentQuestion}
                    selectedOption={answers.get(currentQuestion.id)?.selected_option || null}
                    textAnswer={tempNumericalAnswer}
                    isMarkedForReview={
                      answers.get(currentQuestion.id)?.is_marked_for_review || false
                    }
                    onSelectOption={handleSelectOption}
                    onChangeTextAnswer={(value) => setTempNumericalAnswer(value)}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-card rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleMarkForReview}
                    className="gap-2"
                  >
                    <Flag className="h-4 w-4" />
                    {answers.get(currentQuestion?.id || '')?.is_marked_for_review
                      ? 'Unmark'
                      : 'Mark for Review'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClearResponse}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear Response
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentQuestionIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={currentQuestionIndex === sectionQuestions.length - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Navigation Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-lg border p-4 space-y-6 sticky top-24">
                <h3 className="font-semibold text-lg">{activeSection || 'Questions'}</h3>

                <NavigationGrid
                  totalQuestions={sectionQuestions.length}
                  currentQuestion={currentQuestionIndex + 1}
                  questionStatuses={getQuestionStatuses()}
                  onNavigate={handleNavigate}
                />

                {/* Summary */}
                <div className="space-y-2 pt-4 border-t">
                  <h4 className="font-medium text-sm text-muted-foreground">Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total:</span>
                      <span className="font-medium">{summary.total}</span>
                    </div>
                    <div className="flex justify-between text-success">
                      <span>Answered:</span>
                      <span className="font-medium">{summary.answered}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Not Answered:</span>
                      <span className="font-medium">{summary.notAnswered}</span>
                    </div>
                    <div className="flex justify-between text-purple-600">
                      <span>Marked:</span>
                      <span className="font-medium">{summary.markedForReview}</span>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={() => setShowSubmitDialog(true)}
                >
                  <Send className="h-4 w-4" />
                  Submit Exam
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Submit Examination?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>Are you sure you want to submit your exam? This action cannot be undone.</p>
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Questions:</span>
                  <span className="font-medium">{summary.total}</span>
                </div>
                <div className="flex justify-between text-success">
                  <span>Answered:</span>
                  <span className="font-medium">{summary.answered}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Not Answered:</span>
                  <span className="font-medium">{summary.notAnswered}</span>
                </div>
                <div className="flex justify-between text-purple-600">
                  <span>Marked for Review:</span>
                  <span className="font-medium">{summary.markedForReview}</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="bg-primary"
            >
              {isSubmitting ? 'Submitting...' : 'Yes, Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Violation Warning Dialog */}
      <AlertDialog open={showViolationWarning} onOpenChange={setShowViolationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Warning: {lastViolationType}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You have <span className="font-bold text-destructive">{violationCount}</span> violation(s). 
                {autoSubmitOnViolations 
                  ? ` After ${maxViolations} violations, your exam will be automatically submitted.`
                  : ` After ${maxViolations} violations, your exam will be blocked and you cannot continue.`
                }
              </p>
              <div className="bg-destructive/10 p-4 rounded-lg text-sm">
                <p className="font-medium">Please ensure:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Stay in fullscreen mode</li>
                  <li>Do not switch tabs or windows</li>
                  <li>Do not minimize the browser</li>
                  {voiceMonitoringEnabled && <li>Maintain silence during the exam</li>}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => {
                setShowViolationWarning(false);
                enterFullscreen();
              }}
            >
              I Understand - Continue Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Camera Proctoring Warning Dialog */}
      <AlertDialog open={showCameraWarning} onOpenChange={setShowCameraWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              See Forward!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="text-lg font-medium">
                Don't rotate your head. Focus on the exam.
              </p>
              <p className="text-sm text-muted-foreground">
                Our proctoring system has detected that you are looking away from the screen.
                Please keep your face directed towards the camera at all times.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowCameraWarning(false)}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Message Dialog */}
      <AlertDialog open={showAdminMessageDialog} onOpenChange={setShowAdminMessageDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Notice
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-base text-foreground whitespace-pre-wrap">
              {adminMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowAdminMessageDialog(false);
              enterFullscreen();
            }}>
              Continue Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
