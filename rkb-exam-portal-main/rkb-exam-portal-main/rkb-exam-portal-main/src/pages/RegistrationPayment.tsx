import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase } from '@/lib/externalSupabase';
import { toast } from 'sonner';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Loader2, CreditCard, IndianRupee, Shield, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useCashfree } from '@/hooks/useCashfree';

interface RegistrationDetails {
  id: string;
  registration_number: string;
  payment_status: string;
  payment_amount: number;
  exam: {
    exam_name: string;
    exam_date: string;
  };
  profile: {
    full_name: string;
    email: string;
  };
}

const RegistrationPayment = () => {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [registration, setRegistration] = useState<RegistrationDetails | null>(null);
  const { isLoaded, checkout } = useCashfree();

  // Get registration details from location state or fetch from DB
  useEffect(() => {
    const fetchRegistration = async () => {
      if (!registrationId) {
        toast.error('Invalid registration');
        navigate('/');
        return;
      }

      try {
        // First check if we have details from navigation state
        if (location.state?.registration) {
          setRegistration(location.state.registration);
          setIsLoading(false);
          return;
        }

        // Fetch registration details from external Supabase
        const { data, error } = await externalSupabase
          .from('registrations')
          .select(`
            id,
            registration_number,
            payment_status,
            payment_amount,
            exam_id,
            student_id
          `)
          .eq('id', registrationId)
          .single();

        if (error || !data) {
          throw new Error('Registration not found');
        }

        // Check if already paid
        if (data.payment_status === 'completed') {
          toast.success('Payment already completed');
          navigate('/');
          return;
        }

        // Fetch exam details from external Supabase
        const { data: examData } = await externalSupabase
          .from('exams')
          .select('exam_name, exam_date')
          .eq('id', data.exam_id)
          .single();

        // Fetch profile details from external Supabase
        const { data: profileData } = await externalSupabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', data.student_id)
          .single();

        setRegistration({
          id: data.id,
          registration_number: data.registration_number || '',
          payment_status: data.payment_status || 'pending',
          payment_amount: data.payment_amount || 0,
          exam: {
            exam_name: examData?.exam_name || '',
            exam_date: examData?.exam_date || '',
          },
          profile: {
            full_name: profileData?.full_name || '',
            email: profileData?.email || '',
          },
        });
      } catch (error: any) {
        console.error('Error fetching registration:', error);
        toast.error(error.message || 'Failed to load registration');
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRegistration();
  }, [registrationId, navigate, location.state]);

  const handlePayNow = async () => {
    if (!registration || !isLoaded) {
      toast.error('Payment system is loading. Please wait...');
      return;
    }

    setIsProcessing(true);

    try {
      console.log('[RegistrationPayment] Creating Cashfree order via Lovable Cloud...');
      
      // Call Lovable Cloud's create-cashfree-order (it accesses external DB via EXTERNAL_* credentials)
      const { data, error } = await supabase.functions.invoke('create-cashfree-order', {
        body: { registration_id: registration.id }
      });

      console.log('[RegistrationPayment] Response:', { data, error });

      if (error) {
        throw new Error(error.message || 'Failed to create order');
      }

      // Check for payment_session_id directly (the external function doesn't return success: true)
      if (!data?.payment_session_id) {
        throw new Error(data?.error || 'Failed to create payment order');
      }

      console.log('[RegistrationPayment] Order created, opening checkout...');
      
      // Default to production since external backend uses CASHFREE_ENVIRONMENT=production
      const environment = data.environment === 'sandbox' ? 'sandbox' : 'production';
      
      await checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: '_self',
      }, environment);

    } catch (error: any) {
      console.error('[RegistrationPayment] Payment error:', error);
      toast.error(error.message || 'Failed to initiate payment');
      setIsProcessing(false);
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

  if (!registration) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Registration not found</p>
        </div>
      </PublicLayout>
    );
  }

  // If payment is already completed
  if (registration.payment_status === 'completed') {
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
                  Payment Completed!
                </h2>
                <p className="text-muted-foreground">
                  Your payment has already been processed.
                </p>
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

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold">Complete Your Payment</h2>
              <p className="text-muted-foreground">Pay the registration fee to complete your enrollment</p>
            </div>

            {/* Registration Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Registration Number</span>
                <span className="font-bold text-primary">{registration.registration_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Candidate Name</span>
                <span className="font-medium">{registration.profile.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam</span>
                <span className="font-medium">{registration.exam.exam_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam Date</span>
                <span className="font-medium">
                  {new Date(registration.exam.exam_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Payment Details</h3>
                  <p className="text-sm text-muted-foreground">Secure payment via Cashfree</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Registration Fee</span>
                  <span className="font-medium flex items-center">
                    <IndianRupee className="h-4 w-4" />
                    {registration.payment_amount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Processing Fee</span>
                  <span className="font-medium">₹0</span>
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="font-semibold">Total Amount</span>
                  <span className="font-bold text-lg flex items-center text-primary">
                    <IndianRupee className="h-5 w-5" />
                    {registration.payment_amount}
                  </span>
                </div>
              </div>
            </div>

            {/* Security Badge */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                Secure Payment Gateway
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Cashfree
                </Badge>
                <span className="text-sm text-muted-foreground">
                  UPI, Cards, Net Banking, Wallets
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Your payment is secured with 256-bit encryption.
              </p>
            </div>

            {/* Pay Button */}
            <Button 
              onClick={handlePayNow} 
              disabled={isProcessing || !isLoaded}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay ₹{registration.payment_amount}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default RegistrationPayment;
