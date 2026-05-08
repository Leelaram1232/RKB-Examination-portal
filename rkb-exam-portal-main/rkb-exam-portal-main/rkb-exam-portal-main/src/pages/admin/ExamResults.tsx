import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Printer, RefreshCw, Trophy, Loader2, Eye, Download, FileDown, Trash2, Users, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeExternalFunction } from '@/lib/externalSupabase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SectionScore {
  correct: number;
  wrong: number;
  unanswered: number;
  marks: number;
  total_marks: number;
  total_questions: number;
}

interface StudentResult {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  registration_number: string;
  email: string;
  obtained_marks: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  is_pass: boolean;
  section_wise_scores: Record<string, SectionScore> | null;
  calculated_at: string;
  rank: number | null;
  percentile: number | null;
  photo_url?: string | null;
  signature_url?: string | null;
}

interface ExamInfo {
  id: string;
  exam_name: string;
  exam_code: string;
  exam_date: string;
  total_marks: number;
  passing_marks: number | null;
  results_published: boolean;
  results_published_at: string | null;
  duration_minutes: number;
  negative_marking: boolean;
  marks_per_question: number | null;
  marks_per_wrong: number | null;
}

export default function ExamResults() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sections, setSections] = useState<string[]>([]);
  const [isRecalculating, setIsRecalculating] = useState<string | null>(null);
  const [isCalculatingRanks, setIsCalculatingRanks] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!examId) return;

      try {
        // Fetch exam info
        const { data: exam, error: examError } = await supabase
          .from('exams')
          .select('id, exam_name, exam_code, exam_date, total_marks, passing_marks, results_published, results_published_at, duration_minutes, negative_marking, marks_per_question, marks_per_wrong')
          .eq('id', examId)
          .maybeSingle();

        if (examError) {
          console.error('Error fetching exam:', examError);
          toast.error('Failed to load exam');
          navigate('/admin/results');
          return;
        }

        if (!exam) {
          toast.error('Exam not found');
          navigate('/admin/results');
          return;
        }

        setExamInfo(exam);

        // Fetch results
        const { data: resultsData, error: resultsError } = await supabase
          .from('results')
          .select('*')
          .eq('exam_id', examId)
          .order('rank', { ascending: true, nullsFirst: false });

        console.log('Results data:', resultsData, 'Error:', resultsError);

        if (resultsError) {
          console.error('Error fetching results:', resultsError);
          toast.error('Failed to load results');
          setIsLoading(false);
          return;
        }

        if (!resultsData || resultsData.length === 0) {
          console.log('No results found for exam');
          setResults([]);
          setIsLoading(false);
          return;
        }

        // Fetch all student IDs at once
        const studentIds = [...new Set(resultsData.map(r => r.student_id))];
        
        // Fetch profiles for all students
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);

        console.log('Profiles data:', profilesData, 'Error:', profilesError);

        // Fetch registrations for all students (include photo_url and signature_url)
        const { data: registrationsData, error: registrationsError } = await supabase
          .from('registrations')
          .select('student_id, registration_number, photo_url, signature_url')
          .eq('exam_id', examId)
          .in('student_id', studentIds);

        console.log('Registrations data:', registrationsData, 'Error:', registrationsError);

        // Create lookup maps
        const profilesMap = new Map(
          (profilesData || []).map(p => [p.id, p])
        );
        const registrationsMap = new Map(
          (registrationsData || []).map(r => [r.student_id, r])
        );

        // Map results with student info
        const studentResults = resultsData.map(result => {
          const profile = profilesMap.get(result.student_id);
          const registration = registrationsMap.get(result.student_id);

          return {
            id: result.id,
            session_id: result.session_id,
            student_id: result.student_id,
            student_name: profile?.full_name || 'Unknown',
            email: profile?.email || '',
            registration_number: registration?.registration_number || 'N/A',
            photo_url: registration?.photo_url || null,
            signature_url: registration?.signature_url || null,
            obtained_marks: result.obtained_marks,
            correct_count: result.correct_count,
            wrong_count: result.wrong_count,
            unanswered_count: result.unanswered_count,
            is_pass: result.is_pass,
            section_wise_scores: result.section_wise_scores as unknown as Record<string, SectionScore> | null,
            calculated_at: result.calculated_at,
            rank: result.rank,
            percentile: result.percentile,
          };
        });

        // Extract sections from first result with section_wise_scores
        const firstWithSections = studentResults.find(r => r.section_wise_scores);
        if (firstWithSections?.section_wise_scores) {
          setSections(Object.keys(firstWithSections.section_wise_scores));
        }

        setResults(studentResults);
      } catch (error) {
        console.error('Unexpected error:', error);
        toast.error('An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [examId, navigate]);

  const handlePublishResults = async () => {
    if (!examId) return;

    setIsPublishing(true);

    const { error } = await supabase
      .from('exams')
      .update({
        results_published: true,
        results_published_at: new Date().toISOString(),
      })
      .eq('id', examId);

    setIsPublishing(false);
    setShowPublishDialog(false);

    if (error) {
      toast.error('Failed to publish results');
      return;
    }

    toast.success('Results published successfully!');
    setExamInfo((prev) => prev ? { ...prev, results_published: true, results_published_at: new Date().toISOString() } : null);

    // Trigger email notifications in background
    console.log('[Results] Triggering student email notifications...');
    invokeExternalFunction('send-result-emails', { exam_id: examId })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Results] Failed to send emails:', error);
          toast.error('Results published, but failed to trigger email notifications.');
        } else {
          console.log('[Results] Email notifications triggered:', data);
          toast.info('Email notifications are being sent to all registered students.');
        }
      })
      .catch(err => {
        console.error('[Results] Unexpected error triggering emails:', err);
      });
  };

  const handleUnpublishResults = async () => {
    if (!examId) return;

    setIsPublishing(true);

    const { error } = await supabase
      .from('exams')
      .update({
        results_published: false,
        results_published_at: null,
      })
      .eq('id', examId);

    setIsPublishing(false);
    setShowUnpublishDialog(false);

    if (error) {
      toast.error('Failed to unpublish results');
      return;
    }

    toast.success('Results unpublished. You can make changes and publish again.');
    setExamInfo((prev) =>
      prev ? { ...prev, results_published: false, results_published_at: null } : null
    );
  };

  const handleRecalculate = async (sessionId: string) => {
    console.warn(`[DEBUG] Recalculating session: ${sessionId}`);
    if (!sessionId) {
      toast.error('Session ID is missing for this result');
      return;
    }
    
    setIsRecalculating(sessionId);
    
    try {
      console.warn(`[DEBUG] Invoking recalculate-result for ${sessionId}...`);
      const { data: result, error } = await invokeExternalFunction<any>('recalculate-result', { session_id: sessionId });

      if (error) {
        throw error;
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to recalculate');
      }

      toast.success('Result recalculated successfully');
      window.location.reload();
    } catch (error: any) {
      console.error('Recalculate error:', error);
      toast.error(error.message || 'Failed to recalculate result');
    } finally {
      setIsRecalculating(null);
    }
  };

  const handleCalculateRankings = async () => {
    if (!examId) return;
    
    setIsCalculatingRanks(true);
    
    try {
      const { data: result, error } = await invokeExternalFunction<any>('calculate-rankings', { exam_id: examId });

      if (error) {
        throw error;
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to calculate rankings');
      }

      toast.success(`Rankings calculated for ${result.ranks_updated} students`);
      window.location.reload();
    } catch (error: any) {
      console.error('Calculate rankings error:', error);
      toast.error(error.message || 'Failed to calculate rankings');
    } finally {
      setIsCalculatingRanks(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedStudents.size === results.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(results.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedStudents(newSelected);
  };

  // Delete selected students
  const handleDeleteSelected = async () => {
    if (selectedStudents.size === 0) return;
    
    setIsDeleting(true);
    
    try {
      // Get session IDs for selected results
      const selectedResults = results.filter(r => selectedStudents.has(r.id));
      const sessionIds = selectedResults.map(r => r.session_id);
      
      // Delete results
      const { error: resultsError } = await supabase
        .from('results')
        .delete()
        .in('id', Array.from(selectedStudents));
      
      if (resultsError) throw resultsError;
      
      // Delete student answers for those sessions
      const { error: answersError } = await supabase
        .from('student_answers')
        .delete()
        .in('session_id', sessionIds);
      
      if (answersError) console.warn('Failed to delete some student answers:', answersError);
      
      toast.success(`Deleted ${selectedStudents.size} student results`);
      setSelectedStudents(new Set());
      setResults(results.filter(r => !selectedStudents.has(r.id)));
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || 'Failed to delete selected results');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Generate student list PDF (all students with their details)
  const generateStudentListPDF = async () => {
    if (!examInfo || results.length === 0) return;

    setIsGeneratingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const primaryColor: [number, number, number] = [25, 118, 210];
      const darkText: [number, number, number] = [33, 33, 33];
      const grayText: [number, number, number] = [117, 117, 117];

      // Header
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('STUDENT RESULTS LIST', pageWidth / 2, 12, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`${examInfo.exam_name} (${examInfo.exam_code})`, pageWidth / 2, 19, { align: 'center' });

      // Summary
      doc.setTextColor(...darkText);
      doc.setFontSize(9);
      doc.text(`Total Students: ${results.length}  |  Passed: ${results.filter(r => r.is_pass).length}  |  Failed: ${results.filter(r => !r.is_pass).length}`, 10, 32);

      // Table
      const tableData = results.map((result, index) => [
        result.rank || index + 1,
        result.registration_number,
        result.student_name.toUpperCase(),
        result.email,
        `${result.obtained_marks}/${examInfo.total_marks}`,
        result.is_pass ? 'PASS' : 'FAIL'
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Rank', 'Reg. No.', 'Name', 'Email', 'Marks', 'Status']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { cellWidth: 25 },
          2: { cellWidth: 40 },
          3: { cellWidth: 50 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'center', cellWidth: 15 },
        },
      });

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...grayText);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 10, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
        doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 10, doc.internal.pageSize.getHeight() - 5);
      }

      doc.save(`${examInfo.exam_code}_Student_List_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Student list PDF generated!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const generateProfessionalPDF = async () => {
    if (!examInfo || results.length === 0) return;

    setIsGeneratingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Colors
      const primaryColor: [number, number, number] = [25, 118, 210]; // Blue
      const secondaryColor: [number, number, number] = [33, 150, 243];
      const successColor: [number, number, number] = [76, 175, 80];
      const dangerColor: [number, number, number] = [244, 67, 54];
      const darkText: [number, number, number] = [33, 33, 33];
      const grayText: [number, number, number] = [117, 117, 117];

      // Header Background
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 35, 'F');

      // Header gradient effect
      doc.setFillColor(...secondaryColor);
      doc.rect(0, 30, pageWidth, 5, 'F');

      // Logo placeholder / Organization Name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('RKB EDUCATION MANAGEMENT SYSTEM', 10, 10);

      // Main Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('EXAMINATION RESULT SCOREBOARD', pageWidth / 2, 18, { align: 'center' });

      // Exam Details
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`${examInfo.exam_name} (${examInfo.exam_code})`, pageWidth / 2, 27, { align: 'center' });

      // Date on right
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 10, 10, { align: 'right' });

      // Exam Info Box
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(10, 40, pageWidth - 20, 18, 2, 2, 'F');
      
      doc.setTextColor(...darkText);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      const infoY = 47;
      const colWidth = (pageWidth - 20) / 6;
      
      const examDetails = [
        { label: 'Exam Date', value: formatDate(examInfo.exam_date) },
        { label: 'Duration', value: `${examInfo.duration_minutes} mins` },
        { label: 'Total Marks', value: examInfo.total_marks.toString() },
        { label: 'Passing Marks', value: examInfo.passing_marks?.toString() || 'N/A' },
        { label: 'Total Candidates', value: results.length.toString() },
        { label: 'Qualified', value: results.filter(r => r.is_pass).length.toString() },
      ];

      examDetails.forEach((detail, index) => {
        const x = 15 + (index * colWidth);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayText);
        doc.text(detail.label, x, infoY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkText);
        doc.text(detail.value, x, infoY + 6);
      });

      // Statistics Row
      const statsY = 62;
      doc.setFillColor(232, 245, 233);
      doc.roundedRect(10, statsY, (pageWidth - 25) / 3, 12, 2, 2, 'F');
      doc.setFillColor(255, 243, 224);
      doc.roundedRect(10 + (pageWidth - 25) / 3 + 2.5, statsY, (pageWidth - 25) / 3, 12, 2, 2, 'F');
      doc.setFillColor(227, 242, 253);
      doc.roundedRect(10 + 2 * ((pageWidth - 25) / 3 + 2.5), statsY, (pageWidth - 25) / 3, 12, 2, 2, 'F');

      const avgScore = results.length > 0 ? (results.reduce((sum, r) => sum + r.obtained_marks, 0) / results.length).toFixed(1) : '0';
      const passPercent = results.length > 0 ? ((results.filter(r => r.is_pass).length / results.length) * 100).toFixed(1) : '0';
      const topScore = results.length > 0 ? Math.max(...results.map(r => r.obtained_marks)) : 0;

      const statBoxWidth = (pageWidth - 25) / 3;
      
      doc.setFontSize(10);
      doc.setTextColor(...successColor);
      doc.setFont('helvetica', 'bold');
      doc.text(`Pass Rate: ${passPercent}%`, 10 + statBoxWidth / 2, statsY + 7, { align: 'center' });
      
      doc.setTextColor(255, 152, 0);
      doc.text(`Average Score: ${avgScore}`, 10 + statBoxWidth + 2.5 + statBoxWidth / 2, statsY + 7, { align: 'center' });
      
      doc.setTextColor(...primaryColor);
      doc.text(`Highest Score: ${topScore}`, 10 + 2 * (statBoxWidth + 2.5) + statBoxWidth / 2, statsY + 7, { align: 'center' });

      // Prepare table data
      const tableHeaders = ['Rank', 'Reg. No.', 'Candidate Name'];
      sections.forEach(section => tableHeaders.push(section));
      tableHeaders.push('Total', 'Correct', 'Wrong', 'Status');

      const tableData = results.map((result, index) => {
        const row: (string | number)[] = [
          result.rank || index + 1,
          result.registration_number,
          result.student_name.toUpperCase(),
        ];
        
        sections.forEach(section => {
          row.push(result.section_wise_scores?.[section]?.marks.toFixed(1) || '-');
        });
        
        row.push(`${result.obtained_marks}/${examInfo.total_marks}`);
        row.push(result.correct_count);
        row.push(result.wrong_count);
        row.push(result.is_pass ? 'PASS' : 'FAIL');
        
        return row;
      });

      // Generate table
      autoTable(doc, {
        startY: 78,
        head: [tableHeaders],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: 'middle',
          halign: 'center',
          lineColor: [189, 189, 189],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        columnStyles: {
          0: { halign: 'center', fontStyle: 'bold', cellWidth: 12 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 25 },
          2: { halign: 'left', cellWidth: 45 },
        },
        didParseCell: function(data) {
          // Style the status column
          if (data.section === 'body' && data.column.index === tableHeaders.length - 1) {
            const cellValue = data.cell.raw as string;
            if (cellValue === 'PASS') {
              data.cell.styles.textColor = successColor;
              data.cell.styles.fontStyle = 'bold';
            } else if (cellValue === 'FAIL') {
              data.cell.styles.textColor = dangerColor;
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Style rank column for top 3
          if (data.section === 'body' && data.column.index === 0) {
            const rank = data.cell.raw as number;
            if (rank === 1) {
              data.cell.styles.fillColor = [255, 215, 0]; // Gold
              data.cell.styles.textColor = [0, 0, 0];
            } else if (rank === 2) {
              data.cell.styles.fillColor = [192, 192, 192]; // Silver
              data.cell.styles.textColor = [0, 0, 0];
            } else if (rank === 3) {
              data.cell.styles.fillColor = [205, 127, 50]; // Bronze
              data.cell.styles.textColor = [255, 255, 255];
            }
          }
        },
        margin: { left: 10, right: 10 },
      });

      // Footer on each page
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Footer line
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);
        
        // Footer text
        doc.setFontSize(8);
        doc.setTextColor(...grayText);
        doc.setFont('helvetica', 'normal');
        doc.text('This is a computer-generated document. No signature required.', 10, pageHeight - 7);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 10, pageHeight - 7, { align: 'right' });
        doc.text('© RKB Education Management System', pageWidth / 2, pageHeight - 7, { align: 'center' });
      }

      // Save the PDF
      const fileName = `${examInfo.exam_code}_Results_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success('PDF generated successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const generateIndividualScorecardPDF = async (result: StudentResult): Promise<string | null> => {
    if (!examInfo) return null;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Colors
      const primaryColor: [number, number, number] = [25, 118, 210]; // Blue
      const darkText: [number, number, number] = [33, 33, 33];
      const grayText: [number, number, number] = [117, 117, 117];
      const successColor: [number, number, number] = [76, 175, 80];
      const dangerColor: [number, number, number] = [244, 67, 54];

      // Header Background
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 40, 'F');

      // Logo placeholder / Organization Name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('RKB EDUCATION MANAGEMENT SYSTEM', 10, 10);

      // Main Title
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL SCORECARD', pageWidth / 2, 22, { align: 'center' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`${examInfo.exam_name} (${examInfo.exam_code})`, pageWidth / 2, 32, { align: 'center' });

      // Student Info Box
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(10, 45, pageWidth - 20, 45, 2, 2, 'S');
      
      doc.setTextColor(...darkText);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('CANDIDATE INFORMATION', 15, 52);
      doc.line(15, 54, 60, 54);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);
      
      const leftColX = 15;
      const rightColX = pageWidth / 2;
      let y = 62;

      doc.text('Name:', leftColX, y);
      doc.text('Reg. No:', rightColX, y);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text(result.student_name.toUpperCase(), leftColX + 30, y);
      doc.text(result.registration_number, rightColX + 35, y);
      
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);
      doc.text('Email:', leftColX, y);
      doc.text('Exam Date:', rightColX, y);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text(result.email, leftColX + 30, y);
      doc.text(formatDate(examInfo.exam_date), rightColX + 35, y);

      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);
      doc.text('Rank:', leftColX, y);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.setFontSize(14);
      doc.text(result.rank ? `#${result.rank}` : 'N/A', leftColX + 30, y);

      // Result Summary
      doc.setFontSize(10);
      doc.setTextColor(...darkText);
      doc.text('PERFORMANCE SUMMARY', 15, 100);
      doc.line(15, 102, 65, 102);

      const summaryY = 110;
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(10, summaryY, pageWidth - 20, 25, 2, 2, 'F');

      const colW = (pageWidth - 20) / 4;
      
      const stats = [
        { label: 'Obtained Marks', value: `${result.obtained_marks} / ${examInfo.total_marks}` },
        { label: 'Correct', value: result.correct_count.toString() },
        { label: 'Wrong', value: result.wrong_count.toString() },
        { label: 'Status', value: result.is_pass ? 'QUALIFIED' : 'NOT QUALIFIED', color: result.is_pass ? successColor : dangerColor }
      ];

      stats.forEach((stat, i) => {
        const x = 10 + (i * colW) + (colW / 2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayText);
        doc.setFontSize(8);
        doc.text(stat.label, x, summaryY + 8, { align: 'center' });
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(stat.color || darkText));
        doc.setFontSize(11);
        doc.text(stat.value, x, summaryY + 18, { align: 'center' });
      });

      // Section Wise Table
      if (result.section_wise_scores) {
        const sectionData = Object.entries(result.section_wise_scores).map(([name, scores]) => [
          name,
          scores.total_marks,
          scores.correct,
          scores.wrong,
          scores.marks.toFixed(1)
        ]);

        autoTable(doc, {
          startY: 145,
          head: [['Section Name', 'Max Marks', 'Correct', 'Wrong', 'Marks Obtained']],
          body: sectionData,
          theme: 'striped',
          headStyles: { fillColor: primaryColor },
          styles: { halign: 'center' },
          columnStyles: { 0: { halign: 'left' } }
        });
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(...grayText);
      doc.text('This is a computer-generated document. Generated by RKB Examination Portal.', pageWidth / 2, pageHeight - 15, { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

      return doc.output('datauristring').split(',')[1];
    } catch (error) {
      console.error('Individual PDF generation error:', error);
      return null;
    }
  };

  const handleSendIndividualEmail = async (result: StudentResult) => {
    setIsSendingEmail(result.id);
    
    try {
      // 1. Generate PDF base64
      const pdfBase64 = await generateIndividualScorecardPDF(result);
      
      if (!pdfBase64) {
        toast.error('Failed to generate scorecard PDF');
        return;
      }

      // 2. Call Edge Function
      const { data, error } = await invokeExternalFunction('send-result-emails', {
        exam_id: examId,
        student_id: result.student_id,
        pdf_attachment: pdfBase64,
        pdf_filename: `${result.registration_number}_Scorecard.pdf`
      });

      if (error) {
        throw error;
      }

      toast.success(`Result email sent to ${result.student_name}`);
    } catch (error: any) {
      console.error('Email send error:', error);
      toast.error(error.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(null);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Exam Results" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!examInfo) {
    return null;
  }

  const passedCount = results.filter(r => r.is_pass).length;
  const failedCount = results.filter(r => !r.is_pass).length;
  const avgScore = results.length > 0
    ? (results.reduce((sum, r) => sum + r.obtained_marks, 0) / results.length).toFixed(1)
    : '0';

  return (
    <AdminLayout title={examInfo.exam_name} description="View and manage student results">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate('/admin/results')} className="mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Results
      </Button>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{results.length}</p>
            <p className="text-sm text-muted-foreground">Total Attempted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-600">{passedCount}</p>
            <p className="text-sm text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-red-600">{failedCount}</p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{avgScore}</p>
            <p className="text-sm text-muted-foreground">Average Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {examInfo.results_published ? (
            <Badge className="bg-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              Published on {formatDate(examInfo.results_published_at!)}
            </Badge>
          ) : (
            <Badge variant="secondary">Not Published</Badge>
          )}
          {selectedStudents.size > 0 && (
            <Badge variant="outline" className="text-primary">
              {selectedStudents.size} selected
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedStudents.size > 0 && (
            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Selected ({selectedStudents.size})
            </Button>
          )}
          {results.length > 0 && (
            <>
              <Button 
                variant="outline" 
                onClick={generateStudentListPDF}
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Users className="w-4 h-4 mr-2" />
                )}
                Download Student List
              </Button>
              <Button 
                variant="outline" 
                onClick={handleCalculateRankings}
                disabled={isCalculatingRanks}
              >
                {isCalculatingRanks ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trophy className="w-4 h-4 mr-2" />
                )}
                Calculate Rankings
              </Button>
              <Button 
                variant="outline" 
                onClick={generateProfessionalPDF}
                disabled={isGeneratingPDF}
                className="bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700"
              >
                {isGeneratingPDF ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Download Scoreboard PDF
              </Button>
            </>
          )}
          {results.length > 0 && (
            <>
              {examInfo.results_published ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowUnpublishDialog(true)} disabled={isPublishing}>
                    Unpublish
                  </Button>
                  <Button onClick={() => setShowPublishDialog(true)} disabled={isPublishing}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Publish Again
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setShowPublishDialog(true)} disabled={isPublishing}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Publish Results
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Student Results</CardTitle>
          <CardDescription>
            {examInfo.exam_code} | Exam Date: {formatDate(examInfo.exam_date)} | Total Marks: {examInfo.total_marks}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No students have attempted this exam yet.
            </div>
          ) : (
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedStudents.size === results.length && results.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-center font-bold">Rank</TableHead>
                    <TableHead className="font-bold">Registration No.</TableHead>
                    <TableHead className="font-bold">Candidate Name</TableHead>
                    {sections.map((section) => (
                      <TableHead key={section} className="text-center font-bold">{section}</TableHead>
                    ))}
                    <TableHead className="text-center font-bold">Total</TableHead>
                    <TableHead className="text-center font-bold">Correct</TableHead>
                    <TableHead className="text-center font-bold">Wrong</TableHead>
                    <TableHead className="text-center font-bold">Status</TableHead>
                    <TableHead className="text-center font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={result.id} className={`${index < 3 ? 'bg-gradient-to-r from-yellow-50 to-transparent' : ''} ${selectedStudents.has(result.id) ? 'bg-primary/5' : ''}`}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedStudents.has(result.id)}
                          onCheckedChange={() => toggleSelect(result.id)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                          (result.rank || index + 1) === 1 ? 'bg-yellow-400 text-yellow-900' :
                          (result.rank || index + 1) === 2 ? 'bg-gray-300 text-gray-800' :
                          (result.rank || index + 1) === 3 ? 'bg-amber-600 text-white' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {result.rank || index + 1}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-medium">{result.registration_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {result.photo_url && (
                            <img 
                              src={result.photo_url} 
                              alt="" 
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium uppercase">{result.student_name}</p>
                            <p className="text-xs text-muted-foreground">{result.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      {sections.map((section) => (
                        <TableCell key={section} className="text-center">
                          <span className="font-medium">
                            {result.section_wise_scores?.[section]?.marks.toFixed(1) || '-'}
                          </span>
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <span className="font-bold text-lg">
                          {result.obtained_marks}
                        </span>
                        <span className="text-muted-foreground text-sm">/{examInfo.total_marks}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-semibold">{result.correct_count}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-red-600 font-semibold">{result.wrong_count}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {result.is_pass ? (
                          <Badge className="bg-green-600 hover:bg-green-700">PASS</Badge>
                        ) : (
                          <Badge variant="destructive">FAIL</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link to={`/admin/session/${result.session_id}/review`}>
                            <Button variant="ghost" size="sm" title="Review Answers">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendIndividualEmail(result)}
                            disabled={isSendingEmail === result.id}
                            title="Send Result Email"
                          >
                            {isSendingEmail === result.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <Mail className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRecalculate(result.session_id)}
                            disabled={isRecalculating === result.session_id}
                            title="Recalculate"
                          >
                            {isRecalculating === result.session_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish Confirmation Dialog */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Results?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the results visible to all students who attempted this exam.
              They will be able to view their scorecards on the public results page.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublishResults} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Yes, Publish Results'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unpublish Confirmation Dialog */}
      <AlertDialog open={showUnpublishDialog} onOpenChange={setShowUnpublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish Results?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the results from students immediately.
              You can make changes (recalculate, delete incorrect entries, update rankings) and then publish again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnpublishResults}
              disabled={isPublishing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPublishing ? 'Unpublishing...' : 'Yes, Unpublish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Results?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedStudents.size} student result(s) and their exam answers.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSelected} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete Results'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
