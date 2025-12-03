// Define common types used across the application

// JWT payload type for our application
export interface JwtTokenPayload {
  id: string;
  email: string;
  role: string;
  iat?: number;  // Issued at timestamp
  exp?: number;  // Expiration timestamp
}