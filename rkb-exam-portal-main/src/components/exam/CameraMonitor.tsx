import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, AlertTriangle, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';

interface CameraMonitorProps {
  onViolation: (type: string) => void;
  onAutoSubmit?: () => void; // New prop for multi-face auto-submit
  isEnabled: boolean;
  sessionId?: string;
  cameraStream?: MediaStream | null;
}

export const CameraMonitor = ({ onViolation, onAutoSubmit, isEnabled, sessionId, cameraStream }: CameraMonitorProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isWarning, setIsWarning] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [showMultiFaceWarning, setShowMultiFaceWarning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(cameraStream || null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);

  // Request camera access with reconnection logic
  const requestCameraAccess = useCallback(async (retryCount = 0) => {
    const maxRetries = 5;
    
    try {
      setIsReconnecting(retryCount > 0);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setHasPermission(true);
      setIsReconnecting(false);
      reconnectAttemptRef.current = 0;
    } catch (error) {
      console.error('Camera access denied:', error);
      
      if (retryCount < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying camera access in ${delay}ms...`);
        setTimeout(() => requestCameraAccess(retryCount + 1), delay);
      } else {
        setHasPermission(false);
        setIsReconnecting(false);
      }
    }
  }, []);

  // Capture and upload snapshot
  const captureSnapshot = useCallback(async () => {
    if (!videoRef.current || !sessionId || videoRef.current.readyState !== 4) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      });

      if (!blob) return;

      const timestamp = Date.now();
      const filePath = `${sessionId}/${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('proctoring-snapshots')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Snapshot upload error:', uploadError);
        return;
      }

      // Update session with latest snapshot URL
      await supabase
        .from('exam_sessions')
        .update({
          latest_snapshot_url: filePath,
          snapshot_updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      console.log('Snapshot captured and uploaded:', filePath);
    } catch (error) {
      console.error('Error capturing snapshot:', error);
    }
  }, [sessionId]);

  // Send heartbeat to track camera status
  const sendHeartbeat = useCallback(async () => {
    if (!sessionId) return;

    const isActive = stream && stream.active && stream.getVideoTracks().some(t => t.readyState === 'live');
    
    try {
      await supabase
        .from('exam_sessions')
        .update({
          camera_heartbeat_at: new Date().toISOString(),
          camera_status: isActive ? 'active' : 'disconnected'
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, [sessionId, stream]);

  // Capture frame for AI-based face analysis
  const captureFrameForAnalysis = useCallback(async () => {
    if (!videoRef.current || !sessionId || videoRef.current.readyState !== 4) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      const { data, error } = await supabase.functions.invoke('analyze-faces', {
        body: { sessionId, imageBase64 }
      });

      if (error) {
        console.error('Face analysis error:', error);
        return;
      }

      if (data?.multipleFaces) {
        setShowMultiFaceWarning(true);
        onViolation('Multiple Faces Detected');
        
        // Auto-submit after 3 seconds
        setTimeout(() => {
          if (onAutoSubmit) {
            onAutoSubmit();
          }
        }, 3000);
      }
    } catch (error) {
      console.error('Error in face analysis:', error);
    }
  }, [sessionId, onViolation, onAutoSubmit]);

  // Initialize camera on mount (use provided stream if available)
  useEffect(() => {
    if (isEnabled) {
      if (cameraStream) {
        setStream(cameraStream);
        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
        }
        setHasPermission(true);
      } else {
        requestCameraAccess();
      }
    }

    return () => {
      // Cleanup stream on unmount (only if we created it)
      if (stream && !cameraStream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [isEnabled, cameraStream, requestCameraAccess]);

  // Start heartbeat interval
  useEffect(() => {
    if (hasPermission && sessionId) {
      // Send initial heartbeat
      sendHeartbeat();
      
      // Send heartbeat every 5 seconds
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 5000);

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
      };
    }
  }, [hasPermission, sessionId, sendHeartbeat]);

  // Monitor stream health and reconnect if needed
  useEffect(() => {
    if (!stream || !isEnabled) return;

    const checkStreamHealth = () => {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'ended') {
        console.log('Camera stream ended, attempting reconnection...');
        requestCameraAccess(1);
      }
    };

    const interval = setInterval(checkStreamHealth, 3000);
    return () => clearInterval(interval);
  }, [stream, isEnabled, requestCameraAccess]);

  // Start snapshot interval when camera is ready
  useEffect(() => {
    if (hasPermission && sessionId) {
      // Capture initial snapshot after 2 seconds
      const initialTimeout = setTimeout(captureSnapshot, 2000);
      
      // Then capture every 10 seconds
      snapshotIntervalRef.current = setInterval(captureSnapshot, 10000);

      return () => {
        clearTimeout(initialTimeout);
        if (snapshotIntervalRef.current) {
          clearInterval(snapshotIntervalRef.current);
        }
      };
    }
  }, [hasPermission, sessionId, captureSnapshot]);

  // Periodic AI-based face analysis (every 30 seconds)
  useEffect(() => {
    if (hasPermission && sessionId) {
      // Initial check after 5 seconds
      const initialTimeout = setTimeout(captureFrameForAnalysis, 5000);
      
      // Then check every 30 seconds
      faceCheckIntervalRef.current = setInterval(captureFrameForAnalysis, 30000);

      return () => {
        clearTimeout(initialTimeout);
        if (faceCheckIntervalRef.current) {
          clearInterval(faceCheckIntervalRef.current);
        }
      };
    }
  }, [hasPermission, sessionId, captureFrameForAnalysis]);

  // Simple movement detection using canvas
  const lastFrameRef = useRef<ImageData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isEnabled || !hasPermission || !videoRef.current) return;

    // Create canvas for frame comparison
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 64;
      canvasRef.current.height = 48;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let consecutiveHighMovement = 0;

    const checkMovement = () => {
      if (!videoRef.current || videoRef.current.readyState !== 4) {
        animationId = requestAnimationFrame(checkMovement);
        return;
      }

      // Draw current frame to canvas (scaled down)
      ctx.drawImage(videoRef.current, 0, 0, 64, 48);
      const currentFrame = ctx.getImageData(0, 0, 64, 48);

      if (lastFrameRef.current) {
        // Compare frames
        let diffSum = 0;
        const data1 = lastFrameRef.current.data;
        const data2 = currentFrame.data;

        for (let i = 0; i < data1.length; i += 16) { // Sample every 4th pixel
          diffSum += Math.abs(data1[i] - data2[i]);
          diffSum += Math.abs(data1[i + 1] - data2[i + 1]);
          diffSum += Math.abs(data1[i + 2] - data2[i + 2]);
        }

        const avgDiff = diffSum / (data1.length / 16);

        // Increased sensitivity for head rotation detection
        if (avgDiff > 20) {
          consecutiveHighMovement++;
          
          // Trigger warning after sustained movement (faster trigger)
          if (consecutiveHighMovement > 8 && !isWarning) {
            setIsWarning(true);
            setShowWarningDialog(true);
            onViolation('Head Movement Detected');
            
            // Clear warning after 3 seconds
            if (warningTimeoutRef.current) {
              clearTimeout(warningTimeoutRef.current);
            }
            warningTimeoutRef.current = setTimeout(() => {
              setIsWarning(false);
              consecutiveHighMovement = 0;
            }, 3000);
          }
        } else {
          consecutiveHighMovement = Math.max(0, consecutiveHighMovement - 1);
        }
      }

      lastFrameRef.current = currentFrame;
      animationId = requestAnimationFrame(checkMovement);
    };

    // Start checking after a short delay
    const startTimeout = setTimeout(() => {
      animationId = requestAnimationFrame(checkMovement);
    }, 2000);

    return () => {
      clearTimeout(startTimeout);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isEnabled, hasPermission, isWarning, onViolation]);

  if (!isEnabled) {
    return null;
  }

  if (hasPermission === false) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-600" />
            <span className="text-amber-800 dark:text-amber-200">Camera access denied</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Camera Preview */}
      <div className={`fixed bottom-4 right-4 z-50 rounded-lg overflow-hidden shadow-lg transition-all ${
        isWarning ? 'ring-4 ring-red-500 animate-pulse' : 'ring-2 ring-border'
      }`}>
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-40 h-30 object-cover bg-black"
            style={{ transform: 'scaleX(-1)' }}
          />
          {hasPermission === null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
            </div>
          )}
          {isReconnecting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white text-xs">Reconnecting...</div>
            </div>
          )}
          {isWarning && (
            <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-white animate-bounce" />
            </div>
          )}
          <div className="absolute top-1 left-1 bg-black/50 rounded px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${hasPermission ? 'bg-green-500' : 'bg-red-500'}`} />
            LIVE
          </div>
        </div>
      </div>

      {/* Warning Dialog - White with red border */}
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent className="border-2 border-red-500 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              Warning!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-lg font-medium text-black">
              Don't rotate your head. Focus on the exam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowWarningDialog(false)}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-Face Detection Warning - Critical */}
      <AlertDialog open={showMultiFaceWarning}>
        <AlertDialogContent className="border-4 border-red-600 bg-red-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 text-xl">
              <Users className="w-8 h-8" />
              CRITICAL VIOLATION
            </AlertDialogTitle>
            <AlertDialogDescription className="text-lg font-bold text-red-600">
              Multiple faces detected in the camera frame.
              <br />
              <span className="text-base font-normal mt-2 block">
                Your exam will be auto-submitted due to this violation.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
