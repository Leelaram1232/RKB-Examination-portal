import { User, FileText, AlertTriangle, Cloud, Check, Loader2, WifiOff } from 'lucide-react';
import { ExamTimer } from './ExamTimer';
import { Badge } from '@/components/ui/badge';

interface ExamHeaderProps {
  examName: string;
  studentName: string;
  registrationNumber: string;
  endTime: Date;
  onTimeUp: () => void;
  violationCount?: number;
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'error';
  unsyncedCount?: number;
}

export function ExamHeader({
  examName,
  studentName,
  registrationNumber,
  endTime,
  onTimeUp,
  violationCount = 0,
  syncStatus = 'synced',
  unsyncedCount = 0,
}: ExamHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground shadow-lg">
      <div className="container max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Exam Name */}
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-bold">{examName}</h1>
              <p className="text-xs opacity-80">RKB Examination Portal</p>
            </div>
          </div>

          {/* Center: Timer, Violations, and Sync Status */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-4">
              <ExamTimer endTime={endTime} onTimeUp={onTimeUp} />
              {violationCount > 0 && (
                <Badge variant="destructive" className="gap-1 animate-pulse">
                  <AlertTriangle className="h-3 w-3" />
                  Warnings: {violationCount}/3
                </Badge>
              )}
            </div>
            
            {/* Sync Status Indicator */}
            <div className="flex items-center gap-2">
              {syncStatus === 'synced' && (
                <span className="flex items-center gap-1 text-[10px] bg-green-500/20 px-2 py-0.5 rounded-full text-green-300 border border-green-500/30">
                  <Check className="h-3 w-3" />
                  All answers saved
                </span>
              )}
              {syncStatus === 'syncing' && (
                <span className="flex items-center gap-1 text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full text-blue-300 border border-blue-500/30 animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing {unsyncedCount} answer(s)...
                </span>
              )}
              {syncStatus === 'offline' && (
                <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-300 border border-amber-500/30">
                  <WifiOff className="h-3 w-3" />
                  Offline - Saving locally
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="flex items-center gap-1 text-[10px] bg-red-500/20 px-2 py-0.5 rounded-full text-red-300 border border-red-500/30">
                  <AlertTriangle className="h-3 w-3" />
                  Sync Error - Retrying...
                </span>
              )}
            </div>
          </div>

          {/* Right: Student Info */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{studentName}</p>
              <p className="text-xs opacity-80">{registrationNumber}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <User className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
