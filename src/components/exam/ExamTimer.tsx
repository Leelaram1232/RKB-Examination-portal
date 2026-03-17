import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExamTimerProps {
  endTime: Date;
  onTimeUp: () => void;
}

export function ExamTimer({ endTime, onTimeUp }: ExamTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isWarning, setIsWarning] = useState(false);
  const [isCritical, setIsCritical] = useState(false);

  const calculateTimeLeft = useCallback(() => {
    const now = new Date().getTime();
    const end = endTime.getTime();
    const diff = Math.max(0, Math.floor((end - now) / 1000));
    return diff;
  }, [endTime]);

  useEffect(() => {
    const updateTimer = () => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      // Warning at 10 minutes
      if (remaining <= 600 && remaining > 300) {
        setIsWarning(true);
        setIsCritical(false);
      }
      // Critical at 5 minutes
      else if (remaining <= 300 && remaining > 0) {
        setIsWarning(false);
        setIsCritical(true);
      }
      // Time's up
      else if (remaining <= 0) {
        onTimeUp();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [calculateTimeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold transition-all',
        isCritical && 'bg-destructive text-destructive-foreground animate-pulse',
        isWarning && !isCritical && 'bg-warning text-warning-foreground',
        !isWarning && !isCritical && 'bg-secondary text-secondary-foreground'
      )}
    >
      {isCritical ? (
        <AlertTriangle className="h-5 w-5" />
      ) : (
        <Clock className="h-5 w-5" />
      )}
      <span>{formatTime(timeLeft)}</span>
    </div>
  );
}
