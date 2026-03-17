-- Update the questions table to support modern JEE formats
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'MCQ', -- MCQ, NUMERICAL, MATCH_COLUMN
ADD COLUMN IF NOT EXISTS correct_answer TEXT, -- For Numerical or Matching Answers
ADD COLUMN IF NOT EXISTS solution_text TEXT;

-- Make options nullable for Numerical questions
ALTER TABLE public.questions 
ALTER COLUMN option_a DROP NOT NULL,
ALTER COLUMN option_b DROP NOT NULL,
ALTER COLUMN option_c DROP NOT NULL,
ALTER COLUMN option_d DROP NOT NULL,
ALTER COLUMN correct_option DROP NOT NULL;

-- Remove the A/B/C/D check to allow more flexible answers
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_correct_option_check;
