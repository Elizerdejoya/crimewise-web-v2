import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Title mapping configuration
const TITLE_MAP: Record<string, string> = {
  // Public routes
  '/': 'CrimeWise - Home',
  '/login': 'CrimeWise - Login',
  '/contact': 'CrimeWise - Contact',
  
  // Admin routes
  '/admin': 'CrimeWise - Admin Dashboard',
  '/admin/profile': 'CrimeWise - Admin Profile',
  '/admin/questions': 'CrimeWise - Question Bank',
  '/admin/batches': 'CrimeWise - Batches',
  '/admin/classes': 'CrimeWise - Classes',
  '/admin/courses': 'CrimeWise - Courses',
  '/admin/relations': 'CrimeWise - Relations',
  '/admin/instructors': 'CrimeWise - Instructors',
  '/admin/students': 'CrimeWise - Students',
  '/admin/users': 'CrimeWise - Users',
  '/admin/ai-assistant': 'CrimeWise - AI Assistant',
  '/admin/organizations': 'CrimeWise - Organizations',
  '/admin/subscriptions': 'CrimeWise - Subscriptions',
  
  // Instructor routes
  '/instructor': 'CrimeWise - Instructor Dashboard',
  '/instructor/profile': 'CrimeWise - Instructor Profile',
  '/instructor/ai-assistant': 'CrimeWise - AI Assistant',
  '/instructor/create-exam': 'CrimeWise - Create Exam',
  '/instructor/questions': 'CrimeWise - Question Bank',
  '/instructor/results': 'CrimeWise - Exam Results',
  '/instructor/exams/:examId/details': 'CrimeWise - Exam Details',
  '/instructor/exams/:examId/pdf': 'CrimeWise - Exam PDF',
  
  // Student routes
  '/student': 'CrimeWise - Student Dashboard',
  '/student/profile': 'CrimeWise - Student Profile',
  '/student/ai-assistant': 'CrimeWise - AI Assistant',
  '/student/exams': 'CrimeWise - Available Exams',
  '/student/take-exam': 'CrimeWise - Take Exam',
  '/student/results': 'CrimeWise - Results',
};

// Function to match dynamic routes
const matchDynamicRoute = (pathname: string): string | null => {
  // Check for dynamic routes with parameters
  const dynamicRoutes = [
    '/instructor/exams/:examId/details',
    '/instructor/exams/:examId/pdf'
  ];
  
  for (const route of dynamicRoutes) {
    const routePattern = route.replace(':examId', '[^/]+');
    const regex = new RegExp(`^${routePattern}$`);
    if (regex.test(pathname)) {
      return route;
    }
  }
  
  return null;
};

export const useDocumentTitle = () => {
  const location = useLocation();
  
  useEffect(() => {
    const pathname = location.pathname;
    
    // First try exact match
    let title = TITLE_MAP[pathname];
    
    // If no exact match, try dynamic route matching
    if (!title) {
      const dynamicRoute = matchDynamicRoute(pathname);
      if (dynamicRoute) {
        title = TITLE_MAP[dynamicRoute];
      }
    }
    
    // Fallback title if no match found
    if (!title) {
      title = 'CrimeWise - Page Not Found';
    }
    
    // Update document title
    document.title = title;
  }, [location.pathname]);
};

export default useDocumentTitle;
