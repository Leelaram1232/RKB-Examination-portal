import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, CreditCard, IndianRupee, Loader2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Exam {
  exam_name: string;
  exam_date: string;
  registration_amount: number;
}

interface Step3PaymentInfoProps {
  form: UseFormReturn<any>;
  onNext: () => void;
  onBack: () => void;
  exam: Exam;
  onCreateAndPay?: () => void;
  isSubmitting?: boolean;
}

export const Step3PaymentInfo = ({ 
  form, 
  onBack, 
  exam,
  onCreateAndPay,
  isSubmitting = false,
}: Step3PaymentInfoProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Payment Information</h2>
        <p className="text-muted-foreground">Review details and proceed to payment</p>
      </div>

      {/* Registration Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{exam.exam_name}</h3>
              <p className="text-sm text-muted-foreground">
                Exam Date: {new Date(exam.exam_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Registration Fee</span>
              <span className="font-medium flex items-center">
                <IndianRupee className="h-4 w-4" />
                {exam.registration_amount}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Processing Fee</span>
              <span className="font-medium">₹0</span>
            </div>
            <div className="flex justify-between items-center border-t pt-3">
              <span className="font-semibold">Total Amount</span>
              <span className="font-bold text-lg flex items-center text-primary">
                <IndianRupee className="h-5 w-5" />
                {exam.registration_amount}
              </span>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              Secure Payment Gateway
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-green-600 border-green-600">
                Cashfree
              </Badge>
              <span className="text-sm text-muted-foreground">
                UPI, Cards, Net Banking, Wallets
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Your payment is secured with 256-bit encryption.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> Clicking "Pay Now" will save your registration and redirect you to the secure payment gateway. Your registration will be confirmed after successful payment.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        
        <Button 
          type="button" 
          onClick={onCreateAndPay} 
          disabled={isSubmitting}
          className="min-w-[140px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ₹{exam.registration_amount}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
