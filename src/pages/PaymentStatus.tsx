import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { supabase, invokeExternalFunction } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Home, RefreshCw, Receipt, Calendar, Mail, Phone, User } from 'lucide-react';
import { format } from 'date-fns';

type PaymentStatusType = 'loading' | 'success' | 'failed' | 'pending';

interface RegistrationDetails {
  id: string;
  registration_number: string | null;
  payment_amount: number | null;
  payment_time: string | null;
  transaction_id: string | null;
  payment_status?: string | null;
  profiles: {
    full_name: string;
    email: string | null;
    mobile: string | null;
  } | null;
  exams: {
    exam_name: string;
    exam_code: string;
    exam_date: string;
  } | null;
}

const PaymentStatus = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PaymentStatusType>('loading');
  const [registration, setRegistration] = useState<RegistrationDetails | null>(null);
  const [orderAmount, setOrderAmount] = useState<number | null>(null);
  const [responseOrderId, setResponseOrderId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const orderId = searchParams.get('order_id');
  const registrationId = searchParams.get('registration_id');

  const verifyPayment = async () => {
    if (!orderId && !registrationId) {
      setStatus('failed');
      return;
    }

    setIsVerifying(true);

    try {
      const { data, error } = await invokeExternalFunction<any>('verify-payment', {
        order_id: orderId,
        registration_id: registrationId,
      });

      console.log('[PaymentStatus] response:', { data, error });

      if (error) throw error;

      if (data?.order_id) setResponseOrderId(data.order_id);
      if (data?.order_amount) setOrderAmount(data.order_amount);
      if (data?.registration) setRegistration(data.registration);

      if (data?.payment_status === 'completed') {
        setStatus('success');
      } else if (data?.payment_status === 'failed') {
        setStatus('failed');
      } else {
        setStatus('pending');
      }
    } catch (error) {
      console.error('Payment verification error:', error);

      // Fallback: try reading payment status directly from external Supabase
      try {
        if (registrationId) {
          const { data: reg, error: regError } = await supabase
            .from('registrations')
            .select(`
              id, 
              registration_number, 
              payment_amount, 
              payment_time, 
              transaction_id, 
              payment_status,
              profiles!registrations_student_id_profiles_fkey(full_name, email, mobile),
              exams!registrations_exam_id_fkey(exam_name, exam_code, exam_date)
            `)
            .eq('id', registrationId)
            .maybeSingle();

          if (regError) {
            console.error('Fallback query error:', regError);
          }

          if (reg) {
            setRegistration(reg as RegistrationDetails);

            if (reg.payment_status === 'completed') {
              setStatus('success');
            } else if (reg.payment_status === 'failed') {
              setStatus('failed');
            } else {
              setStatus('pending');
            }

            return;
          }
        }
      } catch (fallbackError) {
        console.error('Payment status fallback error:', fallbackError);
      }

      // If verification fails (network/env mismatch), do NOT show "failed" (it confuses users after success).
      // Treat as pending and allow manual "Verify Again".
      setStatus('pending');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    verifyPayment();
  }, [orderId, registrationId]);

  const renderReceipt = () => {
    const profile = registration?.profiles;
    const exam = registration?.exams;

    return (
      <div className="space-y-6">
        {/* Hero success header */}
        <div className="rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 px-6 py-5 text-center text-primary-foreground shadow-sm">
          <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="h-8 w-8 text-lime-200" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Payment Successful</h2>
          <p className="text-sm text-emerald-50 mt-1">
            Your registration has been securely completed.
          </p>
        </div>

        {/* Receipt card */}
        <div className="bg-card rounded-xl p-6 border border-primary/20 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Payment Receipt</h3>
          </div>
          <div className="space-y-3 text-sm">
            {registration?.registration_number && (
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Registration No.</span>
                <span className="font-bold text-primary text-lg">{registration.registration_number}</span>
              </div>
            )}
            {responseOrderId && (
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-sm break-all">{responseOrderId}</span>
              </div>
            )}
            {registration?.transaction_id && (
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Transaction ID</span>
                <span className="font-mono text-sm">{registration.transaction_id}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                ₹{registration?.payment_amount || orderAmount || 0}
              </span>
            </div>
            {registration?.payment_time && (
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Payment Time</span>
                <span className="text-sm">{format(new Date(registration.payment_time), 'dd MMM yyyy, hh:mm a')}</span>
              </div>
            )}
          </div>
        </div>

        {exam && (
          <div className="bg-muted/40 rounded-xl p-6 border border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Exam Details</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam Name</span>
                <span className="font-medium">{exam.exam_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam Code</span>
                <span className="font-mono">{exam.exam_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exam Date</span>
                <span>{format(new Date(exam.exam_date), 'dd MMMM yyyy')}</span>
              </div>
            </div>
          </div>
        )}

        {profile && (
          <div className="bg-muted/40 rounded-xl p-6 border border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Student Details</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{profile.full_name}</span>
              </div>
              {profile.email && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
                  <span className="text-sm">{profile.email}</span>
                </div>
              )}
              {profile.mobile && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Mobile</span>
                  <span className="text-sm">{profile.mobile}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next steps */}
        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
          <h3 className="font-medium mb-2">What's Next?</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Your registration is now complete</li>
            <li>You will receive a confirmation email shortly</li>
            <li>Login credentials will be shared before the exam</li>
          </ul>
        </div>

        <Button onClick={() => navigate('/')} className="w-full" size="lg">
          <Home className="mr-2 h-5 w-5" />
          Back to Home
        </Button>
      </div>
    );
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center space-y-4 py-8">
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Verifying Payment...</h2>
            <p className="text-muted-foreground">Please wait while we confirm your payment status.</p>
            <div className="mt-8 animate-in fade-in duration-1000 delay-1000">
               <p className="text-xs text-muted-foreground italic">
                 Taking longer than expected? The payment might be still processing at the gateway. 
                 You can try refreshing or clicking Verify Again if it stays like this.
               </p>
            </div>
          </div>
        );
      case 'success':
        return renderReceipt();
      case 'failed':
        return (
          <div className="text-center space-y-6 py-4">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Payment Failed</h2>
              <p className="text-muted-foreground">Unfortunately, your payment could not be processed.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                <Home className="mr-2 h-4 w-4" /> Home
              </Button>
              <Button onClick={verifyPayment} disabled={isVerifying} className="flex-1">
                {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Verify Again
              </Button>
            </div>
          </div>
        );
      case 'pending':
        return (
          <div className="text-center space-y-6 py-4">
            <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">Payment Pending</h2>
              <p className="text-muted-foreground">Your payment is being processed. This may take a few minutes.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                <Home className="mr-2 h-4 w-4" /> Home
              </Button>
              <Button onClick={verifyPayment} disabled={isVerifying} className="flex-1">
                {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Verify Again
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <Card>
          <CardContent className="pt-6 pb-6">{renderContent()}</CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default PaymentStatus;
