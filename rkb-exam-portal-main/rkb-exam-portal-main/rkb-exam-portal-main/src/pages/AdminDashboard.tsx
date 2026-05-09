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
      // Fetch exam counts
      const { count: totalExams } = await supabase
        .from('exams')
        .select('*', { count: 'exact', head: true });

      const { count: activeExams } = await supabase
        .from('exams')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Fetch registration counts
      const { count: totalRegistrations } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true });

      const { count: pendingApprovals } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending');

      const { count: approvedRegistrations } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved');

      // Fetch student count
      const { count: totalStudents } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      setStats({
        totalExams: totalExams || 0,
        activeExams: activeExams || 0,
        totalRegistrations: totalRegistrations || 0,
        pendingApprovals: pendingApprovals || 0,
        approvedRegistrations: approvedRegistrations || 0,
        totalStudents: totalStudents || 0,
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
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="official-header shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-foreground/20 rounded-lg">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-primary-foreground tracking-tight">
                  Admin Dashboard
                </h1>
                <p className="text-xs text-primary-foreground/80">
                  RKB Examination Management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-primary-foreground/80">
                {user?.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Welcome, Administrator
          </h2>
          <p className="text-muted-foreground">
            Manage examinations, review registrations, and monitor system statistics
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Button asChild className="h-auto py-4" variant="default">
            <Link to="/admin/exams/new" className="flex items-center gap-3">
              <PlusCircle className="w-5 h-5" />
              <div className="text-left">
                <p className="font-semibold">Create New Exam</p>
                <p className="text-xs opacity-80">Add a new examination</p>
              </div>
            </Link>
          </Button>

          <Button asChild className="h-auto py-4" variant="secondary">
            <Link to="/admin/registrations" className="flex items-center gap-3">
              <Users className="w-5 h-5" />
              <div className="text-left">
                <p className="font-semibold">Review Registrations</p>
                <p className="text-xs opacity-80">{stats.pendingApprovals} pending approvals</p>
              </div>
            </Link>
          </Button>

          <Button asChild className="h-auto py-4" variant="outline">
            <Link to="/admin/exams" className="flex items-center gap-3">
              <BookOpen className="w-5 h-5" />
              <div className="text-left">
                <p className="font-semibold">Manage Exams</p>
                <p className="text-xs opacity-80">View all examinations</p>
              </div>
            </Link>
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
              <Clock className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">{stats.pendingApprovals}</div>
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
              <CheckCircle className="w-4 h-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">{stats.approvedRegistrations}</div>
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
              <BarChart3 className="w-4 h-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">Active</div>
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
                  <div>
                    <p className="font-medium">Examination Management</p>
                    <p className="text-sm text-muted-foreground">Create, edit, and manage exams</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Link>

              <Link
                to="/admin/registrations"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Registration Approvals</p>
                    <p className="text-sm text-muted-foreground">Review and approve applications</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Link>

              <Link
                to="/admin/questions"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Question Bank</p>
                    <p className="text-sm text-muted-foreground">Manage exam questions</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Link>

              <Link
                to="/admin/results"
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Results & Analytics</p>
                    <p className="text-sm text-muted-foreground">View performance reports</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
