import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { externalSupabase, invokeExternalFunction } from '@/lib/externalSupabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PublicLayout } from '@/components/layout/PublicLayout';

const registrationSchema = z.object({
  full_name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Mobile number must be 10 digits'),
  gender: z.enum(['male', 'female', 'other'], { required_error: 'Please select gender' }),
  date_of_birth: z.date({ required_error: 'Date of birth is required' }),
  class: z.string().min(1, 'Class is required'),
  school_name: z.string().min(3, 'School name must be at least 3 characters').max(200),
  board: z.string().min(1, 'Board is required'),
  academic_year: z.string().min(1, 'Academic year is required'),
  address: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  percentage: z.string().optional(),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string | null;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  eligibility_class: string | null;
  eligibility_category: string | null;
  registration_end: string;
}

interface RegistrationSuccess {
  registration_number: string;
  exam_name: string;
  student_name: string;
  email: string;
  registration_date: string;
}

const states = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir'
];

const boards = ['CBSE', 'ICSE', 'State Board', 'IB', 'Other'];
const classes = ['8th', '9th', '10th', '11th', '12th', 'Graduate', 'Post Graduate'];

export default function ExamRegistration() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exam, setExam] = useState<Exam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<RegistrationSuccess | null>(null);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      full_name: '',
      email: '',
      mobile: '',
      class: '',
      school_name: '',
      board: '',
      academic_year: new Date().getFullYear().toString(),
      address: '',
      city: '',
      state: '',
      pincode: '',
      percentage: '',
    },
  });

  useEffect(() => {
    const fetchExam = async () => {
      if (!examId) return;

      // Fetch exam from external Supabase
      const { data, error } = await externalSupabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .eq('status', 'registration_open')
        .maybeSingle();

      if (error || !data) {
        toast({
          title: 'Error',
          description: 'Exam not found or registration is closed',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      setExam(data);
      setIsLoading(false);
    };

    fetchExam();
  }, [examId, navigate, toast]);

  const onSubmit = async (data: RegistrationFormData) => {
    if (!examId) return;

    setIsSubmitting(true);

    try {
      // Call register-for-exam on external Supabase
      const { data: response, error } = await invokeExternalFunction<{
        success: boolean;
        registration_number?: string;
        exam_name?: string;
        student_name?: string;
        email?: string;
        registration_date?: string;
        error?: string;
      }>('register-for-exam', {
        exam_id: examId,
        full_name: data.full_name,
        email: data.email.toLowerCase(),
        mobile: data.mobile,
        gender: data.gender,
        date_of_birth: format(data.date_of_birth, 'yyyy-MM-dd'),
        class: data.class,
        school_name: data.school_name,
        board: data.board,
        academic_year: data.academic_year,
        address: data.address || '',
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        percentage: data.percentage ? parseFloat(data.percentage) : undefined,
      });

      if (error) {
        throw new Error(error.message || 'Registration failed');
      }

      const result = response;

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      setRegistrationSuccess({
        registration_number: result.registration_number,
        exam_name: result.exam_name,
        student_name: result.student_name,
        email: result.email,
        registration_date: result.registration_date,
      });

      toast({
        title: 'Registration Successful!',
        description: `Your registration number is ${result.registration_number}`,
      });

    } catch (error: any) {
      console.error('Registration error:', error);
      toast({
        title: 'Registration Failed',
        description: error.message || 'Please try again later',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (registrationSuccess) {
    return (
      <PublicLayout>
        <div className="container max-w-2xl py-8 space-y-6">
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-4" />
              <CardTitle className="text-2xl text-green-800">Registration Successful!</CardTitle>
              <CardDescription className="text-green-700">
                Your application has been submitted successfully
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white rounded-lg p-6 space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Registration Number</span>
                  <span className="font-bold text-lg">{registrationSuccess.registration_number}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Exam Name</span>
                  <span className="font-medium">{registrationSuccess.exam_name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Candidate Name</span>
                  <span className="font-medium">{registrationSuccess.student_name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{registrationSuccess.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registration Date</span>
                  <span className="font-medium">
                    {format(new Date(registrationSuccess.registration_date), 'PPpp')}
                  </span>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Important:</strong> Exam login will be enabled only after admin approval. 
                  You will receive an email notification once your registration is approved.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm">
                  <strong>Login Credentials (after approval):</strong><br />
                  Email: {registrationSuccess.email}<br />
                  Password: Your Date of Birth (DDMMYY format)
                </p>
              </div>

              <Button onClick={() => navigate('/')} className="w-full">
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container max-w-4xl py-8 space-y-6">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Exams
        </Button>

        {exam && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{exam.exam_name}</CardTitle>
              <CardDescription>{exam.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Exam Code</span>
                  <p className="font-medium">{exam.exam_code}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Exam Date</span>
                  <p className="font-medium">{format(new Date(exam.exam_date), 'PPP')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium">{exam.duration_minutes} minutes</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Registration Ends</span>
                  <p className="font-medium">{format(new Date(exam.registration_end), 'PPP')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Registration Form</CardTitle>
            <CardDescription>
              Please fill in all the required details carefully. Fields marked with * are mandatory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {/* Personal Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Personal Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="full_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mobile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Number *</FormLabel>
                          <FormControl>
                            <Input placeholder="10 digit mobile number" maxLength={10} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date of Birth *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    'w-full pl-3 text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, 'PPP')
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() || date < new Date('1990-01-01')
                                }
                                initialFocus
                                captionLayout="dropdown-buttons"
                                fromYear={1990}
                                toYear={new Date().getFullYear()}
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Academic Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Academic Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="class"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Class *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select class" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {classes.map((cls) => (
                                <SelectItem key={cls} value={cls}>
                                  {cls}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="school_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School/College Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter school name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="board"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Board *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select board" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {boards.map((board) => (
                                <SelectItem key={board} value={board}>
                                  {board}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="academic_year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Academic Year *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[2024, 2025, 2026].map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}-{year + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="percentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Previous Year Percentage</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 85.5" step="0.01" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Address Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Address Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter city" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select state" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {states.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="pincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pincode *</FormLabel>
                          <FormControl>
                            <Input placeholder="6 digit pincode" maxLength={6} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    By submitting this form, you agree to the terms and conditions of the examination. 
                    Please ensure all information provided is accurate and complete.
                  </p>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Registration'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
