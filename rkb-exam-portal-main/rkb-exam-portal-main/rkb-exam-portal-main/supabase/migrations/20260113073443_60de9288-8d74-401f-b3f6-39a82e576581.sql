-- Add image_url column to questions table for diagram/image storage (if not exists)
-- The column already exists per the types file, just ensure it's there

-- Create a table for question images (multiple images per question)
CREATE TABLE IF NOT EXISTS public.question_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_type TEXT DEFAULT 'diagram', -- 'diagram', 'figure', 'option_image'
  option_key TEXT, -- 'A', 'B', 'C', 'D' if image belongs to an option
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.question_images ENABLE ROW LEVEL SECURITY;

-- Create policies for question_images
CREATE POLICY "Anyone can view question images"
ON public.question_images
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage question images"
ON public.question_images
FOR ALL
USING (public.is_admin());

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_question_images_question_id ON public.question_images(question_id);

-- Add image extraction metadata to exam_question_uploads
ALTER TABLE public.exam_question_uploads 
ADD COLUMN IF NOT EXISTS extracted_images JSONB DEFAULT '[]'::jsonb;