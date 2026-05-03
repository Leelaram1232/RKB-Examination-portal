import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const RefundPolicy = () => {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              Cancellation & Refund Policy
            </CardTitle>
            <p className="text-center text-muted-foreground text-sm">
              Last updated on 12-01-2026 09:11:21
            </p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-4">
            <p>
              <strong>RKB EXAMINATION PORTAL</strong> believes in helping its customers as far as possible, and has therefore a liberal cancellation policy. Under this policy:
            </p>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Cancellation Policy</h3>
            <ul className="list-disc pl-6 space-y-3">
              <li>
                Cancellations will be considered only if the request is made immediately after placing the order. However, the cancellation request may not be entertained if the orders have been communicated to the vendors/merchants and they have initiated the process of shipping them.
              </li>
              <li>
                RKB EXAMINATION PORTAL does not accept cancellation requests for perishable items like flowers, eatables etc. However, refund/replacement can be made if the customer establishes that the quality of product delivered is not good.
              </li>
            </ul>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Damaged or Defective Items</h3>
            <p>
              In case of receipt of damaged or defective items please report the same to our Customer Service team. The request will, however, be entertained once the merchant has checked and determined the same at his own end.
            </p>
            <p className="font-medium">
              This should be reported within <strong>same day</strong> of receipt of the products.
            </p>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Product Not as Expected</h3>
            <p>
              In case you feel that the product received is not as shown on the site or as per your expectations, you must bring it to the notice of our customer service within <strong>same day</strong> of receiving the product. The Customer Service Team after looking into your complaint will take an appropriate decision.
            </p>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Warranty Issues</h3>
            <p>
              In case of complaints regarding products that come with a warranty from manufacturers, please refer the issue to them.
            </p>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Refund Processing</h3>
            <p>
              In case of any Refunds approved by the RKB EXAMINATION PORTAL, it'll take <strong>1-2 Days</strong> for the refund to be processed to the end customer.
            </p>

            <Separator className="my-6" />

            <h3 className="text-lg font-semibold">Contact Us</h3>
            <p>
              For any questions regarding our Cancellation & Refund Policy, please contact us using the contact information provided on this website.
            </p>
            <ul className="list-none space-y-2">
              <li><strong>Email:</strong> support@rkb.edu.in</li>
              <li><strong>Phone:</strong> 1800-XXX-XXXX (Toll Free)</li>
              <li><strong>Working Hours:</strong> Mon-Sat, 9:00 AM - 6:00 PM</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default RefundPolicy;
