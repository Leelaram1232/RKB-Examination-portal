import { ShieldX, AlertTriangle, Phone, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ExamBlockedOverlayProps {
  violationCount: number;
  maxViolations: number;
}

export const ExamBlockedOverlay = ({ violationCount, maxViolations }: ExamBlockedOverlayProps) => {
  return (
    <div className="fixed inset-0 z-[200] bg-red-900 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full bg-white shadow-2xl">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          {/* Icon */}
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <ShieldX className="w-10 h-10 text-red-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-red-600">Examination Blocked</h1>

          {/* Main Message */}
          <div className="space-y-4">
            <p className="text-lg text-gray-800">
              You have violated examination rules.
            </p>
            <p className="text-lg font-semibold text-gray-900">
              You are no longer allowed to continue.
            </p>
            <p className="text-gray-700">
              Contact the administration.
            </p>
          </div>

          {/* Violation Counter */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-red-700">Violations Recorded</span>
            </div>
            <p className="text-3xl font-bold text-red-600">{violationCount} / {maxViolations}</p>
          </div>

          {/* Saved Answers Notice */}
          <p className="text-sm text-gray-600">
            Your answers up to this point have been saved.
          </p>

          {/* Contact Section */}
          <div className="bg-gray-100 rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Phone className="w-5 h-5 text-gray-700" />
              <span className="font-semibold text-gray-800">Contact Administration</span>
            </div>
            <p className="text-sm text-gray-600">
              If you believe this was an error, contact the exam administration immediately.
              An administrator may allow you to resume the exam from where you left off.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Mail className="w-4 h-4" />
              <span>admin@examportal.com</span>
            </div>
          </div>

          {/* Warning */}
          <p className="text-sm text-gray-500 font-medium">
            Do not close this window. Wait for further instructions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
