import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Step3PaymentInfo } from '@/components/registration/Step3PaymentInfo';
import { StepIndicator } from '@/components/registration/StepIndicator';
import { Step1Details } from '@/components/registration/Step1Details';
import { Step2PhotoUpload } from '@/components/registration/Step2PhotoUpload';
import { Step4Confirmation } from '@/components/registration/Step4Confirmation';
import { externalSupabase, invokeExternalFunction } from '@/lib/externalSupabase';
import { toast } from 'sonner';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Exam {
  id: string;
  exam_name: string;
  exam_date: string;
  exam_time: string;
  registration_type: string;
  registration_amount: number;
  photo_required: boolean;
  signature_required: boolean;
  approval_required: boolean;
  registration_start: string;
  registration_end: string;
}

interface RegistrationSuccess {
  registration_id: string;
  registration_number: string;
  student_name: string;
  exam_name: string;
  approval_required: boolean;
  payment_required: boolean;
}

const ExamRegistrationWizard = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [registrationSuccess, setRegistrationSuccess] = useState<RegistrationSuccess | null>(null);

  const form = useForm({
    defaultValues: {
      full_name: '',
      email: '',
      mobile: '',
      date_of_birth: '',
      gender: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      class: '',
      board: '',
      school_name: '',
      academic_year: '',
      percentage: '',
      photo_url: '',
      signature_url: '',
    }
  });

  const isPaidExam = exam?.registration_type === 'paid';

  // Calculate total steps based on exam requirements
  const getSteps = () => {
    const steps = [{ id: 1, title: 'Details', description: 'Personal info' }];
    
    if (exam?.photo_required || exam?.signature_required) {
      steps.push({ id: 2, title: 'Documents', description: 'Upload photos' });
    }
    
    if (isPaidExam) {
      steps.push({ id: steps.length + 1, title: 'Payment', description: 'Pay & confirm' });
    } else {
      steps.push({ id: steps.length + 1, title: 'Confirm', description: 'Review & submit' });
    }
    
    return steps;
  };

  // Get the actual step component based on current step and exam config
  const getStepComponent = () => {
    const hasPhotoStep = exam?.photo_required || exam?.signature_required;
    
    if (currentStep === 1) {
      return (
        <Step1Details 
          form={form} 
          onNext={() => setCurrentStep(2)} 
        />
      );
    }

    // Step 2: Photo upload (if required)
    if (hasPhotoStep && currentStep === 2) {
      return (
        <Step2PhotoUpload 
          form={form}
          examId={examId || ''}
          photoRequired={exam?.photo_required || false}
          signatureRequired={exam?.signature_required || false}
          onNext={() => setCurrentStep(3)}
          onBack={() => setCurrentStep(1)}
        />
      );
    }

    // Last step: Payment (for paid exams) or Confirmation (for free exams)
    if (isPaidExam) {
      return (
        <Step3PaymentInfo 
          form={form}
          exam={{
            exam_name: exam?.exam_name || '',
            exam_date: exam?.exam_date || '',
            registration_amount: exam?.registration_amount || 0,
          }}
          onNext={() => {}} 
          onBack={() => setCurrentStep(currentStep - 1)}
          onCreateAndPay={handleCreateAndPay}
          isSubmitting={isSubmitting}
        />
      );
    }

    return (
      <Step4Confirmation 
        form={form}
        exam={{
          exam_name: exam?.exam_name || '',
          exam_date: exam?.exam_date || '',
          exam_time: exam?.exam_time || '',
          registration_type: exam?.registration_type || 'free',
          registration_amount: exam?.registration_amount || 0,
        }}
        onBack={() => setCurrentStep(currentStep - 1)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    );
  };

  useEffect(() => {
    const fetchExam = async () => {
      if (!examId) {
        navigate('/');
        return;
      }

      // Fetch exam from external Supabase
      const { data, error } = await externalSupabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (error || !data) {
        toast.error('Exam not found');
        navigate('/');
        return;
      }

      // Check if registration is open
      const now = new Date();
      const regStart = new Date(data.registration_start);
      const regEnd = new Date(data.registration_end);

      if (now < regStart) {
        toast.error('Registration has not started yet');
        navigate('/');
        return;
      }

      if (now > regEnd) {
        toast.error('Registration has ended');
        navigate('/');
        return;
      }

      setExam({
        id: data.id,
        exam_name: data.exam_name,
        exam_date: data.exam_date,
        exam_time: data.exam_time,
        registration_type: (data as any).registration_type || 'free',
        registration_amount: (data as any).registration_amount || 0,
        photo_required: (data as any).photo_required || false,
        signature_required: (data as any).signature_required || false,
        approval_required: (data as any).approval_required ?? true,
        registration_start: data.registration_start,
        registration_end: data.registration_end,
      });
      
      setIsLoading(false);
    };

    fetchExam();
  }, [examId, navigate]);

  // For paid exams: create registration then redirect to Cashfree payment
  const handleCreateAndPay = async () => {
    setIsSubmitting(true);
    const values = form.getValues();

    try {
      const { data: response, error } = await invokeExternalFunction<{
        success?: boolean;
        registration_id?: string;
        registration_number?: string;
        error?: string;
      }>('register-for-exam', {
        exam_id: examId,
        full_name: values.full_name,
        email: values.email,
        mobile: values.mobile,
        date_of_birth: values.date_of_birth,
        gender: values.gender,
        address: values.address || null,
        city: values.city,
        state: values.state,
        pincode: values.pincode || null,
        class: values.class,
        board: values.board,
        school_name: values.school_name,
        academic_year: values.academic_year || null,
        percentage: values.percentage ? parseFloat(values.percentage) : null,
        photo_url: values.photo_url || null,
        signature_url: values.signature_url || null,
      });

      if (error) {
        throw new Error(error.message || 'Registration failed');
      }

      const data = response;

      if (!data.registration_id) {
        throw new Error('Registration creation failed');
      }

      toast.success('Registration created! Redirecting to payment...');
      navigate(`/registration-payment/${data.registration_id}`, {
        state: {
          registration: {
            id: data.registration_id,
            registration_number: data.registration_number,
            payment_status: 'pending',
            payment_amount: exam?.registration_amount || 0,
            exam: {
              exam_name: exam?.exam_name || '',
              exam_date: exam?.exam_date || '',
            },
            profile: {
              full_name: values.full_name,
              email: values.email,
            },
          }
        }
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Failed to register');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const values = form.getValues();

    try {
      // Call register-for-exam on external Supabase
      const { data: response, error } = await invokeExternalFunction<{
        success?: boolean;
        registration_id?: string;
        registration_number?: string;
        error?: string;
      }>('register-for-exam', {
        exam_id: examId,
        full_name: values.full_name,
        email: values.email,
        mobile: values.mobile,
        date_of_birth: values.date_of_birth,
        gender: values.gender,
        address: values.address || null,
        city: values.city,
        state: values.state,
        pincode: values.pincode || null,
        class: values.class,
        board: values.board,
        school_name: values.school_name,
        academic_year: values.academic_year || null,
        percentage: values.percentage ? parseFloat(values.percentage) : null,
        photo_url: values.photo_url || null,
        signature_url: values.signature_url || null,
      });

      if (error) {
        throw new Error(error.message || 'Registration failed');
      }

      const data = response;

      setRegistrationSuccess({
        registration_id: data.registration_id,
        registration_number: data.registration_number,
        student_name: values.full_name,
        exam_name: exam?.exam_name || '',
        approval_required: exam?.approval_required || true,
        payment_required: false,
      });

      toast.success('Registration successful!');
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Failed to register');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (registrationSuccess) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto py-8 px-4">
          <Card>
            <CardContent className="pt-8 text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              
              <div>
                <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                  Registration Successful!
                </h2>
                <p className="text-muted-foreground">
                  Your registration has been submitted successfully.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registration Number</span>
                  <span className="font-bold text-primary">{registrationSuccess.registration_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Candidate Name</span>
                  <span className="font-medium">{registrationSuccess.student_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exam</span>
                  <span className="font-medium">{registrationSuccess.exam_name}</span>
                </div>
              </div>

              <div className="text-left bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                <h3 className="font-medium mb-2">What's Next?</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  {registrationSuccess.payment_required && (
                    <li>Payment instructions will be sent to your email</li>
                  )}
                  {registrationSuccess.approval_required && (
                    <li>Your registration is pending admin approval</li>
                  )}
                  <li>You'll receive an email once your registration is approved</li>
                  <li>Login credentials will be shared after approval</li>
                </ul>
              </div>

              <Button onClick={() => navigate('/')} className="mt-4">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  const steps = getSteps();

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Exam Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">{exam?.exam_name}</h1>
          <p className="text-muted-foreground">
            Exam Date: {exam?.exam_date && new Date(exam.exam_date).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <StepIndicator steps={steps} currentStep={currentStep} />
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {getStepComponent()}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default ExamRegistrationWizard;
