import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicLayout } from '@/components/layout/PublicLayout';
import logo from '@/assets/logo.jpg';

interface SectionScore {
  correct: number;
  wrong: number;
  unanswered: number;
  marks: number;
  total_marks: number;
  total_questions: number;
}

interface StudentResultData {
  success: boolean;
  student: {
    full_name: string;
    email: string;
    date_of_birth: string;
    registration_number: string;
    photo_url?: string | null;
    signature_url?: string | null;
  };
  exam: {
    exam_name: string;
    exam_code: string;
    exam_date: string;
    total_marks: number;
    passing_marks: number;
  };
  result: {
    obtained_marks: number;
    correct_count: number;
    wrong_count: number;
    unanswered_count: number;
    is_pass: boolean;
    rank?: number;
    section_wise_scores: Record<string, SectionScore> | null;
    calculated_at: string;
  };
}

export default function StudentScorecard() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [resultData, setResultData] = useState<StudentResultData | null>(null);
  const scorecardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem('studentResult');
    if (!storedData) {
      navigate(`/results/${examId}/login`);
      return;
    }

    try {
      const parsed = JSON.parse(storedData);
      setResultData(parsed);
    } catch {
      navigate(`/results/${examId}/login`);
    }
  }, [examId, navigate]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateLong = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!resultData) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </PublicLayout>
    );
  }

  const { student, exam, result } = resultData;
  const percentage = ((result.obtained_marks / exam.total_marks) * 100).toFixed(2);

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Action Buttons - Hidden in Print */}
        <div className="flex items-center justify-between mb-6 print:hidden no-print">
          <Button variant="ghost" onClick={() => navigate('/results')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Results
          </Button>
          <Button onClick={handlePrint} className="gap-2 bg-primary hover:bg-primary/90">
            <Download className="w-4 h-4" />
            Download Score Card
          </Button>
        </div>

        {/* Professional Scorecard */}
        <div ref={scorecardRef} id="scorecard-content" className="bg-white text-black rounded-lg shadow-2xl overflow-hidden border-4 border-primary/20">
          {/* Top Border Pattern */}
          <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
          
          {/* Header Section */}
          <div className="bg-gradient-to-b from-primary to-primary/95 text-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-lg bg-white p-1 shadow-lg">
                  <img src={logo} alt="RKB Logo" className="w-full h-full object-contain rounded" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-wide">RKB EXAMINATION PORTAL</h1>
                  <p className="text-white/80 text-sm mt-1">Official Examination System</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Student Photo */}
                {student.photo_url && (
                  <div className="w-24 h-28 rounded-lg bg-white p-1 shadow-lg overflow-hidden">
                    <img 
                      src={student.photo_url} 
                      alt="Student Photo" 
                      className="w-full h-full object-cover rounded"
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <div className="text-right">
                  <div className="bg-white/20 rounded-lg px-4 py-2 backdrop-blur">
                    <p className="text-xs text-white/80">Score Card ID</p>
                    <p className="font-mono font-bold text-lg">{exam.exam_code}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Title Banner */}
          <div className="bg-muted px-6 py-4 border-b-2 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground uppercase tracking-wide">{exam.exam_name}</h2>
                <p className="text-muted-foreground text-sm">Official Score Card</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Examination Date</p>
                <p className="font-semibold text-foreground">{formatDateLong(exam.exam_date)}</p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6 space-y-6">
            {/* Candidate Details Table */}
            <div className="border-2 border-border rounded-lg overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 border-b border-border">
                <h3 className="font-bold text-primary uppercase text-sm tracking-wider">Candidate Information</h3>
              </div>
              <div className="flex">
                <div className="flex-1 grid grid-cols-2 divide-x divide-y divide-border">
                  <div className="p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground uppercase">Candidate Name</p>
                    <p className="font-bold text-foreground mt-1">{student.full_name}</p>
                  </div>
                  <div className="p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground uppercase">Registration Number</p>
                    <p className="font-bold font-mono text-foreground mt-1">{student.registration_number}</p>
                  </div>
                  <div className="p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground uppercase">Date of Birth</p>
                    <p className="font-bold text-foreground mt-1">{formatDate(student.date_of_birth)}</p>
                  </div>
                  <div className="p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground uppercase">Email Address</p>
                    <p className="font-bold text-foreground mt-1 text-sm">{student.email}</p>
                  </div>
                </div>
                {/* Signature */}
                {student.signature_url && (
                  <div className="w-40 border-l border-border bg-white flex flex-col items-center justify-center p-2">
                    <p className="text-xs text-muted-foreground uppercase mb-1">Signature</p>
                    <img 
                      src={student.signature_url} 
                      alt="Student Signature" 
                      className="max-w-full max-h-16 object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Result Section */}
            <div className="border-2 border-border rounded-lg overflow-hidden">
              <div className="bg-primary/10 px-4 py-2 border-b border-border">
                <h3 className="font-bold text-primary uppercase text-sm tracking-wider">Examination Result</h3>
              </div>
              
              {/* Score Display */}
              <div className={`p-6 ${result.is_pass ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground uppercase">Total Marks Obtained</p>
                      <p className="text-4xl font-bold text-foreground">
                        {result.obtained_marks} <span className="text-2xl text-muted-foreground">/ {exam.total_marks}</span>
                      </p>
                    </div>
                    <div className="flex gap-8">
                      <div>
                        <p className="text-sm text-muted-foreground uppercase">Percentage</p>
                        <p className="text-2xl font-bold text-foreground">{percentage}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground uppercase">Qualifying Marks</p>
                        <p className="text-2xl font-bold text-foreground">{exam.passing_marks}</p>
                      </div>
                      {result.rank && (
                        <div>
                          <p className="text-sm text-muted-foreground uppercase font-semibold">Rank</p>
                          <div className="flex items-baseline gap-1">
                            <p className="text-3xl font-extrabold text-primary">{result.rank}</p>
                            <p className="text-xs text-muted-foreground">Position</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className={`px-8 py-4 rounded-lg ${result.is_pass ? 'bg-green-600' : 'bg-red-600'} text-white shadow-lg`}>
                      <p className="text-sm uppercase tracking-wider text-center opacity-90">Result Status</p>
                      <p className="text-3xl font-black text-center">{result.is_pass ? 'QUALIFIED' : 'NOT QUALIFIED'}</p>
                    </div>
                    {result.rank && (
                      <div className="bg-primary/10 px-4 py-1 rounded-full border border-primary/20">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-tighter text-center">Rank Verified</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Subject-wise Scores Table */}
            {result.section_wise_scores && Object.keys(result.section_wise_scores).length > 0 && (
              <div className="border-2 border-border rounded-lg overflow-hidden">
                <div className="bg-primary/10 px-4 py-2 border-b border-border">
                  <h3 className="font-bold text-primary uppercase text-sm tracking-wider">Subject-wise Score Details</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted text-left">
                      <th className="px-4 py-3 text-sm font-bold text-foreground border-b-2 border-border">Subject</th>
                      <th className="px-4 py-3 text-sm font-bold text-foreground border-b-2 border-border text-center">Maximum Marks</th>
                      <th className="px-4 py-3 text-sm font-bold text-foreground border-b-2 border-border text-center">Marks Obtained</th>
                      <th className="px-4 py-3 text-sm font-bold text-foreground border-b-2 border-border text-center">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.section_wise_scores).map(([section, scores], index) => {
                      const sectionPercentage = ((scores.marks / scores.total_marks) * 100).toFixed(2);
                      return (
                        <tr key={section} className={index % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
                          <td className="px-4 py-3 font-medium border-b border-border">{section}</td>
                          <td className="px-4 py-3 text-center border-b border-border">{scores.total_marks}</td>
                          <td className="px-4 py-3 text-center font-bold border-b border-border">{scores.marks.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center border-b border-border">{sectionPercentage}%</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-primary/10 font-bold">
                      <td className="px-4 py-3 border-t-2 border-primary/30">TOTAL</td>
                      <td className="px-4 py-3 text-center border-t-2 border-primary/30">{exam.total_marks}</td>
                      <td className="px-4 py-3 text-center border-t-2 border-primary/30">{result.obtained_marks}</td>
                      <td className="px-4 py-3 text-center border-t-2 border-primary/30">{percentage}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Important Notes */}
            <div className="border border-border rounded-lg p-4 bg-muted/20">
              <h4 className="font-bold text-sm text-foreground mb-2">Important Notes:</h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>This is a computer-generated score card and does not require any signature.</li>
                <li>The score card is valid only when verified through official channels.</li>
                <li>For any discrepancies, please contact the examination authority within 30 days of result declaration.</li>
                <li>Result declared on: {formatDateLong(result.calculated_at)}</li>
              </ul>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t-2 border-primary/20">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>
                  <p className="font-bold text-foreground">RKB Examination Portal</p>
                  <p>Official Examination System</p>
                </div>
                <div className="text-right">
                  <p>Generated on: {new Date().toLocaleDateString('en-IN', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                  <p>© {new Date().getFullYear()} RKB. All rights reserved.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Border Pattern */}
          <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          
          .no-print,
          .print\\:hidden,
          header,
          footer,
          nav {
            display: none !important;
          }
          
          #scorecard-content {
            box-shadow: none !important;
            border: 2px solid #1e3a5f !important;
            margin: 0 !important;
            width: 100% !important;
          }
          
          #scorecard-content * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .bg-primary {
            background-color: #1e3a5f !important;
          }
          
          .bg-green-50 {
            background-color: #f0fdf4 !important;
          }
          
          .bg-red-50 {
            background-color: #fef2f2 !important;
          }
          
          .bg-green-600 {
            background-color: #16a34a !important;
          }
          
          .bg-red-600 {
            background-color: #dc2626 !important;
          }
          
          .text-white {
            color: white !important;
          }
        }
      `}</style>
    </PublicLayout>
  );
}
