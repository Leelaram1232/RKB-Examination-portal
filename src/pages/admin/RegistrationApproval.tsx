import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Eye, Search, User, Power, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { externalSupabase as supabase, invokeExternalFunction } from '@/lib/externalSupabase';
import { supabase as lovableSupabase } from '@/integrations/supabase/client';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';

// Interface for registration with profile data joined
interface Registration {
  id: string;
  exam_id: string | null;
  student_id: string | null;
  registration_number: string | null;
  created_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_remarks: string | null;
  approved_at: string | null;
  exam_login_enabled: boolean;
  exam_password: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  transaction_id: string | null;
  photo_url: string | null;
  signature_url: string | null;
  cashfree_order_id: string | null;
  // Student details from profiles table (joined)
  full_name: string;
  email: string;
  mobile: string | null;
  gender: string | null;
  date_of_birth: string | null;
  class: string | null;
  school_name: string | null;
  board: string | null;
  academic_year: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  percentage: number | null;
  // Exam details (joined)
  exams: {
    exam_name: string;
    exam_code: string;
    exam_date: string;
    notify_on_approval: boolean;
  } | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const paymentStatusColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  paid: 'default',
  pending: 'secondary',
  failed: 'destructive',
};

const RegistrationApproval = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [examFilter, setExamFilter] = useState<string>('all');
  const [exams, setExams] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkActionDialog, setShowBulkActionDialog] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'reject'>('approve');

  const fetchRegistrations = async () => {
    try {
      // Fetch exams for filter dropdown and for mapping exam details
      const { data: examsData } = await supabase
        .from('exams')
        .select('id, exam_name, exam_code, exam_date, notify_on_approval')
        .order('exam_name');

      if (examsData) {
        setExams(examsData);
      }

      // Create exam lookup map
      const examMap = new Map(
        (examsData || []).map((exam: any) => [exam.id, exam])
      );

      // Fetch registrations WITHOUT join to avoid schema cache issues
      const { data: registrationsData, error: regError } = await supabase
        .from('registrations')
        .select(`
          id,
          exam_id,
          student_id,
          registration_number,
          created_at,
          approval_status,
          approval_remarks,
          approved_at,
          exam_login_enabled,
          exam_password,
          payment_status,
          payment_amount,
          transaction_id,
          photo_url,
          signature_url,
          cashfree_order_id
        `)
        .order('created_at', { ascending: false });

      if (regError) {
        toast.error(`Failed to fetch registrations: ${regError.message}`);
        console.error('[RegistrationApproval] registrations fetch error:', regError);
        setIsLoading(false);
        return;
      }

      // Get unique student IDs to fetch profiles separately
      const studentIds = [...new Set((registrationsData || []).map(r => r.student_id).filter(Boolean))];
      
      // Fetch profiles separately
      let profileMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email, mobile, gender, date_of_birth, class, school_name, board, academic_year, address, city, state, pincode, percentage')
          .in('id', studentIds);

        if (profilesError) {
          console.error('[RegistrationApproval] profiles fetch error:', profilesError);
          // Continue without profile data rather than failing completely
        } else {
          profileMap = new Map((profilesData || []).map(p => [p.id, p]));
        }
      }

      // Map exam details and profile data to each registration
      const registrationsWithDetails = (registrationsData || []).map((reg: any) => {
        const profile = profileMap.get(reg.student_id) || {};
        return {
          ...reg,
          // Flatten profile fields to root level
          full_name: profile.full_name || 'N/A',
          email: profile.email || 'N/A',
          mobile: profile.mobile,
          gender: profile.gender,
          date_of_birth: profile.date_of_birth,
          class: profile.class,
          school_name: profile.school_name,
          board: profile.board,
          academic_year: profile.academic_year,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          pincode: profile.pincode,
          percentage: profile.percentage,
          // Map exam details
          exams: reg.exam_id ? examMap.get(reg.exam_id) || null : null,
        };
      });

      setRegistrations(registrationsWithDetails as Registration[]);
    } catch (err) {
      console.error('[RegistrationApproval] unexpected error:', err);
      toast.error('Failed to load registrations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const handleAction = async () => {
    if (!selectedRegistration) return;
    
    setIsProcessing(true);
    try {
      const updateData: Record<string, unknown> = {
        approval_status: actionType === 'approve' ? 'approved' : 'rejected',
        approval_remarks: remarks || null,
        approved_at: actionType === 'approve' ? new Date().toISOString() : null,
      };

      if (actionType === 'approve') {
        updateData.exam_login_enabled = true;
        // Generate password from DOB if available
        if (selectedRegistration.date_of_birth) {
          const dob = new Date(selectedRegistration.date_of_birth);
          updateData.exam_password = format(dob, 'ddMMyy');
        }
      }

      const { error } = await supabase
        .from('registrations')
        .update(updateData)
        .eq('id', selectedRegistration.id);

      if (error) {
        toast.error(`Failed to ${actionType} registration`);
        console.error(error);
        return;
      }

      const shouldNotify = selectedRegistration.exams?.notify_on_approval ?? true;

      if (actionType === 'approve') {
        toast.success('Registration approved');

        // Fire email notification via INTERNAL Supabase (Lovable) with a timeout so UI never gets stuck.
        if (shouldNotify) {
          console.log(
            `[APPROVAL] Triggering approval email for ${selectedRegistration.full_name} (${selectedRegistration.id})`
          );

          const emailPromise = lovableSupabase.functions.invoke('finalize-registration', {
            body: {
              type: 'registration_approved',
              registration_id: selectedRegistration.id,
            },
          });

          const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error('Email send timed out') }), 8000)
          );

          const emailResp = await Promise.race([emailPromise, timeoutPromise]);

          if ((emailResp as any)?.error) {
            console.error('[APPROVAL] Email failed:', (emailResp as any).error);
            toast.warning('Approved, but email notification failed');
          } else {
            toast.success('Approval email sent');
          }
        }
      } else {
        toast.success('Registration rejected');
      }

      setShowActionDialog(false);
      setRemarks('');
      fetchRegistrations();
    } catch (err) {
      console.error('[RegistrationApproval] handleAction error:', err);
      toast.error('Something went wrong while processing this action');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAction = async () => {
    if (selectedIds.size === 0) return;
    
    setIsProcessing(true);

    const updateData: Record<string, unknown> = {
      approval_status: bulkActionType === 'approve' ? 'approved' : 'rejected',
      approved_at: bulkActionType === 'approve' ? new Date().toISOString() : null,
    };

    if (bulkActionType === 'approve') {
      updateData.exam_login_enabled = true;
    }

    const { error } = await supabase
      .from('registrations')
      .update(updateData)
      .in('id', Array.from(selectedIds));

    if (error) {
      setIsProcessing(false);
      toast.error(`Failed to ${bulkActionType} registrations`);
      console.error(error);
      return;
    }

    // Send approval emails for bulk approve if enabled for the exam
    if (bulkActionType === 'approve') {
      console.log('[BULK_APPROVAL] Sending emails for selected registrations');
      
      const emailPromises = Array.from(selectedIds).map(async (regId) => {
        const registration = registrations.find(r => r.id === regId);
        const shouldNotify = registration?.exams?.notify_on_approval ?? true;
        
        if (!shouldNotify) return { regId, success: true, skipped: true };
        
        try {
          const { data, error } = await invokeExternalFunction('finalize-registration', {
            type: 'registration_approved',
            registration_id: regId,
          });
          return { regId, success: !error, error, skipped: false };
        } catch (err) {
          return { regId, success: false, error: err, skipped: false };
        }
      });

      const results = await Promise.all(emailPromises);
      const successCount = results.filter(r => r.success).length;
      const skippedCount = results.filter(r => (r as any).skipped).length;
      console.log('[BULK_APPROVAL] Results:', successCount, 'sent/skipped,', results.length, 'total');
      
      if (successCount < results.length) {
        toast.warning(`${selectedIds.size} approved, ${successCount - skippedCount} emails sent`);
      } else {
        const message = skippedCount > 0 
          ? `${selectedIds.size} approved (${skippedCount} emails disabled by exam settings)`
          : `${selectedIds.size} registration(s) approved and emails sent!`;
        toast.success(message);
      }
    } else {
      toast.success(`${selectedIds.size} registration(s) rejected`);
    }

    setIsProcessing(false);
    setShowBulkActionDialog(false);
    setSelectedIds(new Set());
    fetchRegistrations();
  };

  const toggleExamLogin = async (registration: Registration) => {
    const newStatus = !registration.exam_login_enabled;
    
    const { error } = await supabase
      .from('registrations')
      .update({ exam_login_enabled: newStatus })
      .eq('id', registration.id);

    if (error) {
      toast.error('Failed to toggle exam login');
      console.error(error);
    } else {
      toast.success(`Exam login ${newStatus ? 'enabled' : 'disabled'} for ${registration.full_name}`);
      fetchRegistrations();
    }
  };

  const regeneratePassword = async (registration: Registration) => {
    if (!registration.date_of_birth) {
      toast.error('Date of birth not available for this student');
      return;
    }

    const dob = new Date(registration.date_of_birth);
    const newPassword = format(dob, 'ddMMyy');

    const { error } = await supabase
      .from('registrations')
      .update({ exam_password: newPassword })
      .eq('id', registration.id);

    if (error) {
      toast.error('Failed to regenerate password');
      console.error(error);
    } else {
      toast.success(`Password regenerated: ${newPassword}`);
      fetchRegistrations();
    }
  };

  const openActionDialog = (registration: Registration, action: 'approve' | 'reject') => {
    setSelectedRegistration(registration);
    setActionType(action);
    setRemarks('');
    setShowActionDialog(true);
  };

  const toggleSelectAll = () => {
    const pendingRegs = filteredRegistrations.filter(r => r.approval_status === 'pending');
    if (selectedIds.size === pendingRegs.length && pendingRegs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRegs.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Updated filter to use direct fields instead of profiles
  const filteredRegistrations = registrations.filter((reg) => {
    const matchesSearch = 
      reg.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.registration_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || reg.approval_status === statusFilter;
    const matchesExam = examFilter === 'all' || reg.exam_id === examFilter;
    
    return matchesSearch && matchesStatus && matchesExam;
  });

  const pendingCount = registrations.filter(r => r.approval_status === 'pending').length;
  const approvedCount = registrations.filter(r => r.approval_status === 'approved').length;
  const rejectedCount = registrations.filter(r => r.approval_status === 'rejected').length;
  const pendingFiltered = filteredRegistrations.filter(r => r.approval_status === 'pending');

  if (isLoading) {
    return (
      <AdminLayout title="Registration Approvals" description="Review and approve student registrations">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Registration Approvals" description="Review and approve student registrations">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{approvedCount}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-3xl font-bold text-red-600">{rejectedCount}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or registration number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={examFilter} onValueChange={setExamFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by exam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exams</SelectItem>
                  {exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.exam_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {selectedIds.size} registration(s) selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setBulkActionType('reject');
                      setShowBulkActionDialog(true);
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject Selected
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setBulkActionType('approve');
                      setShowBulkActionDialog(true);
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Registrations Table */}
        <Card>
          <CardHeader>
            <CardTitle>Registration Applications</CardTitle>
            <CardDescription>
              {filteredRegistrations.length} registration{filteredRegistrations.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No Registrations Found</h3>
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' || examFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No student registrations yet'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={pendingFiltered.length > 0 && selectedIds.size === pendingFiltered.length}
                        onCheckedChange={toggleSelectAll}
                        disabled={pendingFiltered.length === 0}
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Reg. Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegistrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell>
                        {reg.approval_status === 'pending' && (
                          <Checkbox
                            checked={selectedIds.has(reg.id)}
                            onCheckedChange={() => toggleSelect(reg.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{reg.full_name || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">{reg.email || 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{reg.exams?.exam_name || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">{reg.exams?.exam_code || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {reg.registration_number || 'Pending'}
                        </code>
                      </TableCell>
                      <TableCell>
                        {format(new Date(reg.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentStatusColors[reg.payment_status || ''] || 'outline'}>
                          {reg.payment_status || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[reg.approval_status]}>
                          {reg.approval_status.charAt(0).toUpperCase() + reg.approval_status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {reg.approval_status === 'approved' && (
                          <Badge variant={reg.exam_login_enabled ? 'default' : 'secondary'}>
                            {reg.exam_login_enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedRegistration(reg);
                                  setShowDetailsDialog(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Details</TooltipContent>
                          </Tooltip>

                          {reg.approval_status === 'approved' && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleExamLogin(reg)}
                                    className={reg.exam_login_enabled ? 'text-green-600' : 'text-muted-foreground'}
                                  >
                                    <Power className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {reg.exam_login_enabled ? 'Disable' : 'Enable'} Exam Login
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => regeneratePassword(reg)}
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Regenerate Password</TooltipContent>
                              </Tooltip>
                            </>
                          )}

                          {reg.approval_status === 'pending' && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => openActionDialog(reg, 'approve')}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => openActionDialog(reg, 'reject')}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reject</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registration Details</DialogTitle>
              <DialogDescription>
                Complete registration information
              </DialogDescription>
            </DialogHeader>
            {selectedRegistration && (
              <div className="space-y-6">
                {/* Photo & Signature Preview */}
                {(selectedRegistration.photo_url || selectedRegistration.signature_url) && (
                  <div className="flex gap-6">
                    {selectedRegistration.photo_url && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Photo</p>
                        <img 
                          src={selectedRegistration.photo_url} 
                          alt="Student photo" 
                          className="w-24 h-24 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {selectedRegistration.signature_url && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Signature</p>
                        <img 
                          src={selectedRegistration.signature_url} 
                          alt="Signature" 
                          className="h-16 object-contain rounded border bg-white p-1"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Personal Details */}
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Personal Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Full Name</p>
                      <p className="font-medium">{selectedRegistration.full_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedRegistration.email || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mobile</p>
                      <p className="font-medium">{selectedRegistration.mobile || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Gender</p>
                      <p className="font-medium capitalize">{selectedRegistration.gender || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">
                        {selectedRegistration.date_of_birth 
                          ? format(new Date(selectedRegistration.date_of_birth), 'PPP')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                <hr />

                {/* Address Details */}
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Address</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{selectedRegistration.address || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{selectedRegistration.city || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">State</p>
                      <p className="font-medium">{selectedRegistration.state || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pincode</p>
                      <p className="font-medium">{selectedRegistration.pincode || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <hr />

                {/* Academic Details */}
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Academic Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Class</p>
                      <p className="font-medium">{selectedRegistration.class || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Board</p>
                      <p className="font-medium">{selectedRegistration.board || 'N/A'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">School/College</p>
                      <p className="font-medium">{selectedRegistration.school_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Academic Year</p>
                      <p className="font-medium">{selectedRegistration.academic_year || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Percentage</p>
                      <p className="font-medium">{selectedRegistration.percentage ? `${selectedRegistration.percentage}%` : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <hr />

                {/* Payment Details */}
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Payment Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={paymentStatusColors[selectedRegistration.payment_status || ''] || 'outline'}>
                        {selectedRegistration.payment_status || 'N/A'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Amount</p>
                      <p className="font-medium">₹{selectedRegistration.payment_amount || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Transaction ID</p>
                      <p className="font-medium">{selectedRegistration.transaction_id || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Order ID</p>
                      <p className="font-medium">{selectedRegistration.cashfree_order_id || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <hr />

                {/* Exam & Registration Details */}
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Exam & Registration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Exam</p>
                      <p className="font-medium">{selectedRegistration.exams?.exam_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Exam Date</p>
                      <p className="font-medium">
                        {selectedRegistration.exams?.exam_date 
                          ? format(new Date(selectedRegistration.exams.exam_date), 'PPP')
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Registration Number</p>
                      <code className="font-medium bg-muted px-2 py-1 rounded">
                        {selectedRegistration.registration_number || 'Pending'}
                      </code>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge className={statusColors[selectedRegistration.approval_status]}>
                        {selectedRegistration.approval_status.charAt(0).toUpperCase() + 
                         selectedRegistration.approval_status.slice(1)}
                      </Badge>
                    </div>
                    {selectedRegistration.approval_status === 'approved' && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Exam Login</p>
                          <Badge variant={selectedRegistration.exam_login_enabled ? 'default' : 'secondary'}>
                            {selectedRegistration.exam_login_enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Password</p>
                          <code className="font-medium bg-muted px-2 py-1 rounded">
                            {selectedRegistration.exam_password || 'Not Set'}
                          </code>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectedRegistration.approval_remarks && (
                  <>
                    <hr />
                    <div>
                      <p className="text-sm text-muted-foreground">Remarks</p>
                      <p className="font-medium">{selectedRegistration.approval_remarks}</p>
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Close
              </Button>
              {selectedRegistration?.approval_status === 'approved' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleExamLogin(selectedRegistration);
                      setShowDetailsDialog(false);
                    }}
                  >
                    <Power className="w-4 h-4 mr-2" />
                    {selectedRegistration.exam_login_enabled ? 'Disable' : 'Enable'} Login
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      regeneratePassword(selectedRegistration);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate Password
                  </Button>
                </div>
              )}
              {selectedRegistration?.approval_status === 'pending' && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowDetailsDialog(false);
                      openActionDialog(selectedRegistration, 'reject');
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      setShowDetailsDialog(false);
                      openActionDialog(selectedRegistration, 'approve');
                    }}
                  >
                    Approve
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action Dialog */}
        <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === 'approve' ? 'Approve Registration' : 'Reject Registration'}
              </DialogTitle>
              <DialogDescription>
                {actionType === 'approve'
                  ? 'This will approve the student\'s registration and enable exam access.'
                  : 'This will reject the student\'s registration application.'}
              </DialogDescription>
            </DialogHeader>
            {selectedRegistration && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{selectedRegistration.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedRegistration.exams?.exam_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Remarks (Optional)</label>
                  <Textarea
                    placeholder={actionType === 'approve' 
                      ? 'Add any notes for the approval...'
                      : 'Provide a reason for rejection...'}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowActionDialog(false)}>
                Cancel
              </Button>
              <Button
                variant={actionType === 'approve' ? 'default' : 'destructive'}
                onClick={handleAction}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Action Dialog */}
        <Dialog open={showBulkActionDialog} onOpenChange={setShowBulkActionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {bulkActionType === 'approve' ? 'Bulk Approve' : 'Bulk Reject'} Registrations
              </DialogTitle>
              <DialogDescription>
                {bulkActionType === 'approve'
                  ? `This will approve ${selectedIds.size} registration(s) and enable exam access for all.`
                  : `This will reject ${selectedIds.size} registration(s).`}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedIds.size} registration(s) selected</p>
                <p className="text-sm text-muted-foreground">
                  This action will be applied to all selected registrations.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkActionDialog(false)}>
                Cancel
              </Button>
              <Button
                variant={bulkActionType === 'approve' ? 'default' : 'destructive'}
                onClick={handleBulkAction}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : bulkActionType === 'approve' ? 'Approve All' : 'Reject All'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default RegistrationApproval;
