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
import { externalSupabase } from '@/lib/externalSupabase';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface DashboardStats {
  totalExams: number;
  activeExams: number;
  totalRegistrations: number;
  pendingApprovals: number;
  approvedRegistrations: number;
  totalStudents: number;
}

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalExams: 0,
    activeExams: 0,
    totalRegistrations: 0,
    pendingApprovals: 0,
    approvedRegistrations: 0,
    totalStudents: 0,
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
          { count: totalStuds }
        ] = await Promise.all([
          client.from('exams').select('*', { count: 'exact', head: true }),
          client.from('exams').select('*', { count: 'exact', head: true }).eq('is_active', true),
          client.from('registrations').select('*', { count: 'exact', head: true }),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
          client.from('registrations').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved'),
          client.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
        ]);

        return {
          totalExams: totalExams || 0,
          activeExams: activeExams || 0,
          totalRegistrations: totalRegs || 0,
          pendingApprovals: pendingAppr || 0,
          approvedRegistrations: approvedRegs || 0,
          totalStudents: totalStuds || 0,
        };
      };

      const internalStats = await fetchFromClient(supabase);
      const externalStats = await fetchFromClient(externalSupabase);

      setStats({
        totalExams: Math.max(internalStats.totalExams, externalStats.totalExams),
        activeExams: Math.max(internalStats.activeExams, externalStats.activeExams),
        totalRegistrations: Math.max(internalStats.totalRegistrations, externalStats.totalRegistrations),
        pendingApprovals: Math.max(internalStats.pendingApprovals, externalStats.pendingApprovals),
        approvedRegistrations: Math.max(internalStats.approvedRegistrations, externalStats.approvedRegistrations),
        totalStudents: Math.max(internalStats.totalStudents, externalStats.totalStudents),
      });

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
                System Status
              </CardTitle>
              <BarChart3 className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">Active</div>
              <p className="text-xs text-muted-foreground mt-1">
                All systems operational
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
