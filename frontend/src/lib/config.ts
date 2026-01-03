// Configuration for environment variables and API URLs

// Use Vite's import.meta.env for environment variables
// VITE_API_BASE_URL will be used in development (from .env file)
// In production, it might be set during the build process or via environment variables on the server.
// Read API base URL from Vite env (set VITE_API_BASE_URL in Vercel or .env)
// Fallback to localhost for local development
export const API_BASE_URL ="http://localhost:5000";
// Examples for production (keep in Vercel env instead of hardcoding):
// https://crimewise-backend.vercel.app
// https://crimewise-web-v2-ri4n.vercel.app

// Helper function to build API URLs
export const getApiUrl = (
  endpoint: string,
  p0: { method: string; headers: { "Content-Type": string }; body: string }
): string => {
  // Make sure endpoint starts with a slash
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
};
