-- Remove the foreign key constraint on registrations.student_id to allow registrations
-- for students who are not yet authenticated users

ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_student_id_fkey;

-- Now student_id will reference profiles.id instead (no constraint, just logical reference)