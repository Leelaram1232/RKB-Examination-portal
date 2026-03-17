-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

-- Create enum for exam status
CREATE TYPE public.exam_status AS ENUM ('draft', 'registration_open', 'registration_closed', 'conducted', 'results_published');

-- Create enum for approval status
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Create enum for gender
CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other');

-- =====================
-- USER ROLES TABLE
-- =====================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================
-- SECURITY DEFINER FUNCTIONS
-- =====================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'student')
$$;

-- =====================
-- PROFILES TABLE
-- =====================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    gender gender_type,
    mobile TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    class TEXT,
    school_name TEXT,
    board TEXT,
    academic_year TEXT,
    percentage DECIMAL(5,2),
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =====================
-- EXAMS TABLE
-- =====================
CREATE TABLE public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_name TEXT NOT NULL,
    exam_code TEXT UNIQUE NOT NULL,
    description TEXT,
    eligibility_class TEXT,
    eligibility_category TEXT,
    eligibility_year TEXT,
    registration_start TIMESTAMPTZ NOT NULL,
    registration_end TIMESTAMPTZ NOT NULL,
    exam_date DATE NOT NULL,
    exam_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 180,
    total_marks INTEGER NOT NULL DEFAULT 100,
    passing_marks INTEGER DEFAULT 40,
    negative_marking BOOLEAN DEFAULT FALSE,
    negative_mark_value DECIMAL(3,2) DEFAULT 0.25,
    instructions TEXT,
    status exam_status DEFAULT 'draft',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- =====================
-- QUESTIONS TABLE
-- =====================
CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
    section_name TEXT NOT NULL,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    marks INTEGER NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (exam_id, question_number)
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- =====================
-- REGISTRATIONS TABLE
-- =====================
CREATE TABLE public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    registration_number TEXT UNIQUE,
    registration_date TIMESTAMPTZ DEFAULT NOW(),
    approval_status approval_status DEFAULT 'pending',
    approval_remarks TEXT,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    exam_password TEXT,
    exam_login_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (exam_id, student_id)
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- =====================
-- EXAM SESSIONS TABLE
-- =====================
CREATE TABLE public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID REFERENCES public.registrations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT FALSE,
    is_auto_submitted BOOLEAN DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

-- =====================
-- STUDENT ANSWERS TABLE
-- =====================
CREATE TABLE public.student_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
    selected_option CHAR(1) CHECK (selected_option IN ('A', 'B', 'C', 'D')),
    is_marked_for_review BOOLEAN DEFAULT FALSE,
    answered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, question_id)
);

ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- =====================
-- RESULTS TABLE
-- =====================
CREATE TABLE public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    total_marks INTEGER NOT NULL,
    obtained_marks DECIMAL(6,2) NOT NULL,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    unanswered_count INTEGER NOT NULL DEFAULT 0,
    section_wise_scores JSONB,
    rank INTEGER,
    percentile DECIMAL(5,2),
    is_pass BOOLEAN,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (exam_id, student_id)
);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- User Roles Policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin());

-- Profiles Policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin());

-- Exams Policies
CREATE POLICY "Anyone can view active exams"
ON public.exams FOR SELECT
TO authenticated
USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Public can view active exams"
ON public.exams FOR SELECT
TO anon
USING (is_active = TRUE AND status IN ('registration_open', 'registration_closed'));

CREATE POLICY "Admins can manage exams"
ON public.exams FOR ALL
TO authenticated
USING (public.is_admin());

-- Questions Policies
CREATE POLICY "Admins can manage questions"
ON public.questions FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Students can view questions during exam"
ON public.questions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.registrations r
        JOIN public.exam_sessions es ON es.registration_id = r.id
        WHERE r.student_id = auth.uid()
        AND r.exam_id = questions.exam_id
        AND es.is_completed = FALSE
        AND es.start_time IS NOT NULL
    )
);

-- Registrations Policies
CREATE POLICY "Students can view their own registrations"
ON public.registrations FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Students can create registrations"
ON public.registrations FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can manage all registrations"
ON public.registrations FOR ALL
TO authenticated
USING (public.is_admin());

-- Exam Sessions Policies
CREATE POLICY "Students can view their own sessions"
ON public.exam_sessions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.id = exam_sessions.registration_id
        AND r.student_id = auth.uid()
    )
);

CREATE POLICY "Students can create their own sessions"
ON public.exam_sessions FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.id = registration_id
        AND r.student_id = auth.uid()
        AND r.approval_status = 'approved'
        AND r.exam_login_enabled = TRUE
    )
);

CREATE POLICY "Students can update their own sessions"
ON public.exam_sessions FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.id = exam_sessions.registration_id
        AND r.student_id = auth.uid()
    )
);

CREATE POLICY "Admins can manage all sessions"
ON public.exam_sessions FOR ALL
TO authenticated
USING (public.is_admin());

-- Student Answers Policies
CREATE POLICY "Students can manage their own answers"
ON public.student_answers FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.exam_sessions es
        JOIN public.registrations r ON r.id = es.registration_id
        WHERE es.id = student_answers.session_id
        AND r.student_id = auth.uid()
    )
);

CREATE POLICY "Admins can view all answers"
ON public.student_answers FOR SELECT
TO authenticated
USING (public.is_admin());

-- Results Policies
CREATE POLICY "Students can view their own results"
ON public.results FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Admins can manage all results"
ON public.results FOR ALL
TO authenticated
USING (public.is_admin());

-- =====================
-- TRIGGERS & FUNCTIONS
-- =====================

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
        NEW.email
    );
    
    -- Auto-assign student role for new users
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student');
    
    RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate exam password from DOB
CREATE OR REPLACE FUNCTION public.generate_exam_password(dob DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN TO_CHAR(dob, 'DDMMYY');
END;
$$;

-- Function to generate registration number
CREATE OR REPLACE FUNCTION public.generate_registration_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    exam_code TEXT;
    seq_num INTEGER;
BEGIN
    SELECT e.exam_code INTO exam_code
    FROM public.exams e
    WHERE e.id = NEW.exam_id;
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(r.registration_number FROM LENGTH(exam_code) + 2) AS INTEGER)
    ), 0) + 1 INTO seq_num
    FROM public.registrations r
    WHERE r.exam_id = NEW.exam_id
    AND r.registration_number IS NOT NULL;
    
    NEW.registration_number := exam_code || '-' || LPAD(seq_num::TEXT, 4, '0');
    
    RETURN NEW;
END;
$$;

-- Trigger for registration number generation
CREATE TRIGGER generate_registration_number_trigger
    BEFORE INSERT ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.generate_registration_number();

-- Function to set exam password on approval
CREATE OR REPLACE FUNCTION public.set_exam_password_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    student_dob DATE;
BEGIN
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        SELECT p.date_of_birth INTO student_dob
        FROM public.profiles p
        WHERE p.id = NEW.student_id;
        
        IF student_dob IS NOT NULL THEN
            NEW.exam_password := public.generate_exam_password(student_dob);
        END IF;
        
        NEW.approved_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger for exam password on approval
CREATE TRIGGER set_exam_password_trigger
    BEFORE UPDATE ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.set_exam_password_on_approval();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_registrations_updated_at
    BEFORE UPDATE ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================
-- INDEXES
-- =====================
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_exams_status ON public.exams(status);
CREATE INDEX idx_exams_exam_date ON public.exams(exam_date);
CREATE INDEX idx_questions_exam_id ON public.questions(exam_id);
CREATE INDEX idx_registrations_exam_id ON public.registrations(exam_id);
CREATE INDEX idx_registrations_student_id ON public.registrations(student_id);
CREATE INDEX idx_registrations_approval_status ON public.registrations(approval_status);
CREATE INDEX idx_exam_sessions_registration_id ON public.exam_sessions(registration_id);
CREATE INDEX idx_student_answers_session_id ON public.student_answers(session_id);
CREATE INDEX idx_results_exam_id ON public.results(exam_id);
CREATE INDEX idx_results_student_id ON public.results(student_id);