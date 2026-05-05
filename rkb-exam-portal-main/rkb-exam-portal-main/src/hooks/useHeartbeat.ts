import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase } from '@/lib/externalSupabase';

interface UseHeartbeatOptions {
  sessionId: string | undefined;
  interval?: number; // in milliseconds
  enabled?: boolean;
}

export const useHeartbeat = ({ 
  sessionId, 
  interval = 5000, 
  enabled = true 
}: UseHeartbeatOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const sendHeartbeat = async () => {
      try {
        await externalSupabase
          .from('exam_sessions')
          .update({ heartbeat_at: new Date().toISOString() })
          .eq('id', sessionId);
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(sendHeartbeat, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sessionId, interval, enabled]);
};
