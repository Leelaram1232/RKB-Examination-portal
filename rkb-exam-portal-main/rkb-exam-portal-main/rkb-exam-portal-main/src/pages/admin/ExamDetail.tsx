import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Edit, 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  CheckCircle,
  AlertCircle,
  BookOpen,
  MonitorPlay,
  Shield,
  Video
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string | null;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number | null;
  negative_marking: boolean | null;
  negative_mark_value: number | null;
  status: string;
  is_active: boolean;
  registration_start: string;
  registration_end: string;
  eligibility_class: string | null;
  eligibility_year: string | null;
  eligibility_category: string | null;
  instructions: string | null;
  created_at: string | null;
  proctoring_enabled: boolean | null;
  max_violations: number | null;
  auto_submit_on_violations: boolean | null;
}

interface Stats {
  totalQuestions: number;
  totalRegistrations: number;
  approvedRegistrations: number;
  pendingRegistrations: number;
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  registration_open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  registration_closed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  conducted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  results_published: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const ExamDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalQuestions: 0,
    totalRegistrations: 0,
    approvedRegistrations: 0,
    pendingRegistrations: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExamDetails = async () => {
      if (!id) return;

      // Fetch exam details
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (examError || !examData) {
        toast.error('Exam not found');
        navigate('/admin/exams');
        return;
      }

      setExam(examData);

      // Fetch questions count
      const { count: questionsCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', id);

      // Fetch registrations stats
      const { data: registrations } = await supabase
        .from('registrations')
        .select('approval_status')
        .eq('exam_id', id);

      const approved = registrations?.filter(r => r.approval_status === 'approved').length || 0;
      const pending = registrations?.filter(r => r.approval_status === 'pending').length || 0;

      setStats({
        totalQuestions: questionsCount || 0,
        totalRegistrations: registrations?.length || 0,
        approvedRegistrations: approved,
        pendingRegistrations: pending,
      });

      setIsLoading(false);
    };

    fetchExamDetails();
  }, [id, navigate]);

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (isLoading) {
    return (
      <AdminLayout title="Exam Details" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!exam) {
    return (
      <AdminLayout title="Exam Not Found" description="">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">Exam not found</p>
            <Button asChild className="mt-4">
              <Link to="/admin/exams">Back to Exams</Link>
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title={exam.exam_name} 
      description={`Code: ${exam.exam_code}`}
    >
      <div className="space-y-6">
        {/* Actions Bar */}
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate('/admin/exams')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Exams
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to={`/admin/exams/${id}/edit`}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Exam
              </Link>
            </Button>
          </div>
        </div>

        {/* Status & Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={`mt-1 ${statusColors[exam.status] || 'bg-muted'}`}>
                    {formatStatus(exam.status)}
                  </Badge>
                </div>
                {exam.is_active ? (
                  <CheckCircle className="w-8 h-8 text-green-500" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Questions</p>
                  <p className="text-2xl font-bold">{stats.totalQuestions}</p>
                </div>
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Registrations</p>
                  <p className="text-2xl font-bold">{stats.totalRegistrations}</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{stats.approvedRegistrations}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exam Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Schedule & Duration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Exam Date</p>
                  <p className="font-medium">{format(new Date(exam.exam_date), 'PPP')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Exam Time</p>
                  <p className="font-medium">{exam.exam_time}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{exam.duration_minutes} minutes</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Marks</p>
                  <p className="font-medium">{exam.total_marks}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Registration Period</p>
                <p className="text-sm">
                  {format(new Date(exam.registration_start), 'PPP')} — {format(new Date(exam.registration_end), 'PPP')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Marking Scheme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Marks</p>
                  <p className="font-medium">{exam.total_marks}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Passing Marks</p>
                  <p className="font-medium">{exam.passing_marks || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Negative Marking</p>
                  <p className="font-medium">{exam.negative_marking ? 'Yes' : 'No'}</p>
                </div>
                {exam.negative_marking && (
                  <div>
                    <p className="text-sm text-muted-foreground">Deduction per Wrong</p>
                    <p className="font-medium">{exam.negative_mark_value}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {exam.eligibility_class || exam.eligibility_year || exam.eligibility_category ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Eligibility Criteria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {exam.eligibility_class && (
                    <div>
                      <p className="text-sm text-muted-foreground">Class</p>
                      <p className="font-medium">{exam.eligibility_class}</p>
                    </div>
                  )}
                  {exam.eligibility_year && (
                    <div>
                      <p className="text-sm text-muted-foreground">Year</p>
                      <p className="font-medium">{exam.eligibility_year}</p>
                    </div>
                  )}
                  {exam.eligibility_category && (
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium">{exam.eligibility_category}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {exam.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{exam.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {exam.instructions && (
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
              <CardDescription>Instructions shown to students before the exam</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{exam.instructions}</p>
            </CardContent>
          </Card>
        )}

        {/* Proctoring Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Proctoring & Violations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Camera Proctoring</p>
                <p className="font-medium">{exam.proctoring_enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Max Violations</p>
                <p className="font-medium">{exam.max_violations || 3}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Auto-Submit on Violations</p>
                <p className="font-medium">{exam.auto_submit_on_violations !== false ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button asChild variant="outline">
              <Link to="/admin/questions">
                <BookOpen className="w-4 h-4 mr-2" />
                Manage Questions
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/registrations">
                <Users className="w-4 h-4 mr-2" />
                View Registrations
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/admin/exams/${id}/sessions`}>
                <MonitorPlay className="w-4 h-4 mr-2" />
                Manage Sessions
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/admin/exams/${id}/monitoring`}>
                <Video className="w-4 h-4 mr-2" />
                Live Monitoring
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default ExamDetail;
