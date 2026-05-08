-- Add new columns to exams table for voice and screen monitoring
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS voice_monitoring_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS screen_recording_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS liberty_level text DEFAULT 'moderate' CHECK (liberty_level IN ('strict', 'moderate', 'relaxed'));

-- Add new columns to exam_sessions table for blocking, heartbeat, and screen capture
ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS resume_allowed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS heartbeat_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS latest_screen_url text;

-- Create index for quick heartbeat queries
CREATE INDEX IF NOT EXISTS idx_exam_sessions_heartbeat ON public.exam_sessions(heartbeat_at);

-- Create index for blocked sessions
CREATE INDEX IF NOT EXISTS idx_exam_sessions_blocked ON public.exam_sessions(is_blocked) WHERE is_blocked = true;