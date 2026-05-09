-- Remove the foreign key constraint on profiles.id to allow creating profiles for exam registrants
-- who are not yet authenticated users

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Add a policy to allow service role to insert profiles (for edge function)
CREATE POLICY "Service role can insert profiles"
ON public.profiles
FOR INSERT
TO service_role
WITH CHECK (true);