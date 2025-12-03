import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser, isTokenExpired, clearAuthAndRedirect } from "@/lib/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  // Check if token is expired
  if (isTokenExpired()) {
    console.log("[ProtectedRoute] Token expired, redirecting to login");
    clearAuthAndRedirect();
    return null; // Component will unmount during redirect
  }

  const user = getCurrentUser();
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

export default ProtectedRoute;
