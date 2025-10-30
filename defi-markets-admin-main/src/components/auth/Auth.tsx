import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface AuthProps {
  children: React.ReactNode;
}

const Auth = ({ children }: AuthProps) => {
  const { isAuthenticated, isLoading, token, adminVerify } = useAuth();
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const hasVerifiedRef = useRef(false);

  useEffect(() => {
    const verifyAdmin = async () => {
      // Only verify if we have a token, are authenticated, haven't verified yet, and not currently verifying
      if (token && isAuthenticated && !hasVerifiedRef.current && !isVerifying) {
        setIsVerifying(true);
        hasVerifiedRef.current = true; // Mark as attempted to prevent re-verification
        
        try {
          const result = await adminVerify();
          if (result.success) {
            setIsAdminVerified(true);
          } else {
            setIsAdminVerified(false);
          }
        } catch (error) {
          console.error('Admin verification failed:', error);
          setIsAdminVerified(false);
        } finally {
          setIsVerifying(false);
        }
      }
    };

    verifyAdmin();
  }, [token, isAuthenticated, adminVerify]);

  // Reset verification state when token changes or user logs out
  useEffect(() => {
    if (!token || !isAuthenticated) {
      setIsAdminVerified(false);
      setIsVerifying(false);
      hasVerifiedRef.current = false;
    }
  }, [token, isAuthenticated]);

  // Show loading state while checking authentication or verifying admin
  if (isLoading || isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect to home if not authenticated or admin verification failed
  if (!isAuthenticated || !isAdminVerified) {
    return <Navigate to="/" replace />;
  }

  // Render children if authenticated and admin verified
  return <>{children}</>;
};

export default Auth;
