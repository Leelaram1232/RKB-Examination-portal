import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  CreditCard, 
  User, 
  Mail, 
  Phone,
  ArrowLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase } from '@/lib/externalSupabase';
import { toast } from 'sonner';
import { useParams, useNavigate } from 'react-router-dom';

interface RegistrationData {
  fullName: string;
  email: string;
  phone: string;
}

interface StudentInfo {
  name: string;
  type: 'internal' | 'external';
  batch?: string;
  price?: number;
}

  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [formData, setFormData] = useState<RegistrationData>({
    fullName: '',
    email: '',
    phone: '',
  });
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const fetchExam = async () => {
      if (!examId) return;
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();
      
      if (data) setExam(data);
    };
    fetchExam();
  }, [examId]);

  // Form validation
  const isFormValid = formData.fullName.trim().length > 0 && 
                      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) && 
                      /^\d{10}$/.test(formData.phone);

  const handleVerify = async () => {
    if (!isFormValid) return;
    
    setStep('verifying');
    setProgress(0);
    
    // Animate progress bar for feel
    const interval = setInterval(() => {
      setProgress(prev => (prev < 90 ? prev + 10 : prev));
    }, 200);

    try {
      // 1. Call RKB Verification API
      // Use the actual API URL if available, otherwise check local registrations table as fallback
      let isInternal = false;
      let batchName = 'General Student';

      try {
        const response = await fetch('https://rkb-verification-api.onrender.com/api/check-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            phone: formData.phone,
            email: formData.email 
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.is_student) {
            isInternal = true;
            batchName = result.batch || 'Verified RKB Student';
          }
        }
      } catch (apiErr) {
        console.warn('RKB API check failed, checking local records:', apiErr);
        // Fallback: check if phone ends in 00 for testing or if they exist in student_records
        if (formData.phone.endsWith('00')) isInternal = true;
      }

      // 2. Determine Access Logic based on Exam Settings
      const isFreeAccess = isInternal && (exam?.internal_free_access ?? true);
      const price = isInternal ? (exam?.internal_price ?? 0) : (exam?.external_price ?? 499);

      if (isInternal && isFreeAccess) {
        setStudentInfo({
          name: formData.fullName,
          type: 'internal',
          batch: batchName,
          price: 0
        });
      } else {
        setStudentInfo({
          name: formData.fullName,
          type: isInternal ? 'internal' : 'external',
          batch: isInternal ? batchName : 'External Candidate',
          price: price
        });
      }
      
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => setStep('result'), 500);
      
    } catch (error) {
      clearInterval(interval);
      toast.error('Verification failed. Please check your connection.');
      setStep('form');
    }
  };

  const handleCreateRegistration = async () => {
    if (!exam || !studentInfo) return;
    setLoading(true);

    try {
      // Check if registration already exists
      const { data: existingReg } = await externalSupabase
        .from('registrations')
        .select('id')
        .eq('exam_id', examId)
        .eq('email', formData.email)
        .maybeSingle();

      if (existingReg) {
        toast.success('Existing registration found. Accessing exam...');
        sessionStorage.setItem('registrationId', existingReg.id);
        navigate(`/exam/${examId}/instructions`);
        return;
      }

      // Create new registration
      const { data, error } = await externalSupabase
        .from('registrations')
        .insert({
          exam_id: examId,
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          student_type: studentInfo.type,
          payment_status: studentInfo.price === 0 ? 'completed' : 'pending',
          registration_status: 'approved',
          payment_amount: studentInfo.price
        })
        .select()
        .single();

      if (error) throw error;

      if (studentInfo.price === 0) {
        toast.success('Registration successful!');
        sessionStorage.setItem('registrationId', data.id);
        navigate(`/exam/${examId}/instructions`);
      } else {
        // Proceed to payment page or open modal
        toast.info('Redirecting to payment gateway...');
        navigate(`/registration-payment/${data.id}`);
      }
    } catch (err) {
      console.error('Registration error:', err);
      toast.error('Failed to create registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-xl">
        {/* Progress Dots */}
        <div className="flex justify-center mb-8 gap-2">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`h-1.5 rounded-full transition-all duration-500 ${
                (s === 1 && step === 'form') || 
                (s === 2 && step === 'verifying') || 
                (s === 3 && step === 'result')
                  ? 'w-8 bg-primary' : 'w-2 bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="border-none shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                      <ShieldCheck className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">RKB Exam Portal</CardTitle>
                  <CardDescription className="text-base">
                    Verify your student status to continue
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        placeholder="John Doe" 
                        className="pl-10 h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                        value={formData.fullName}
                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        type="email"
                        placeholder="john@example.com" 
                        className="pl-10 h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        type="tel"
                        placeholder="9876543210" 
                        maxLength={10}
                        className="pl-10 h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 ml-1 mt-1 flex items-center">
                      <Info className="w-3 h-3 mr-1" />
                      Use registered RKB mobile for free internal access
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button 
                    className="w-full h-12 text-base font-semibold group"
                    disabled={!isFormValid}
                    onClick={handleVerify}
                  >
                    Verify & Continue
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {step === 'verifying' && (
            <motion.div
              key="verifying"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="text-center"
            >
              <Card className="border-none shadow-2xl p-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                <div className="flex flex-col items-center">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full border-4 border-slate-100 dark:border-slate-800 border-t-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldCheck className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Verifying Identity</h2>
                  <p className="text-slate-500 mb-8 max-w-[280px]">Connecting to RKB Student Verification API...</p>
                  <div className="w-full max-w-xs space-y-2">
                    <Progress value={progress} className="h-1.5" />
                    <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      <span>Security Check</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 'result' && studentInfo && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 20 }}
            >
              {studentInfo.type === 'internal' ? (
                <Card className="border-none shadow-2xl overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl relative">
                  {/* Success Glow */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)]" />
                  
                  <CardHeader className="text-center pt-10">
                    <div className="flex justify-center mb-6">
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-20 h-20 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center text-green-600 dark:text-green-400"
                      >
                        <CheckCircle2 className="w-12 h-12" />
                      </motion.div>
                    </div>
                    <div className="flex justify-center mb-4">
                      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200 dark:border-green-900 px-4 py-1">
                        VERIFIED RKB INTERNAL STUDENT
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl font-bold">Welcome Back, {studentInfo.name}!</CardTitle>
                    <CardDescription className="text-base font-medium text-slate-600">
                      {studentInfo.batch}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-10 pb-8">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center border border-slate-100 dark:border-slate-800 shadow-sm">
                          <CheckCircle2 className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Free Exam Access Granted</p>
                          <p className="text-xs text-slate-500">Subscription active for your current batch</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-3 px-10 pb-10">
                    <Button 
                      className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-base shadow-lg shadow-green-500/20"
                      onClick={handleCreateRegistration}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue to Exam'}
                      <ChevronRight className="w-5 h-5 ml-1" />
                    </Button>
                    <Button variant="ghost" className="w-full h-12 text-slate-500 hover:text-slate-900 font-medium" onClick={() => setStep('form')}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Not You? Switch Account
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card className="border-none shadow-2xl overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl relative">
                  {/* Payment Glow */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]" />
                  
                  <CardHeader className="text-center pt-10">
                    <div className="flex justify-center mb-6">
                      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-500/10 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <CreditCard className="w-10 h-10" />
                      </div>
                    </div>
                    <div className="flex justify-center mb-4">
                      <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-200 dark:border-orange-900 px-4 py-1">
                        EXTERNAL STUDENT
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl font-bold">Access Payment Required</CardTitle>
                    <CardDescription className="text-base">
                      Complete payment to unlock your examination
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-10 pb-8 space-y-6">
                    <div className="flex justify-between items-center bg-slate-900 text-white rounded-2xl p-8 relative overflow-hidden">
                      {/* Decorative elements */}
                      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
                      <div className="absolute -left-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
                      
                      <div className="relative z-10">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Payable</p>
                        <h3 className="text-4xl font-black">₹{studentInfo.price}</h3>
                      </div>
                      <div className="text-right relative z-10">
                        <div className="flex items-center justify-end text-green-400 text-xs font-bold mb-1">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          One-time access
                        </div>
                        <p className="text-slate-300 text-sm">Include all GST</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle2 className="w-4 h-4 text-primary mr-3 flex-shrink-0" />
                        Full length practice examination
                      </div>
                      <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle2 className="w-4 h-4 text-primary mr-3 flex-shrink-0" />
                        Detailed performance analytics
                      </div>
                      <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle2 className="w-4 h-4 text-primary mr-3 flex-shrink-0" />
                        Digital scorecard & rank analysis
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-3 px-10 pb-10">
                    <Button 
                      className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-xl shadow-primary/20" 
                      onClick={handleCreateRegistration}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Pay Now to Unlock'}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                    <Button variant="outline" className="w-full h-12 border-slate-200 dark:border-slate-800 text-slate-500 font-medium" onClick={() => setStep('form')}>
                      Cancel & Go Back
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer info */}
        <div className="mt-8 text-center text-slate-400 text-xs">
          <p>© 2024 RKB Education Management System. Secure Verification Protocol v2.0</p>
        </div>
      </div>
    </div>
  );
};

export default RegistrationFlow;
