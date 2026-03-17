import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5" />
              <h3 className="font-semibold">RKB Examination Portal</h3>
            </div>
            <p className="text-sm text-primary-foreground/80">
              Official examination portal for conducting 
              secure and transparent examinations nationwide.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li><Link to="/" className="hover:text-primary-foreground transition-colors">View Examinations</Link></li>
              <li><Link to="/results" className="hover:text-primary-foreground transition-colors">View Results</Link></li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="font-semibold mb-4">Policies</h3>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li><Link to="/terms" className="hover:text-primary-foreground transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/refund-policy" className="hover:text-primary-foreground transition-colors">Cancellation & Refund Policy</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">Contact Information</h3>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li>Email: support@rkb.edu.in</li>
              <li>Phone: 1800-XXX-XXXX (Toll Free)</li>
              <li>Working Hours: Mon-Sat, 9:00 AM - 6:00 PM</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-6 text-center text-sm text-primary-foreground/60">
          <p>© {new Date().getFullYear()} RKB Examination Portal. All rights reserved.</p>
          <div className="mt-2 space-x-4">
            <Link to="/terms" className="hover:text-primary-foreground transition-colors">Terms</Link>
            <Link to="/refund-policy" className="hover:text-primary-foreground transition-colors">Refund Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
