-- Fix search_path for functions missing it
CREATE OR REPLACE FUNCTION public.generate_exam_password(dob DATE)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RETURN TO_CHAR(dob, 'DDMMYY');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;