// Configuration for environment variables and API URLs

// Use Vite's import.meta.env for environment variables
// VITE_API_BASE_URL will be used in development (from .env file)
// In production, it might be set during the build process or via environment variables on the server.
// export const API_BASE_URL = "http://localhost:5000";
// export const API_BASE_URL = "https://crimewise-backend.vercel.app";
export const API_BASE_URL = "https://crimewise-web-v2-ri4n.vercel.app";
// "https://crimewisesys-yelj.vercel.app"; // Replace with your production URL

// Helper function to build API URLs
export const getApiUrl = (
  endpoint: string,
  p0: { method: string; headers: { "Content-Type": string }; body: string }
): string => {
  // Make sure endpoint starts with a slash
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
};
