import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

interface Subject {
  id: string;
  name: string;
  code: string | null;
}

const examSchema = z.object({
  exam_name: z.string().min(1, 'Exam name is required').max(200),
  exam_code: z.string().min(1, 'Exam code is required').max(20),
  description: z.string().optional(),
  instructions: z.string().optional(),
  exam_date: z.string().min(1, 'Exam date is required'),
  exam_time: z.string().min(1, 'Exam time is required'),
  duration_minutes: z.coerce.number().min(1, 'Duration must be at least 1 minute'),
  total_marks: z.coerce.number().min(1, 'Total marks must be at least 1'),
  passing_marks: z.coerce.number().min(0),
  marks_per_question: z.coerce.number().min(1).default(4),
  marks_per_wrong: z.coerce.number().min(0).default(1),
  registration_start: z.string().min(1, 'Registration start date is required'),
  registration_end: z.string().min(1, 'Registration end date is required'),
  eligibility_class: z.string().optional(),
  eligibility_category: z.string().optional(),
  eligibility_year: z.string().optional(),
  negative_marking: z.boolean().default(false),
  negative_mark_value: z.coerce.number().min(0).default(0.25),
  status: z.enum(['draft', 'registration_open', 'registration_closed', 'conducted', 'results_published']),
  is_active: z.boolean().default(true),
  proctoring_enabled: z.boolean().default(false),
  max_violations: z.coerce.number().min(1).max(10).default(3),
  auto_submit_on_violations: z.boolean().default(true),
  voice_monitoring_enabled: z.boolean().default(false),
  screen_recording_enabled: z.boolean().default(false),
  liberty_level: z.enum(['strict', 'moderate', 'relaxed']).default('moderate'),
  // New registration settings
  registration_type: z.enum(['free', 'paid']).default('free'),
  registration_amount: z.coerce.number().min(0).default(0),
  photo_required: z.boolean().default(false),
  signature_required: z.boolean().default(false),
  approval_required: z.boolean().default(true),
});

type ExamFormData = z.infer<typeof examSchema>;

const ExamForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(!!id);
  const isEditing = !!id;

  // Subject management
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [showAddSubjectDialog, setShowAddSubjectDialog] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [isAddingSubject, setIsAddingSubject] = useState(false);

  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      exam_name: '',
      exam_code: '',
      description: '',
      instructions: '',
      exam_date: '',
      exam_time: '09:00',
      duration_minutes: 180,
      total_marks: 100,
      passing_marks: 40,
      marks_per_question: 4,
      marks_per_wrong: 1,
      registration_start: '',
      registration_end: '',
      eligibility_class: '',
      eligibility_category: '',
      eligibility_year: '',
      negative_marking: false,
      negative_mark_value: 0.25,
      status: 'draft',
      is_active: true,
      proctoring_enabled: false,
      max_violations: 3,
      auto_submit_on_violations: true,
      voice_monitoring_enabled: false,
      screen_recording_enabled: false,
      liberty_level: 'moderate',
      // New registration settings
      registration_type: 'free',
      registration_amount: 0,
      photo_required: false,
      signature_required: false,
      approval_required: true,
    },
  });

  // Fetch subjects
  const fetchSubjects = async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setSubjects(data);
    }
  };

  // Fetch exam's subjects
  const fetchExamSubjects = async (examId: string) => {
    const { data, error } = await supabase
      .from('exam_subjects')
      .select('subject_id')
      .eq('exam_id', examId);
    
    if (!error && data) {
      setSelectedSubjects(data.map(es => es.subject_id));
    }
  };

  // Add new subject
  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) {
      toast.error('Please enter a subject name');
      return;
    }

    setIsAddingSubject(true);
    const { data, error } = await supabase
      .from('subjects')
      .insert({
        name: newSubjectName.trim(),
        code: newSubjectCode.trim() || null,
      })
      .select('id, name, code')
      .single();

    setIsAddingSubject(false);

    if (error) {
      toast.error('Failed to add subject');
      return;
    }

    setSubjects(prev => [...prev, data]);
    setSelectedSubjects(prev => [...prev, data.id]);
    setNewSubjectName('');
    setNewSubjectCode('');
    setShowAddSubjectDialog(false);
    toast.success('Subject added');
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects(prev => 
      prev.includes(subjectId) 
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (id) {
      const fetchExam = async () => {
        const { data, error } = await supabase
          .from('exams')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          toast.error('Failed to fetch exam details');
          navigate('/admin/exams');
          return;
        }

        if (data) {
          form.reset({
            exam_name: data.exam_name,
            exam_code: data.exam_code,
            description: data.description || '',
            instructions: data.instructions || '',
            exam_date: data.exam_date, // stored as YYYY-MM-DD
            exam_time: data.exam_time,
            duration_minutes: data.duration_minutes,
            total_marks: data.total_marks,
            passing_marks: data.passing_marks || 40,
            registration_start: data.registration_start.split('T')[0],
            registration_end: data.registration_end.split('T')[0],
            eligibility_class: data.eligibility_class || '',
            eligibility_category: data.eligibility_category || '',
            eligibility_year: data.eligibility_year || '',
            negative_marking: data.negative_marking || false,
            negative_mark_value: data.negative_mark_value || 0.25,
            status: data.status as ExamFormData['status'],
            is_active: data.is_active,
            proctoring_enabled: data.proctoring_enabled || false,
            max_violations: data.max_violations || 3,
            auto_submit_on_violations: data.auto_submit_on_violations ?? true,
            voice_monitoring_enabled: (data as any).voice_monitoring_enabled || false,
            screen_recording_enabled: (data as any).screen_recording_enabled || false,
            liberty_level: ((data as any).liberty_level as 'strict' | 'moderate' | 'relaxed') || 'moderate',
            // New registration settings
            registration_type: ((data as any).registration_type as 'free' | 'paid') || 'free',
            registration_amount: (data as any).registration_amount || 0,
            photo_required: (data as any).photo_required || false,
            signature_required: (data as any).signature_required || false,
            approval_required: (data as any).approval_required ?? true,
          });
          
          // Fetch exam subjects
          await fetchExamSubjects(id);
        }
        setIsFetching(false);
      };

      fetchExam();
    }
  }, [id, form, navigate]);

  const onSubmit = async (data: ExamFormData) => {
    setIsLoading(true);

    const examData = {
      exam_name: data.exam_name,
      exam_code: data.exam_code,
      description: data.description || null,
      instructions: data.instructions || null,
      exam_date: data.exam_date,
      exam_time: data.exam_time,
      duration_minutes: data.duration_minutes,
      total_marks: data.total_marks,
      passing_marks: data.passing_marks,
      marks_per_question: data.marks_per_question,
      marks_per_wrong: data.marks_per_wrong,
      registration_start: new Date(data.registration_start).toISOString(),
      registration_end: new Date(data.registration_end).toISOString(),
      eligibility_class: data.eligibility_class || null,
      eligibility_category: data.eligibility_category || null,
      eligibility_year: data.eligibility_year || null,
      negative_marking: data.negative_marking,
      negative_mark_value: data.negative_mark_value,
      status: data.status as 'draft' | 'registration_open' | 'registration_closed' | 'conducted' | 'results_published',
      is_active: data.is_active,
      proctoring_enabled: data.proctoring_enabled,
      max_violations: data.max_violations,
      auto_submit_on_violations: data.auto_submit_on_violations,
      voice_monitoring_enabled: data.voice_monitoring_enabled,
      screen_recording_enabled: data.screen_recording_enabled,
      liberty_level: data.liberty_level,
      // New registration settings
      registration_type: data.registration_type,
      registration_amount: data.registration_type === 'paid' ? data.registration_amount : 0,
      photo_required: data.photo_required,
      signature_required: data.signature_required,
      approval_required: data.approval_required,
    };

    let error;
    let examId = id;

    if (isEditing) {
      const result = await supabase
        .from('exams')
        .update(examData)
        .eq('id', id);
      error = result.error;
    } else {
      const result = await supabase
        .from('exams')
        .insert([{ ...examData, created_by: user?.id }])
        .select('id')
        .single();
      error = result.error;
      examId = result.data?.id;
    }

    if (error) {
      toast.error(isEditing ? 'Failed to update exam' : 'Failed to create exam');
      console.error(error);
      setIsLoading(false);
      return;
    }

    // Save exam subjects
    if (examId) {
      // Delete existing subjects
      await supabase
        .from('exam_subjects')
        .delete()
        .eq('exam_id', examId);

      // Insert new subjects
      if (selectedSubjects.length > 0) {
        const subjectInserts = selectedSubjects.map((subjectId, index) => ({
          exam_id: examId,
          subject_id: subjectId,
          display_order: index,
        }));

        const { error: subjectError } = await supabase
          .from('exam_subjects')
          .insert(subjectInserts);

        if (subjectError) {
          console.error('Failed to save subjects:', subjectError);
        }
      }
    }

    setIsLoading(false);
    toast.success(isEditing ? 'Exam updated successfully' : 'Exam created successfully');
    navigate('/admin/exams');
  };

  if (isFetching) {
    return (
      <AdminLayout title={isEditing ? 'Edit Exam' : 'Create New Exam'}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title={isEditing ? 'Edit Examination' : 'Create New Examination'} 
      description={isEditing ? 'Update examination details' : 'Set up a new examination'}
    >
      <div className="max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/exams')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Exams
        </Button>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Enter the basic details of the examination</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="exam_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exam Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., RKB Science Olympiad 2025" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="exam_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exam Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., RKB-SCI-2025" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of the examination..."
                          rows={3}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Exam instructions for students..."
                          rows={4}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Subjects */}
            <Card>
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
                <CardDescription>Select subjects included in this examination</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {subjects.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-4">No subjects available</p>
                    <Button type="button" onClick={() => setShowAddSubjectDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Subject
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {subjects.map((subject) => (
                        <label
                          key={subject.id}
                          htmlFor={`subject-${subject.id}`}
                          className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedSubjects.includes(subject.id) 
                              ? 'border-primary bg-primary/5' 
                              : 'hover:border-muted-foreground/50'
                          }`}
                        >
                          <Checkbox 
                            id={`subject-${subject.id}`}
                            checked={selectedSubjects.includes(subject.id)} 
                            onCheckedChange={() => toggleSubject(subject.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{subject.name}</p>
                            {subject.code && (
                              <p className="text-xs text-muted-foreground">{subject.code}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    
                    {selectedSubjects.length > 0 && subjects.length > 0 && (
                      <div className="pt-2">
                        <p className="text-sm text-muted-foreground mb-2">Selected subjects:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSubjects
                            .map(id => subjects.find(s => s.id === id))
                            .filter((subject): subject is Subject => subject !== undefined)
                            .map(subject => (
                              <Badge key={subject.id} variant="secondary" className="gap-1">
                                {subject.name}
                                <X 
                                  className="w-3 h-3 cursor-pointer" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubject(subject.id);
                                  }} 
                                />
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowAddSubjectDialog(true)}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Subject
                </Button>
              </CardContent>
            </Card>

            {/* Registration Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Registration Settings</CardTitle>
                <CardDescription>Configure registration type, fees, and requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="registration_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose whether registration is free or paid
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('registration_type') === 'paid' && (
                    <FormField
                      control={form.control}
                      name="registration_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Amount (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} placeholder="Enter amount" {...field} />
                          </FormControl>
                          <FormDescription>
                            Amount to be paid for registration
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="photo_required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Student Photo</FormLabel>
                          <FormDescription>
                            Require photo upload
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signature_required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Signature Photo</FormLabel>
                          <FormDescription>
                            Require signature upload
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="approval_required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Approval Required</FormLabel>
                          <FormDescription>
                            Admin approval needed
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
                <CardDescription>Set the examination date, time, and duration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="exam_date"
                    render={({ field }) => {
                      const value = field.value ? new Date(field.value) : undefined;
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Exam Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="justify-start text-left font-normal"
                                >
                                  {value ? format(value, 'dd-MM-yyyy') : <span>Pick a date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={value}
                                onSelect={(date) => {
                                  if (!date) {
                                    field.onChange('');
                                  } else {
                                    // Store as local date string YYYY-MM-DD (avoid timezone shift)
                                    field.onChange(format(date, 'yyyy-MM-dd'));
                                  }
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="exam_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="registration_start"
                    render={({ field }) => {
                      const value = field.value ? new Date(field.value) : undefined;
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Registration Opens</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="justify-start text-left font-normal"
                                >
                                  {value ? format(value, 'dd-MM-yyyy') : <span>Pick a date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={value}
                                onSelect={(date) => {
                                  if (!date) {
                                    field.onChange('');
                                  } else {
                                    field.onChange(format(date, 'yyyy-MM-dd'));
                                  }
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="registration_end"
                    render={({ field }) => {
                      const value = field.value ? new Date(field.value) : undefined;
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Registration Closes</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="justify-start text-left font-normal"
                                >
                                  {value ? format(value, 'dd-MM-yyyy') : <span>Pick a date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={value}
                                onSelect={(date) => {
                                  if (!date) {
                                    field.onChange('');
                                  } else {
                                    field.onChange(format(date, 'yyyy-MM-dd'));
                                  }
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Marking Scheme */}
            <Card>
              <CardHeader>
                <CardTitle>Marking Scheme</CardTitle>
                <CardDescription>Configure marks and grading options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="total_marks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Marks</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="passing_marks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passing Marks</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="negative_marking"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Negative Marking</FormLabel>
                          <FormDescription>
                            Deduct marks for wrong answers
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch('negative_marking') && (
                    <FormField
                      control={form.control}
                      name="negative_mark_value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Negative Mark Value</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.25" min={0} {...field} />
                          </FormControl>
                          <FormDescription>
                            Marks deducted per wrong answer
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Proctoring Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Proctoring & Violation Settings</CardTitle>
                <CardDescription>Configure exam monitoring, tab-switch detection, and violation handling</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* General Violation Settings - Always visible */}
                <div className="space-y-4 pb-4 border-b">
                  <h4 className="font-medium">Violation Detection</h4>
                  <p className="text-sm text-muted-foreground">
                    These settings control how tab switches, fullscreen exits, and window focus loss are handled during exams.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="max_violations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Violations Allowed</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={10} {...field} />
                          </FormControl>
                          <FormDescription>
                            Number of tab switches / violations before action
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="auto_submit_on_violations"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Auto-Submit on Max Violations</FormLabel>
                            <FormDescription>
                              Automatically submit exam after max violations reached
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Camera Proctoring - Optional */}
                <div className="space-y-4 pt-2">
                  <h4 className="font-medium">Camera Proctoring (Optional)</h4>
                  
                  <FormField
                    control={form.control}
                    name="proctoring_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable Camera Proctoring</FormLabel>
                          <FormDescription>
                            Monitor students via webcam and detect head movement during exam
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="voice_monitoring_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Voice Monitoring</FormLabel>
                          <FormDescription>
                            Detect voice/sound during exam
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="screen_recording_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Screen Capture</FormLabel>
                          <FormDescription>
                            Capture periodic screenshots
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="liberty_level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Liberty Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="strict">Strict</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="relaxed">Relaxed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Eligibility */}
            <Card>
              <CardHeader>
                <CardTitle>Eligibility Criteria</CardTitle>
                <CardDescription>Set student eligibility requirements (optional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="eligibility_class"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 10th, 12th" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eligibility_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Science, Commerce" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eligibility_year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Academic Year</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 2024-2025" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status & Visibility</CardTitle>
                <CardDescription>Control exam status and visibility</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="registration_open">Registration Open</SelectItem>
                            <SelectItem value="registration_closed">Registration Closed</SelectItem>
                            <SelectItem value="conducted">Conducted</SelectItem>
                            <SelectItem value="results_published">Results Published</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Make this exam visible to students
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/admin/exams')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Update Exam' : 'Create Exam'}
              </Button>
            </div>
          </form>
        </Form>

        {/* Add Subject Dialog */}
        <Dialog open={showAddSubjectDialog} onOpenChange={setShowAddSubjectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Subject</DialogTitle>
              <DialogDescription>
                Create a new subject that can be used across exams
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject Name *</Label>
                <Input
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g., Mathematics, Physics"
                />
              </div>
              <div>
                <Label>Subject Code (Optional)</Label>
                <Input
                  value={newSubjectCode}
                  onChange={(e) => setNewSubjectCode(e.target.value)}
                  placeholder="e.g., MATH, PHY"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddSubjectDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSubject} disabled={isAddingSubject}>
                {isAddingSubject && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Subject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default ExamForm;
