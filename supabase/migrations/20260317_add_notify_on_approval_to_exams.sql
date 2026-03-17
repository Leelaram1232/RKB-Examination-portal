-- Add notify_on_approval column to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS notify_on_approval BOOLEAN DEFAULT TRUE;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN exams.notify_on_approval IS 'Whether to send an automatic email notification to the student when their registration is approved.';
