-- Extend student_answers to support text answers (numerical/fill-in-the-blank)
ALTER TABLE public.student_answers 
ADD COLUMN IF NOT EXISTS text_answer TEXT;

