import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type AppRole = 'admin' | 'student';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, userRole, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to appropriate login based on required role
    const loginPath = requiredRole === 'admin' ? '/admin/login' : '/auth';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (requiredRole && userRole !== requiredRole) {
    // User is logged in but doesn't have the required role
    if (requiredRole === 'admin') {
      return <Navigate to="/auth" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
