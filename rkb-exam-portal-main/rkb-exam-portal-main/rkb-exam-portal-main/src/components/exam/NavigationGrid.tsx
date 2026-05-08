import { cn } from '@/lib/utils';

import { Image } from 'lucide-react';

export type QuestionStatus = 
  | 'not_visited' 
  | 'not_answered' 
  | 'answered' 
  | 'marked_for_review' 
  | 'answered_marked';

interface NavigationGridProps {
  totalQuestions: number;
  currentQuestion: number;
  questionStatuses: Map<number, QuestionStatus>;
  questionsWithImages?: Set<number>; // Track which questions have images
  onNavigate: (questionNumber: number) => void;
}

// CBT-style question palette colors
const statusStyles: Record<QuestionStatus, string> = {
  not_visited: 'bg-gray-300 text-gray-700 border-gray-400',           // Grey - Not Visited
  not_answered: 'bg-red-500 text-white border-red-600',               // Red - Not Answered
  answered: 'bg-green-500 text-white border-green-600',               // Green - Answered
  marked_for_review: 'bg-purple-500 text-white border-purple-600',    // Purple - Marked for Review
  answered_marked: 'bg-purple-500 text-white border-green-400 ring-2 ring-green-400', // Purple with Green border
};

export function NavigationGrid({
  totalQuestions,
  currentQuestion,
  questionStatuses,
  questionsWithImages,
  onNavigate,
}: NavigationGridProps) {
  const questions = Array.from({ length: totalQuestions }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5 rounded border', statusStyles.not_visited)} />
          <span>Not Visited</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5 rounded border', statusStyles.not_answered)} />
          <span>Not Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5 rounded border', statusStyles.answered)} />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5 rounded border', statusStyles.marked_for_review)} />
          <span>Marked for Review</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5 rounded border', statusStyles.answered_marked)} />
          <span>Answered & Marked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border bg-gray-200 flex items-center justify-center">
            <Image className="w-3 h-3 text-blue-600" />
          </div>
          <span>Has Image</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-2">
        {questions.map((qNum) => {
          const status = questionStatuses.get(qNum) || 'not_visited';
          const isCurrent = qNum === currentQuestion;
          const hasImage = questionsWithImages?.has(qNum);

          return (
            <button
              key={qNum}
              onClick={() => onNavigate(qNum)}
              className={cn(
                'w-9 h-9 rounded border-2 font-medium text-sm transition-all relative',
                statusStyles[status],
                isCurrent && 'ring-2 ring-primary ring-offset-2',
                'hover:opacity-80'
              )}
            >
              {qNum}
              {hasImage && (
                <Image className="absolute -top-1 -right-1 w-3 h-3 text-blue-600 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
