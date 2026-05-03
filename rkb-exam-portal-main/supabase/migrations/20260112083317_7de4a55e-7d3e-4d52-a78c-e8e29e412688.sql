-- Add OCR confidence and review columns to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';

-- Add review tracking columns to exam_question_uploads table
ALTER TABLE public.exam_question_uploads 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS total_questions INTEGER,
ADD COLUMN IF NOT EXISTS flagged_questions INTEGER;