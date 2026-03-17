import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Check, Loader2, User, MapPin, GraduationCap, Image, IndianRupee } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface Exam {
  exam_name: string;
  exam_date: string;
  exam_time: string;
  registration_type: string;
  registration_amount: number;
}

interface Step4ConfirmationProps {
  form: UseFormReturn<any>;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  exam: Exam;
}

export const Step4Confirmation = ({ 
  form, 
  onBack, 
  onSubmit,
  isSubmitting,
  exam 
}: Step4ConfirmationProps) => {
  const values = form.watch();

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Confirm Your Registration</h2>
        <p className="text-muted-foreground">Please review all details before submitting</p>
      </div>

      {/* Exam Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Exam Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Exam Name</p>
            <p className="font-medium">{exam.exam_name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exam Date</p>
            <p className="font-medium">{formatDate(exam.exam_date)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exam Time</p>
            <p className="font-medium">{exam.exam_time}</p>
          </div>
          {exam.registration_type === 'paid' && (
            <div>
              <p className="text-sm text-muted-foreground">Registration Fee</p>
              <p className="font-medium flex items-center">
                <IndianRupee className="h-4 w-4" />
                {exam.registration_amount}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Full Name</p>
            <p className="font-medium">{values.full_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{values.email || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Mobile</p>
            <p className="font-medium">{values.mobile || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Date of Birth</p>
            <p className="font-medium">{formatDate(values.date_of_birth)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gender</p>
            <p className="font-medium capitalize">{values.gender || '-'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Address Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">State</p>
            <p className="font-medium">{values.state || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">City</p>
            <p className="font-medium">{values.city || '-'}</p>
          </div>
          {values.address && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Full Address</p>
              <p className="font-medium">{values.address}</p>
            </div>
          )}
          {values.pincode && (
            <div>
              <p className="text-sm text-muted-foreground">Pincode</p>
              <p className="font-medium">{values.pincode}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Academic Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Academic Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Class</p>
            <p className="font-medium">{values.class || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Board</p>
            <p className="font-medium">{values.board || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">School/College</p>
            <p className="font-medium">{values.school_name || '-'}</p>
          </div>
          {values.academic_year && (
            <div>
              <p className="text-sm text-muted-foreground">Academic Year</p>
              <p className="font-medium">{values.academic_year}</p>
            </div>
          )}
          {values.percentage && (
            <div>
              <p className="text-sm text-muted-foreground">Previous Year %</p>
              <p className="font-medium">{values.percentage}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Photos */}
      {(values.photo_url || values.signature_url) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-5 w-5" />
              Uploaded Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
            {values.photo_url && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Photo</p>
                <img 
                  src={values.photo_url} 
                  alt="Student" 
                  className="h-24 w-20 object-cover rounded-lg"
                />
              </div>
            )}
            {values.signature_url && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Signature</p>
                <img 
                  src={values.signature_url} 
                  alt="Signature" 
                  className="h-16 w-32 object-contain rounded-lg bg-white p-1"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
        <p className="text-sm text-green-700 dark:text-green-300">
          By clicking "Confirm Registration", you agree that all the information provided is accurate and complete.
          {exam.registration_type === 'paid' && ' Payment details will be sent to your email after registration.'}
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <Button onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Confirm Registration
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
