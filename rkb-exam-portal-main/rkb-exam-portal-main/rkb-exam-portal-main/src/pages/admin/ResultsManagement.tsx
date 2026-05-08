import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Calendar, Users, CheckCircle, Award, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ExamResult {
  id: string;
  exam_name: string;
  exam_code: string;
  exam_date: string;
  status: string;
  results_published: boolean;
  results_published_at: string | null;
  total_marks: number;
  passing_marks: number | null;
  total_students: number;
  students_attempted: number;
  students_passed: number;
  average_score: number | null;
}

export default function ResultsManagement() {
  const [exams, setExams] = useState<ExamResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExamsWithResults = async () => {
      // Fetch all exams
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select('id, exam_name, exam_code, exam_date, status, results_published, results_published_at, total_marks, passing_marks')
        .order('exam_date', { ascending: false });

      if (examsError) {
        console.error('Error fetching exams:', examsError);
        setIsLoading(false);
        return;
      }

      // Fetch result statistics for each exam
      const examResults = await Promise.all(
        (examsData || []).map(async (exam) => {
          // Get registration count
          const { count: totalStudents } = await supabase
            .from('registrations')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id)
            .eq('approval_status', 'approved');

          // Get results statistics
          const { data: results } = await supabase
            .from('results')
            .select('obtained_marks, is_pass')
            .eq('exam_id', exam.id);

          const studentsAttempted = results?.length || 0;
          const studentsPassed = results?.filter(r => r.is_pass).length || 0;
          const averageScore = studentsAttempted > 0
            ? results!.reduce((sum, r) => sum + (r.obtained_marks || 0), 0) / studentsAttempted
            : null;

          return {
            ...exam,
            total_students: totalStudents || 0,
            students_attempted: studentsAttempted,
            students_passed: studentsPassed,
            average_score: averageScore,
          };
        })
      );

      setExams(examResults);
      setIsLoading(false);
    };

    fetchExamsWithResults();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (exam: ExamResult) => {
    if (exam.results_published) {
      return <Badge className="bg-green-600">Published</Badge>;
    }
    if (exam.students_attempted > 0) {
      return <Badge variant="secondary">Ready to Publish</Badge>;
    }
    return <Badge variant="outline">No Results</Badge>;
  };

  return (
    <AdminLayout title="Results Management" description="View and publish examination results">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{exams.length}</p>
                <p className="text-sm text-muted-foreground">Total Exams</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{exams.filter(e => e.results_published).length}</p>
                <p className="text-sm text-muted-foreground">Published</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Award className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {exams.filter(e => e.students_attempted > 0 && !e.results_published).length}
                </p>
                <p className="text-sm text-muted-foreground">Pending Publish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {exams.reduce((sum, e) => sum + e.students_attempted, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Attempts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exams Table */}
      <Card>
        <CardHeader>
          <CardTitle>Examination Results</CardTitle>
          <CardDescription>Manage and publish results for all examinations</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : exams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No examinations found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Registered</TableHead>
                  <TableHead className="text-center">Attempted</TableHead>
                  <TableHead className="text-center">Passed</TableHead>
                  <TableHead className="text-center">Avg Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{exam.exam_name}</p>
                        <p className="text-sm text-muted-foreground">{exam.exam_code}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {formatDate(exam.exam_date)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{exam.total_students}</TableCell>
                    <TableCell className="text-center">{exam.students_attempted}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 font-medium">{exam.students_passed}</span>
                      {exam.students_attempted > 0 && (
                        <span className="text-muted-foreground text-sm ml-1">
                          ({((exam.students_passed / exam.students_attempted) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {exam.average_score !== null ? (
                        <span>{exam.average_score.toFixed(1)} / {exam.total_marks}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(exam)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/admin/results/${exam.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
