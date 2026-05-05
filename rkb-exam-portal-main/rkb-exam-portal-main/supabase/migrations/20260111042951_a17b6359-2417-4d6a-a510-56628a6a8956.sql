-- Create storage bucket for proctoring snapshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('proctoring-snapshots', 'proctoring-snapshots', false, 1048576, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Allow admins to view all snapshots
CREATE POLICY "Admins can view all snapshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'proctoring-snapshots' AND public.is_admin());

-- Allow students to upload their own snapshots (folder structure: session_id/timestamp.jpg)
CREATE POLICY "Students can upload their own snapshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'proctoring-snapshots' AND
  auth.uid() IS NOT NULL
);

-- Add snapshot URL column to exam_sessions for latest snapshot
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS latest_snapshot_url TEXT;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMP WITH TIME ZONE;

-- Enable realtime for exam_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;