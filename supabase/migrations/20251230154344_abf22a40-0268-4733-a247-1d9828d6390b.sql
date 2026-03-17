-- Create a function to assign admin role to specific emails
CREATE OR REPLACE FUNCTION public.assign_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Make bjram04@gmail.com an admin
    IF NEW.email = 'bjram04@gmail.com' THEN
        UPDATE public.user_roles 
        SET role = 'admin' 
        WHERE user_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger that runs AFTER the handle_new_user trigger
CREATE TRIGGER assign_admin_on_signup_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.assign_admin_on_signup();