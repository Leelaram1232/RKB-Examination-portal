-- Create bucket for extracted question images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Question images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'question-images');

-- Allow authenticated users (admins) to upload
CREATE POLICY "Admins can upload question images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'question-images');

-- Allow admins to update/delete
CREATE POLICY "Admins can manage question images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'question-images');

CREATE POLICY "Admins can delete question images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'question-images');