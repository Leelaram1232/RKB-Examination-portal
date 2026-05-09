-- Add foreign key constraint between registrations.student_id and profiles.id
ALTER TABLE public.registrations
ADD CONSTRAINT registrations_student_id_profiles_fkey
FOREIGN KEY (student_id) REFERENCES public.profiles(id);