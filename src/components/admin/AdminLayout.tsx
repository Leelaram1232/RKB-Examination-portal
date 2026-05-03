import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, BookOpen, Users, FileText, 
  BarChart3, Shield, LogOut, ChevronLeft, BrainCircuit, Menu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  /** Override main area layout (e.g. overflow-hidden + flex column for full-height tools pages) */
  mainClassName?: string;
}

const navItems = [
  { title: 'Dashboard', url: '/admin/dashboard', icon: LayoutDashboard },
  { title: 'Exams', url: '/admin/exams', icon: BookOpen },
  { title: 'Registrations', url: '/admin/registrations', icon: Users },
  { title: 'Questions', url: '/admin/questions', icon: FileText },
  { title: 'AI Assistant', url: '/admin/questions/ai-assistant', icon: BrainCircuit },
  { title: 'Smart Paste', url: '/admin/questions/smart-paste', icon: FileText },
  { title: 'Results', url: '/admin/results', icon: BarChart3 },
];

export const AdminLayout = ({ children, title, description, mainClassName }: AdminLayoutProps) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/admin/dashboard') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link to="/admin/dashboard" className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">RKB Admin</h1>
            <p className="text-xs text-muted-foreground">Management Portal</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.url}
            to={item.url}
            onClick={() => setIsMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(item.url)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.title}
          </Link>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.email}
            </p>
            <p className="text-xs text-muted-foreground">Administrator</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={signOut}
          className="w-full justify-start"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-card border-r border-border flex-col shrink-0 overflow-y-auto">
        <NavContent />
      </aside>

      {/* Mobile Sidebar (Sheet) */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative w-full overflow-hidden">
        {/* Header */}
        <header className="h-16 shrink-0 border-b border-border bg-card px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden" 
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>
            <div className="truncate max-w-[200px] sm:max-w-none">
              <h1 className="text-lg lg:text-xl font-semibold text-foreground truncate">{title}</h1>
              {description && (
                <p className="hidden sm:block text-xs lg:text-sm text-muted-foreground truncate">{description}</p>
              )}
            </div>
          </div>
          <Link to="/" className="text-xs lg:text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Main Site</span>
            <span className="sm:hidden">Exit</span>
          </Link>
        </header>

        {/* Page Content */}
        <main className={cn('flex-1 min-h-0 p-4 lg:p-6 overflow-auto', mainClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
};
