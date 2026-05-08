-- Update exams table with new access control fields
ALTER TABLE exams 
ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS external_price DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS internal_price DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS internal_free_access BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_external_registrations BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS payment_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_scholarship_exam BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS registration_limit INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- Update registrations table with new verification and status fields
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS student_type TEXT DEFAULT 'external',
ADD COLUMN IF NOT EXISTS verified_by_api BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10, 2) DEFAULT 0.00;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_registrations_exam_id ON registrations(exam_id);
CREATE INDEX IF NOT EXISTS idx_registrations_student_id ON registrations(student_id);
