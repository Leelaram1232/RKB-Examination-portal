import { User, FileText, AlertTriangle } from 'lucide-react';
import { ExamTimer } from './ExamTimer';
import { Badge } from '@/components/ui/badge';

interface ExamHeaderProps {
  examName: string;
  studentName: string;
  registrationNumber: string;
  endTime: Date;
  onTimeUp: () => void;
  violationCount?: number;
}

export function ExamHeader({
  examName,
  studentName,
  registrationNumber,
  endTime,
  onTimeUp,
  violationCount = 0,
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

          {/* Center: Timer and Violations */}
          <div className="flex items-center gap-4">
            <ExamTimer endTime={endTime} onTimeUp={onTimeUp} />
            {violationCount > 0 && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                Warnings: {violationCount}/3
              </Badge>
            )}
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
