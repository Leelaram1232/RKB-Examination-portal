import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, FileText, ArrowRight, BookOpen, Award, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { externalSupabase } from '@/lib/externalSupabase';

interface Exam {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string | null;
  eligibility_class: string | null;
  eligibility_year: string | null;
  registration_start: string;
  registration_end: string;
  exam_date: string;
  exam_time: string;
  duration_minutes: number;
  status: string;
  is_active: boolean;
}

// Helper function to parse exam datetime
const parseExamDateTime = (examDate: string, examTime: string): Date => {
  const date = new Date(examDate);
  const [hours, minutes, seconds] = examTime.split(':').map(Number);
  date.setHours(hours, minutes, seconds || 0, 0);
  return date;
};

const Index = () => {
  const [registrationExams, setRegistrationExams] = useState<Exam[]>([]);
  const [liveExams, setLiveExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      const now = new Date();
      const nowIso = now.toISOString();
      const today = nowIso.split('T')[0];
      
      // Broad debug fetch: Get everything from exams table to see what RLS allows us to see
      const { data: allExams, error: debugError } = await externalSupabase
        .from('exams')
        .select('*');

      if (debugError) console.error('Error fetching exams:', debugError);

      // Filter registration exams (only show during registration window)
      const filteredRegExams = (allExams || []).filter(exam => {
        const startDate = new Date(exam.registration_start);
        const endDate = new Date(exam.registration_end);
        
        // Use the 'now' Date object we created at the start of fetchExams
        const isWithinWindow = startDate <= now && endDate >= now;
        
        // Explicitly check is_active (handle potential null/undefined)
        const isActive = exam.is_active === true;
        
        return isWithinWindow && isActive;
      });
      
      setRegistrationExams(filteredRegExams);

      // Fetch exams where exam date is today (for live exam filtering)
      const { data: todayExams } = await externalSupabase
        .from('exams')
        .select('*')
        .eq('is_active', true)
        .eq('exam_date', today)
        .not('status', 'in', '("draft","results_published")')
        .order('exam_time', { ascending: true });

      // Filter live exams (only show during exam time window)
      if (todayExams) {
        const availableNow = todayExams.filter(exam => {
          const examStart = parseExamDateTime(exam.exam_date, exam.exam_time);
          const examEnd = new Date(examStart.getTime() + exam.duration_minutes * 60000);
          return now >= examStart && now <= examEnd;
        });
        setLiveExams(availableNow);
      }
      
      setIsLoading(false);
    };

    fetchExams();
    
    // Refresh every minute to update availability
    const interval = setInterval(fetchExams, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="official-header py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4">
            RKB Examination Portal
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-8">
            Secure and transparent online examination system. 
            Register for upcoming examinations and access your results online.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              asChild 
              size="lg" 
              variant="outline" 
              className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link to="#exams">
                View Examinations
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="text-center border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Online Registration</h3>
                <p className="text-sm text-muted-foreground">
                  Register for examinations from anywhere with our secure online portal
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Secure Examination</h3>
                <p className="text-sm text-muted-foreground">
                  Take examinations with password-protected access and time monitoring
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Award className="w-6 h-6 text-info" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Instant Results</h3>
                <p className="text-sm text-muted-foreground">
                  View your results and detailed scorecards immediately after submission
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Examinations Section */}
      <section id="exams" className="py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Upcoming Examinations
            </h2>
            <p className="text-muted-foreground">
              Browse and register for available examinations
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="mt-4 text-muted-foreground">Loading examinations...</p>
            </div>
          ) : registrationExams.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Exams Available for Registration</h3>
                <p className="text-muted-foreground">
                  Check back later for upcoming examination announcements.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {registrationExams.map((exam) => (
                <Card key={exam.id} className="card-highlight hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{exam.exam_name}</CardTitle>
                        <CardDescription className="mt-1">
                          Code: {exam.exam_code}
                        </CardDescription>
                      </div>
                      <Badge className="status-badge status-active">Registration Open</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {exam.description || 'No description available'}
                    </p>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Exam Date: {formatDate(exam.exam_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>Duration: {exam.duration_minutes} minutes</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>
                          Eligibility: {exam.eligibility_class || 'All'} 
                          {exam.eligibility_year && ` (${exam.eligibility_year})`}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-3">
                        Registration ends: {formatDate(exam.registration_end)}
                      </p>
                      <Button asChild className="w-full">
                        <Link to={`/exam/${exam.id}/register`}>
                          Register Now
                          <ArrowRight className="ml-2 w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live Examinations Section */}
      {liveExams.length > 0 && (
        <section className="py-12 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                Start Your Examination
              </h2>
              <p className="text-muted-foreground">
                Exams currently available for taking
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveExams.map((exam) => (
                <Card key={exam.id} className="card-highlight hover:shadow-md transition-shadow border-primary/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{exam.exam_name}</CardTitle>
                        <CardDescription className="mt-1">
                          Code: {exam.exam_code}
                        </CardDescription>
                      </div>
                      <Badge className="status-badge status-active">Live Now</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {exam.description || 'No description available'}
                    </p>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Date: {formatDate(exam.exam_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>Time: {exam.exam_time} | Duration: {exam.duration_minutes} min</span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button asChild className="w-full" variant="default">
                        <Link to={`/exam/${exam.id}/login`}>
                          Start Exam
                          <ArrowRight className="ml-2 w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Notice Section */}
      <section className="py-8 bg-warning/10 border-y border-warning/20">
        <div className="container mx-auto px-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Important Notice</h3>
              <p className="text-sm text-muted-foreground">
                Students are advised to complete their profile with accurate information before 
                registering for any examination. Incomplete profiles may result in rejection of 
                applications. Keep your login credentials secure and do not share with anyone.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default Index;
