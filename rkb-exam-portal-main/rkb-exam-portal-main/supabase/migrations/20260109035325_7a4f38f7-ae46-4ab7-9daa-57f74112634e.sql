-- Drop the incorrect foreign key to auth.users
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_student_id_fkey;

-- Add correct foreign key to profiles table
ALTER TABLE public.results 
ADD CONSTRAINT results_student_id_profiles_fkey 
FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;