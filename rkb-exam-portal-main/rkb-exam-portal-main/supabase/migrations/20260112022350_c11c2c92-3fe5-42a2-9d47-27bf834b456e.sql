-- Add new columns to exams table for registration configuration
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS registration_type TEXT DEFAULT 'free' CHECK (registration_type IN ('free', 'paid'));
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS registration_amount NUMERIC DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS photo_required BOOLEAN DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS signature_required BOOLEAN DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT true;

-- Add new columns to registrations table for payment and email tracking
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required' CHECK (payment_status IN ('not_required', 'pending', 'success', 'failed'));
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS payment_time TIMESTAMPTZ;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS payment_amount NUMERIC;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS email_sent_payment BOOLEAN DEFAULT false;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS email_sent_approval BOOLEAN DEFAULT false;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS cashfree_order_id TEXT;

-- Create storage bucket for student uploads (photos and signatures)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-uploads', 'student-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for student-uploads bucket
CREATE POLICY "Anyone can upload student files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'student-uploads');

CREATE POLICY "Anyone can view student files"
ON storage.objects FOR SELECT
USING (bucket_id = 'student-uploads');

CREATE POLICY "Anyone can update their uploaded files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'student-uploads');