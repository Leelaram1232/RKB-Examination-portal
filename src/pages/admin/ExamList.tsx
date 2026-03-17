import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit, Trash2, Eye, Calendar, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  total_marks: number;
  status: string;
  is_active: boolean;
  registration_start: string;
  registration_end: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  registration_open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  registration_closed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const ExamList = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchExams = async () => {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch exams');
      console.error(error);
    } else {
      setExams(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('exams').delete().eq('id', id);
    
    if (error) {
      toast.error('Failed to delete exam');
      console.error(error);
    } else {
      toast.success('Exam deleted successfully');
      fetchExams();
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (isLoading) {
    return (
      <AdminLayout title="Examinations" description="Manage all examinations">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Examinations" description="Manage all examinations">
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-muted-foreground">
              {exams.length} examination{exams.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/exams/new">
              <Plus className="w-4 h-4 mr-2" />
              Create New Exam
            </Link>
          </Button>
        </div>

        {/* Exams Table */}
        {exams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No Examinations Yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by creating your first examination.
              </p>
              <Button asChild>
                <Link to="/admin/exams/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Exam
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Examinations</CardTitle>
              <CardDescription>View and manage all examination records</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exam Details</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Marks</TableHead>
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
                          <div>
                            <p className="text-sm">{format(new Date(exam.exam_date), 'MMM dd, yyyy')}</p>
                            <p className="text-xs text-muted-foreground">{exam.exam_time}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{exam.duration_minutes} min</span>
                        </div>
                      </TableCell>
                      <TableCell>{exam.total_marks}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[exam.status] || 'bg-muted'}>
                          {formatStatus(exam.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/admin/exams/${exam.id}`}>
                              <Eye className="w-4 h-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/admin/exams/${exam.id}/edit`}>
                              <Edit className="w-4 h-4" />
                            </Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Examination</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{exam.exam_name}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(exam.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default ExamList;
