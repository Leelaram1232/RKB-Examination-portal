-- Add RLS policy to allow admins to manage student answers
-- This ensures they can review and correct answers in the dashboard
-- Even if the Edge Function is somehow acting with the user role, this will allow it.

DO $$
BEGIN
    -- Drop the restrictive select-only policy if it exists
    DROP POLICY IF EXISTS "Admins can view all answers" ON public.student_answers;
    
    -- Create a new comprehensive policy for admins
    CREATE POLICY "Admins can manage all answers"
    ON public.student_answers
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
END $$;
