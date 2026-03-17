import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AudioMonitorProps {
  onViolation: (type: string) => void;
  isEnabled: boolean;
  sessionId?: string;
  sensitivity?: 'low' | 'medium' | 'high';
}

export const AudioMonitor = ({ 
  onViolation, 
  isEnabled, 
  sessionId,
  sensitivity = 'medium' 
}: AudioMonitorProps) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isDetectingVoice, setIsDetectingVoice] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const voiceDetectionCountRef = useRef(0);
  const cooldownRef = useRef(false);

  // Sensitivity thresholds
  const thresholds = {
    low: { level: 60, duration: 40 },
    medium: { level: 45, duration: 25 },
    high: { level: 30, duration: 15 }
  };

  const threshold = thresholds[sensitivity];

  const requestAudioAccess = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      
      // Create audio context and analyser
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setHasPermission(true);
    } catch (error) {
      console.error('Audio access denied:', error);
      setHasPermission(false);
    }
  }, []);

  // Monitor audio levels
  useEffect(() => {
    if (!isEnabled || !hasPermission || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume (focusing on voice frequencies 300-3400 Hz)
      // With fftSize 256 and 44100 sample rate, each bin is ~172 Hz
      // Voice range roughly bins 2-20
      let sum = 0;
      for (let i = 2; i < 20; i++) {
        sum += dataArray[i];
      }
      const avgLevel = sum / 18;
      setAudioLevel(avgLevel);

      // Check if voice is detected
      if (avgLevel > threshold.level) {
        voiceDetectionCountRef.current++;
        
        if (voiceDetectionCountRef.current > threshold.duration && !cooldownRef.current) {
          setIsDetectingVoice(true);
          cooldownRef.current = true;
          
          // Trigger violation
          setShowWarningDialog(true);
          onViolation('Voice/Sound Detected');
          
          // Reset after cooldown
          setTimeout(() => {
            voiceDetectionCountRef.current = 0;
            setIsDetectingVoice(false);
            cooldownRef.current = false;
          }, 5000);
        }
      } else {
        voiceDetectionCountRef.current = Math.max(0, voiceDetectionCountRef.current - 1);
        if (voiceDetectionCountRef.current === 0) {
          setIsDetectingVoice(false);
        }
      }

      animationIdRef.current = requestAnimationFrame(checkAudio);
    };

    animationIdRef.current = requestAnimationFrame(checkAudio);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isEnabled, hasPermission, threshold, onViolation]);

  // Initialize audio on mount
  useEffect(() => {
    if (isEnabled) {
      requestAudioAccess();
    }

    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isEnabled, requestAudioAccess]);

  if (!isEnabled) {
    return null;
  }

  if (hasPermission === false) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            <MicOff className="w-4 h-4 text-amber-600" />
            <span className="text-amber-800 dark:text-amber-200">Audio access denied</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Audio Monitor Indicator */}
      <div className={`fixed bottom-4 left-4 z-50 rounded-lg shadow-lg transition-all ${
        isDetectingVoice ? 'ring-4 ring-red-500 animate-pulse' : 'ring-2 ring-border'
      }`}>
        <div className="bg-card p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isDetectingVoice ? 'bg-red-500' : 'bg-green-500'}`}>
              {isDetectingVoice ? (
                <AlertTriangle className="w-4 h-4 text-white" />
              ) : (
                <Mic className="w-4 h-4 text-white" />
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium">
                {hasPermission === null ? 'Initializing...' : isDetectingVoice ? 'Voice Detected!' : 'Monitoring'}
              </div>
              {/* Audio level bar */}
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-100 ${
                    audioLevel > threshold.level ? 'bg-red-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (audioLevel / 100) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Dialog - White with red border */}
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent className="border-2 border-red-500 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              Silence Required!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-lg font-medium text-black">
              Silence required during exam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowWarningDialog(false)}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
