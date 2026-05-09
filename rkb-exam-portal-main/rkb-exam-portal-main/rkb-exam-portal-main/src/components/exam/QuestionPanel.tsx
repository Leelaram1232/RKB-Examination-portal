import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MathRenderer, containsLatex } from './MathRenderer';
import { QuestionImage } from './QuestionImage';

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  section_name: string;
  marks: number;
   // Optional type from DB: MCQ, NUMERICAL, MATCH_COLUMN
  question_type?: 'MCQ' | 'NUMERICAL' | 'MATCH_COLUMN' | null;
  image_url?: string | null;
  option_a_image?: string | null;
  option_b_image?: string | null;
  option_c_image?: string | null;
  option_d_image?: string | null;
}

interface QuestionPanelProps {
  question: Question;
  selectedOption: string | null;
  textAnswer?: string | null;
  isMarkedForReview: boolean;
  onSelectOption: (option: string) => void;
  onChangeTextAnswer?: (value: string) => void;
}

export function QuestionPanel({
  question,
  selectedOption,
  textAnswer,
  isMarkedForReview,
  onSelectOption,
  onChangeTextAnswer,
}: QuestionPanelProps) {
  const options = [
    { key: 'A', value: question.option_a, imageUrl: question.option_a_image },
    { key: 'B', value: question.option_b, imageUrl: question.option_b_image },
    { key: 'C', value: question.option_c, imageUrl: question.option_c_image },
    { key: 'D', value: question.option_d, imageUrl: question.option_d_image },
  ];

  // Determine question type (default MCQ)
  const questionType = question.question_type || 'MCQ';

  // Check if question text contains LaTeX
  const questionHasLatex = containsLatex(question.question_text);

  return (
    <div className="space-y-6">
      {/* Question Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
            {question.question_number}
          </span>
          <div>
            <span className="text-sm text-muted-foreground">{question.section_name}</span>
            <span className="ml-2 text-sm font-medium text-primary">({question.marks} marks)</span>
          </div>
        </div>
        {isMarkedForReview && (
          <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
            Marked for Review
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="text-lg leading-relaxed p-4 bg-secondary/50 rounded-lg border">
        {questionHasLatex ? (
          <MathRenderer content={question.question_text} />
        ) : (
          question.question_text
        )}
      </div>

      {/* Question Image/Diagram */}
      {question.image_url && (
        <QuestionImage 
          imageUrl={question.image_url} 
          altText={`Diagram for question ${question.question_number}`}
          className="my-4"
        />
      )}

      {/* MCQ options or text answer box based on type */}
      {questionType === 'NUMERICAL' ? (
        <div className="space-y-2">
          <Label htmlFor={`answer-${question.id}`} className="text-sm font-medium">
            Enter your answer
          </Label>
          <input
            id={`answer-${question.id}`}
            type="text"
            className="w-full px-3 py-2 border rounded-md bg-background"
            value={textAnswer || ''}
            onChange={(e) => onChangeTextAnswer?.(e.target.value)}
            placeholder="Type your answer here"
          />
        </div>
      ) : (
        <RadioGroup
          value={selectedOption || ''}
          onValueChange={onSelectOption}
          className="space-y-3"
        >
          {options.map((option) => {
            const optionHasLatex = containsLatex(option.value);
            
            return (
              <div
                key={option.key}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                  selectedOption === option.key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                )}
                onClick={() => onSelectOption(option.key)}
              >
                <RadioGroupItem
                  value={option.key}
                  id={`option-${option.key}`}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={`option-${option.key}`}
                  className="flex-1 cursor-pointer text-base leading-relaxed"
                >
                  <span className="font-semibold mr-2">({option.key})</span>
                  {optionHasLatex ? (
                    <MathRenderer content={option.value} />
                  ) : (
                    option.value
                  )}
                  {/* Option Image */}
                  {option.imageUrl && (
                    <div className="mt-2">
                      <QuestionImage 
                        imageUrl={option.imageUrl} 
                        altText={`Option ${option.key} diagram`}
                        className="max-h-32"
                        compact
                      />
                    </div>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      )}
    </div>
  );
}
