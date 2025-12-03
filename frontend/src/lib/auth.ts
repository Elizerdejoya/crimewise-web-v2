import { jwtDecode } from "jwt-decode";

export interface JwtTokenPayload {
  id: number;
  email: string;
  role: string;
  organization_id?: number;
  exp: number;
  iat: number;
}

/**
 * Get the current user from the JWT token stored in localStorage
 */
export const getCurrentUser = (): JwtTokenPayload | null => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  
  try {
    const payload = jwtDecode<JwtTokenPayload>(token);
    return payload;
  } catch (e) {
    console.error("Failed to decode token:", e);
    return null;
  }
};

/**
 * Check if the JWT token is expired
 */
export const isTokenExpired = (): boolean => {
  const user = getCurrentUser();
  if (!user) return true;
  
  const currentTime = Date.now() / 1000; // Convert to seconds
  return user.exp < currentTime;
};

/**
 * Get authentication headers for API requests
 */
export const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Clear authentication data and redirect to login
 */
export const clearAuthAndRedirect = (): void => {
  localStorage.removeItem("token");
  // Use window.location to force a full page reload and redirect
  window.location.href = "/login";
};

/**
 * Enhanced fetch wrapper that handles authentication errors globally
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  // Check if token is expired before making the request
  if (isTokenExpired()) {
    console.log("[AUTH] Token expired, redirecting to login");
    clearAuthAndRedirect();
    throw new Error("Token expired");
  }

  // Add auth headers if not already present
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized responses
  if (response.status === 401) {
    console.log("[AUTH] Received 401, token invalid or expired");
    clearAuthAndRedirect();
    throw new Error("Authentication failed");
  }

  return response;
};
