-- Phase 1: Create subjects table
CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Policies for subjects
CREATE POLICY "Admins can manage subjects"
    ON public.subjects FOR ALL
    USING (is_admin());

CREATE POLICY "Everyone can view active subjects"
    ON public.subjects FOR SELECT
    USING (is_active = true);

-- Phase 2: Create exam_subjects junction table
CREATE TABLE public.exam_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(exam_id, subject_id)
);

-- Enable RLS
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;

-- Policies for exam_subjects
CREATE POLICY "Admins can manage exam_subjects"
    ON public.exam_subjects FOR ALL
    USING (is_admin());

CREATE POLICY "Students can view exam_subjects for their exams"
    ON public.exam_subjects FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM registrations r
            WHERE r.exam_id = exam_subjects.exam_id
            AND r.student_id = auth.uid()
            AND r.approval_status = 'approved'
        )
    );

-- Phase 3: Create exam_question_uploads table for OCR tracking
CREATE TABLE public.exam_question_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf' or 'image'
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    extracted_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.exam_question_uploads ENABLE ROW LEVEL SECURITY;

-- Policies for exam_question_uploads
CREATE POLICY "Admins can manage question_uploads"
    ON public.exam_question_uploads FOR ALL
    USING (is_admin());

-- Phase 4: Add subject_id to questions table
ALTER TABLE public.questions ADD COLUMN subject_id UUID REFERENCES public.subjects(id);

-- Phase 5: Add image_url to questions for question images
ALTER TABLE public.questions ADD COLUMN image_url TEXT;

-- Create storage bucket for question uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('question-uploads', 'question-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for question uploads bucket
CREATE POLICY "Admins can upload question files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'question-uploads' AND is_admin());

CREATE POLICY "Admins can view question files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'question-uploads' AND is_admin());

CREATE POLICY "Admins can delete question files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'question-uploads' AND is_admin());