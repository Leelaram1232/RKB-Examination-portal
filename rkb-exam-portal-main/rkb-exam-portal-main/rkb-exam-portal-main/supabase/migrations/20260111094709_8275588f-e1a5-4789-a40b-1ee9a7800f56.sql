-- Fix RLS policies for student_answers table
-- Drop existing policy that might be causing issues
DROP POLICY IF EXISTS "Students can manage their own answers" ON student_answers;

-- Create specific SELECT policy
CREATE POLICY "Students can view their own answers" ON student_answers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM exam_sessions es
    JOIN registrations r ON r.id = es.registration_id
    WHERE es.id = student_answers.session_id 
    AND r.student_id = auth.uid()
  )
);

-- Create INSERT policy with proper WITH CHECK (references new row's session_id, not student_answers.session_id)
CREATE POLICY "Students can insert their own answers" ON student_answers
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM exam_sessions es
    JOIN registrations r ON r.id = es.registration_id
    WHERE es.id = session_id 
    AND r.student_id = auth.uid()
    AND es.is_completed = false
  )
);

-- Create UPDATE policy
CREATE POLICY "Students can update their own answers" ON student_answers
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM exam_sessions es
    JOIN registrations r ON r.id = es.registration_id
    WHERE es.id = student_answers.session_id 
    AND r.student_id = auth.uid()
    AND es.is_completed = false
  )
);

-- Add evaluation settings columns to exams table
ALTER TABLE exams
ADD COLUMN IF NOT EXISTS marks_per_question integer DEFAULT 4,
ADD COLUMN IF NOT EXISTS marks_per_wrong numeric DEFAULT 1;