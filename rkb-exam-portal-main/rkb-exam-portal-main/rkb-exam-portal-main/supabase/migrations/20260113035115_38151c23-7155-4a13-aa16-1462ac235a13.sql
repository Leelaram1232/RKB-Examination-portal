-- Add new columns for exam_status tracking
ALTER TABLE exam_sessions 
ADD COLUMN IF NOT EXISTS exam_status TEXT DEFAULT 'in_progress';

ALTER TABLE exam_sessions 
ADD COLUMN IF NOT EXISTS camera_status TEXT DEFAULT 'inactive';

ALTER TABLE exam_sessions 
ADD COLUMN IF NOT EXISTS camera_heartbeat_at TIMESTAMP WITH TIME ZONE;

-- Update existing sessions based on current state
UPDATE exam_sessions 
SET exam_status = CASE 
  WHEN is_completed = true AND is_auto_submitted = true THEN 'auto_submitted'
  WHEN is_completed = true THEN 'finally_submitted'
  WHEN is_blocked = true THEN 'blocked'
  ELSE 'in_progress'
END
WHERE exam_status IS NULL OR exam_status = 'in_progress';