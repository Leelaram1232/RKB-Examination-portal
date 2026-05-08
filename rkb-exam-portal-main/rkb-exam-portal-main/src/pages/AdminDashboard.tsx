import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpen, Users, FileText, CheckCircle, Clock, 
  PlusCircle, ArrowRight, BarChart3, Shield 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface DashboardStats {
  totalExams: number;
  activeExams: number;
  totalRegistrations: number;
  pendingApprovals: number;
  approvedRegistrations: number;
  totalStudents: number;
  internalRegistrations: number;
  externalRegistrations: number;
  totalRevenue: number;
  pendingPayments: number;
}

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    internalRegistrations: 0,
    externalRegistrations: 0,
    totalRevenue: 0,
    pendingPayments: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      // Fetch stats from both projects
      const fetchFromClient = async (client: any) => {
        const [
          { count: totalExams },
          { count: activeExams },
          { count: totalRegs },
          { count: pendingAppr },
          { count: approvedRegs },
          { count: totalStuds },
          { count: internalRegs },
          { count: externalRegs },
          { data: revenueData },
          { count: pendingPay }
        ] = await Promise.all([
          client.from('exams').select('*', { count: 'exact', head: true }),
          client.from('exams').select('*', { count: 'exact', head: true }).eq('is_active', true),
          client.from('registrations').select('*', { count: 'exact', head: true }),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved'),
          client.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('student_type', 'internal'),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('student_type', 'external'),
          client.from('registrations').select('payment_amount').eq('payment_status', 'completed'),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('payment_status', 'pending'),
        ]);

        const totalRev = (revenueData as any[])?.reduce((sum, r) => sum + (r.payment_amount || 0), 0) || 0;

        return {
          totalExams: totalExams || 0,
          activeExams: activeExams || 0,
          totalRegistrations: totalRegs || 0,
          pendingApprovals: pendingAppr || 0,
          approvedRegistrations: approvedRegs || 0,
          totalStudents: totalStuds || 0,
          internalRegistrations: internalRegs || 0,
          externalRegistrations: externalRegs || 0,
          totalRevenue: totalRev,
          pendingPayments: pendingPay || 0,
        };
      };

      const internalStats = await fetchFromClient(supabase);

      setStats(internalStats);

      setIsLoading(false);
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
    return (
    <AdminLayout title="Admin Dashboard" description="Overview of your examination system">
      <div className="space-y-8">
        {/* Welcome Section */}
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Welcome, Administrator
          </h2>
          <p className="text-muted-foreground">
            Manage examinations, review registrations, and monitor system statistics
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Button asChild className="h-auto py-4 justify-start px-6" variant="default">
            <Link to="/admin/exams/new" className="flex items-center gap-3">
              <PlusCircle className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <p className="font-semibold">Create New Exam</p>
                <p className="text-xs opacity-80">Add a new examination</p>
              </div>
            </Link>
          </Button>

          <Button asChild className="h-auto py-4 justify-start px-6" variant="secondary">
            <Link to="/admin/registrations" className="flex items-center gap-3">
              <Users className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <p className="font-semibold">Review Registrations</p>
                <p className="text-xs opacity-80">{stats.pendingApprovals} pending approvals</p>
              </div>
            </Link>
          </Button>

          <Button asChild className="h-auto py-4 justify-start px-6" variant="outline">
            <Link to="/admin/exams" className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <p className="font-semibold">Manage Exams</p>
                <p className="text-xs opacity-80">View all examinations</p>
              </div>
            </Link>
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Examinations
              </CardTitle>
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalExams}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeExams} active exams
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Registrations
              </CardTitle>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalRegistrations}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all examinations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Approvals
              </CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Require review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved Registrations
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.approvedRegistrations}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Ready for examination
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Registered Students
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalStudents}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total student accounts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue Generated
              </CardTitle>
              <Shield className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">₹{stats.totalRevenue}</div>
              <p className="text-xs text-muted-foreground mt-1">
                From external registrations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Internal vs External
              </CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <div className="text-3xl font-bold">{stats.internalRegistrations}</div>
                <div className="text-sm text-muted-foreground pb-1">/ {stats.externalRegistrations}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Internal / External students
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Payments
              </CardTitle>
              <Clock className="w-4 h-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{stats.pendingPayments}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting completion
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conversion Rate
              </CardTitle>
              <BarChart3 className="w-4 h-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-indigo-600">
                {stats.externalRegistrations > 0 
                  ? Math.round(((stats.externalRegistrations - stats.pendingPayments) / stats.externalRegistrations) * 100) 
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Paid / Total External Students
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Navigation</CardTitle>
            <CardDescription>Access key management features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                to="/admin/exams"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">Examination Management</p>
                    <p className="text-sm text-muted-foreground truncate">Create, edit, and manage exams</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>

              <Link
                to="/admin/registrations"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">Registration Approvals</p>
                    <p className="text-sm text-muted-foreground truncate">Review and approve applications</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>

              <Link
                to="/admin/questions"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">Question Bank</p>
                    <p className="text-sm text-muted-foreground truncate">Manage exam questions</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>

              <Link
                to="/admin/results"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">Results & Analytics</p>
                    <p className="text-sm text-muted-foreground truncate">View performance reports</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
