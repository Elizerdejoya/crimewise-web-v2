import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import TitleManager from "@/components/TitleManager";
import Index from "./pages/Index";
import Login from "./pages/auth/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";
import Contact from "./pages/Contact";
import AIAssistant from "./pages/common/AIAssistant";

// Admin Routes
import AdminDashboard from "./pages/admin/Dashboard";
import AdminProfile from "./pages/admin/Profile";
import QuestionBank from "./pages/admin/QuestionBank";
import Batches from "./pages/admin/Batches";
import Classes from "./pages/admin/Classes";
import Courses from "./pages/admin/Courses";
import Relations from "./pages/admin/Relations";

// Instructor Routes
import InstructorDashboard from "./pages/instructor/Dashboard";
import InstructorProfile from "./pages/instructor/Profile";
import CreateExam from "./pages/instructor/CreateExam";
import ExamResults from "./pages/instructor/ExamResults";

// Student Routes
import StudentDashboard from "./pages/student/Dashboard";
import StudentProfile from "./pages/student/Profile";
import EnterExam from "./pages/student/EnterExam";
import TakeExam from "./pages/student/TakeExam";
import Results from "./pages/student/Results";
import Instructors from "./pages/admin/Instructors";
import Students from "./pages/admin/Students";
import Users from "./pages/admin/Users";
import Organizations from "./pages/admin/Organizations";
import Subscriptions from "./pages/admin/Subscriptions";
import KeywordPools from "./pages/admin/KeywordPools";
import ExamDetails from "./pages/instructor/ExamDetails";
import ExamPdf from "./pages/instructor/ExamPdf";

const queryClient = new QueryClient();

const AppInner = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Global guard: if an exam is in progress, force route to /student/take-exam
  useEffect(() => {
    try {
      const inExam = localStorage.getItem("examInProgress") === "true";
      const isTakeExamPath = location.pathname === "/student/take-exam";
      if (inExam && !isTakeExamPath) {
        navigate("/student/take-exam", { replace: true });
      }
    } catch (e) {
      // ignore
    }
  }, [location.pathname, navigate]);

  return (
    <>
      <TitleManager />
      <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/contact" element={<Contact />} />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <AdminProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/questions"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <QuestionBank />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/batches"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Batches />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/classes"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Classes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/courses"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Courses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/relations"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Relations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/instructors"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Instructors />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Students />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/ai-assistant"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AIAssistant />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/keyword-pools"
            element={
              <ProtectedRoute allowedRoles={["admin", "instructor"]}>
                <KeywordPools />
              </ProtectedRoute>
            }
          />

          {/* Super Admin routes */}
          <Route
            path="/admin/organizations"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <Organizations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <Subscriptions />
              </ProtectedRoute>
            }
          />

          {/* Instructor routes */}
          <Route
            path="/instructor"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <InstructorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/profile"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <InstructorProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/ai-assistant"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <AIAssistant />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/create-exam"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <CreateExam />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/questions"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <QuestionBank />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/results"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <ExamResults />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/exams/:examId/details"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <ExamDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/exams/:examId/pdf"
            element={
              <ProtectedRoute allowedRoles={["instructor"]}>
                <ExamPdf />
              </ProtectedRoute>
            }
          />

          {/* Student routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/profile"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/ai-assistant"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <AIAssistant />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/exams"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <EnterExam />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/take-exam"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <TakeExam />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/results"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <Results />
              </ProtectedRoute>
            }
          />

          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
