import { Link } from 'react-router-dom';
import { LogIn, User, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.jpg';

export const Header = () => {
  const { user, isAdmin, signOut } = useAuth();

  return (
    <header className="official-header shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="RKB Logo" className="w-10 h-10 rounded-lg object-contain bg-white" />
            <div>
              <h1 className="text-lg font-bold text-primary-foreground tracking-tight">
                RKB Examination Portal
              </h1>
              <p className="text-xs text-primary-foreground/80">
                Official Examination System
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                {isAdmin ? (
                  <Button
                    asChild
                    variant="ghost"
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <Link to="/admin/dashboard">Admin Dashboard</Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="ghost"
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <Link to="/student/dashboard">My Dashboard</Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={signOut}
                  className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Sign Out
                </Button>
              </>
            ) : (
            <>
                <Button
                  asChild
                  variant="ghost"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Link to="/results" className="flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Results
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Link to="/admin/login" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Admin Login
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};
