-- Add results publishing columns to exams
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMP WITH TIME ZONE;

-- Add proctoring settings to exams
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS proctoring_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS max_violations INTEGER DEFAULT 3;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS auto_submit_on_violations BOOLEAN DEFAULT true;

-- Add violation tracking to exam_sessions
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS proctoring_violations JSONB DEFAULT '[]'::jsonb;