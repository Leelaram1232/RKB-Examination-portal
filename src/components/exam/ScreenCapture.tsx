import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ScreenCaptureProps {
  isEnabled: boolean;
  sessionId?: string;
  captureInterval?: number; // in milliseconds
}

export const ScreenCapture = ({ 
  isEnabled, 
  sessionId,
  captureInterval = 30000 // Default: 30 seconds
}: ScreenCaptureProps) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const captureScreen = useCallback(async () => {
    if (!sessionId) return;

    try {
      // Create canvas if not exists
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to viewport
      const width = Math.min(window.innerWidth, 1280);
      const height = Math.min(window.innerHeight, 720);
      const scale = Math.min(width / window.innerWidth, height / window.innerHeight);
      
      canvas.width = width;
      canvas.height = height;

      // Use html2canvas alternative: capture visible elements
      // This is a simplified approach - we'll capture key exam info
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Capture current screen state by taking a screenshot of the body
      // Note: Full screen capture requires user permission via getDisplayMedia
      // This simplified version captures metadata instead
      
      const examInterface = document.querySelector('.min-h-screen');
      if (examInterface) {
        // Create a simple representation
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Screen Capture - ${new Date().toLocaleTimeString()}`, 20, 30);
        ctx.fillText(`Session: ${sessionId.substring(0, 8)}...`, 20, 50);
        ctx.fillText(`Viewport: ${window.innerWidth}x${window.innerHeight}`, 20, 70);
        
        // Capture any visible question info
        const questionText = document.querySelector('[class*="question"]');
        if (questionText?.textContent) {
          const lines = questionText.textContent.slice(0, 200).match(/.{1,60}/g) || [];
          lines.forEach((line, i) => {
            ctx.fillText(line, 20, 100 + i * 20);
          });
        }
      }

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.6);
      });

      if (!blob) return;

      const timestamp = Date.now();
      const filePath = `screen/${sessionId}/${timestamp}.jpg`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('proctoring-snapshots')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Screen capture upload error:', uploadError);
        return;
      }

      // Update session with latest screen URL
      await supabase
        .from('exam_sessions')
        .update({
          latest_screen_url: filePath
        })
        .eq('id', sessionId);

      console.log('Screen captured:', filePath);
    } catch (error) {
      console.error('Error capturing screen:', error);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!isEnabled || !sessionId) return;

    // Initial capture after 5 seconds
    const initialTimeout = setTimeout(captureScreen, 5000);

    // Then capture at regular intervals
    intervalRef.current = setInterval(captureScreen, captureInterval);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isEnabled, sessionId, captureInterval, captureScreen]);

  // This component doesn't render anything visible
  return null;
};
