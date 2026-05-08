-- 1. Identify and delete duplicates in student_answers (keep only the most recent one for each session/question)
DELETE FROM public.student_answers a
USING public.student_answers b
WHERE a.id < b.id
  AND a.session_id = b.session_id
  AND a.question_id = b.question_id;

-- 2. Ensure the unique constraint exists to prevent future duplicates and allow upserts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_answers_session_id_question_id_key'
    ) THEN
        ALTER TABLE public.student_answers 
        ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);
    END IF;
END
$$;
