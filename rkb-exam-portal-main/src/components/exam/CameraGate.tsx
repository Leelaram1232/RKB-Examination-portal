import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CameraGateProps {
  onCameraReady: (stream: MediaStream) => void;
  onCameraDenied: () => void;
  isRequired?: boolean;
}

export const CameraGate = ({ onCameraReady, onCameraDenied, isRequired = true }: CameraGateProps) => {
  const [attempts, setAttempts] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxAttempts = 5;

  const requestCamera = useCallback(async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 640 }, 
          height: { ideal: 480 } 
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      onCameraReady(mediaStream);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setAttempts(prev => prev + 1);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera access was denied. Please allow camera access to continue.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is in use by another application. Please close other apps using the camera.');
      } else {
        setError('Failed to access camera. Please check your camera permissions.');
      }

      if (attempts + 1 >= maxAttempts) {
        onCameraDenied();
      }
    } finally {
      setIsRequesting(false);
    }
  }, [attempts, onCameraReady, onCameraDenied]);

  // Auto-request camera on mount
  useEffect(() => {
    if (isRequired && !stream) {
      requestCamera();
    }
  }, [isRequired]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  if (!isRequired) {
    return null;
  }

  // If camera is ready, don't show gate
  if (stream) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-6">
          {/* Camera Icon */}
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Camera className="w-10 h-10 text-primary" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold mb-2">Camera Access Required</h2>
            <p className="text-muted-foreground">
              This exam requires camera monitoring. You cannot proceed without allowing camera access.
            </p>
          </div>

          {/* Camera Preview (hidden until granted) */}
          <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!stream && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="w-12 h-12 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Attempt Counter */}
          {attempts > 0 && attempts < maxAttempts && (
            <p className="text-sm text-muted-foreground">
              Attempt {attempts} of {maxAttempts}
            </p>
          )}

          {/* Max Attempts Warning */}
          {attempts >= maxAttempts && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Maximum attempts reached. Please enable camera access in your browser settings and refresh the page.
              </AlertDescription>
            </Alert>
          )}

          {/* Action Button */}
          <Button 
            onClick={requestCamera} 
            disabled={isRequesting || attempts >= maxAttempts}
            className="w-full"
            size="lg"
          >
            {isRequesting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Requesting Access...
              </>
            ) : attempts > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                Allow Camera Access
              </>
            )}
          </Button>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>How to enable camera:</strong></p>
            <p>1. Click the camera icon in your browser's address bar</p>
            <p>2. Select "Allow" for camera access</p>
            <p>3. Refresh the page if needed</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
