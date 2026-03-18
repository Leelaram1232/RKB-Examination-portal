import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ExamList from "./pages/admin/ExamList";
import ExamForm from "./pages/admin/ExamForm";
import ExamDetail from "./pages/admin/ExamDetail";
import RegistrationApproval from "./pages/admin/RegistrationApproval";
import QuestionManagement from "./pages/admin/QuestionManagement";
import SmartQuestionPaste from "./pages/admin/SmartQuestionPaste";
import AIQuestionAssistant from "./pages/admin/AIQuestionAssistant";
import SessionManagement from "./pages/admin/SessionManagement";
import LiveMonitoring from "./pages/admin/LiveMonitoring";
import ExamRegistration from "./pages/ExamRegistration";
import ExamRegistrationWizard from "./pages/ExamRegistrationWizard";
import ExamLogin from "./pages/ExamLogin";
import ExamInstructions from "./pages/ExamInstructions";
import ExamInterface from "./pages/ExamInterface";
import ExamResult from "./pages/ExamResult";
import ExamSubmitted from "./pages/ExamSubmitted";
import Results from "./pages/Results";
import ResultLogin from "./pages/ResultLogin";
import StudentScorecard from "./pages/StudentScorecard";
import ResultsManagement from "./pages/admin/ResultsManagement";
import ExamResults from "./pages/admin/ExamResults";
import StudentAnswerReview from "./pages/admin/StudentAnswerReview";
import TermsAndConditions from "./pages/TermsAndConditions";
import RefundPolicy from "./pages/RefundPolicy";
import PaymentStatus from "./pages/PaymentStatus";
import RegistrationPayment from "./pages/RegistrationPayment";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Index />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/exam/:examId/register" element={<ExamRegistrationWizard />} />
            <Route path="/exam/:examId/login" element={<ExamLogin />} />
            <Route path="/exam/:examId/instructions" element={<ExamInstructions />} />
            <Route path="/exam/:examId/take" element={<ExamInterface />} />
            <Route path="/exam/:examId/result" element={<ExamResult />} />
            <Route path="/exam/:examId/submitted" element={<ExamSubmitted />} />
            
            {/* Public Results Routes */}
            <Route path="/results" element={<Results />} />
            <Route path="/results/:examId/login" element={<ResultLogin />} />
            <Route path="/results/:examId/scorecard" element={<StudentScorecard />} />
            
            {/* Policy Pages */}
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/payment-status" element={<PaymentStatus />} />
            <Route path="/registration-payment/:registrationId" element={<RegistrationPayment />} />
            
            {/* Protected Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ExamList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/new"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ExamForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ExamDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:id/edit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ExamForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/registrations"
              element={
                <ProtectedRoute requiredRole="admin">
                  <RegistrationApproval />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/questions/smart-paste"
              element={
                <ProtectedRoute requiredRole="admin">
                  <SmartQuestionPaste />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/questions/ai-assistant"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AIQuestionAssistant />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/results"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ResultsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/results/:examId"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ExamResults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/session/:sessionId/review"
              element={
                <ProtectedRoute requiredRole="admin">
                  <StudentAnswerReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:examId/sessions"
              element={
                <ProtectedRoute requiredRole="admin">
                  <SessionManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/exams/:examId/monitoring"
              element={
                <ProtectedRoute requiredRole="admin">
                  <LiveMonitoring />
                </ProtectedRoute>
              }
            />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
