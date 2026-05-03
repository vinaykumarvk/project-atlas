import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ShieldAlert } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

/**
 * Route guard component that redirects unauthenticated users to the login page.
 * Optionally checks if the user has one of the required roles.
 */
export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are required, check if user has at least one
  if (requiredRoles && requiredRoles.length > 0 && user) {
    const hasRequiredRole = user.roles.some((role) =>
      requiredRoles.includes(role),
    );
    if (!hasRequiredRole) {
      return (
        <div className="flex flex-col items-center justify-center p-16 text-center">
          <ShieldAlert className="mb-4 h-12 w-12 text-destructive/50" />
          <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You do not have the required permissions to view this page.</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
