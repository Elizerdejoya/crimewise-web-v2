import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";

// Helper function to create auth headers
import { authenticatedFetch } from "@/lib/auth";

const EnterExam = () => {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleValidateToken = async () => {
    setIsValidating(true);
    setError("");
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/exams/token/${token}`);

      if (!res.ok) {
        const errorData = await res.json();
        const errorMessage = errorData.error || "Invalid exam token. Please check and try again.";
        setError(errorMessage);
        
        // Show specific error messages for different types of access denial
        let toastTitle = "Access Denied";
        let toastDescription = errorMessage;
        
        if (errorMessage.includes("active exam session")) {
          toastTitle = "Active Exam Session";
          toastDescription = "You already have an exam in progress. You must complete or let it expire before starting another exam.";
        } else if (errorMessage.includes("class") && errorMessage.includes("enrolled")) {
          toastTitle = "Class Restriction";
          toastDescription = "This exam is restricted to a specific class. You are not enrolled in the required class for this exam.";
        } else if (errorMessage.includes("organization")) {
          toastTitle = "Organization Mismatch";
          toastDescription = "This exam belongs to a different organization.";
        } else if (errorMessage.includes("subscription")) {
          toastTitle = "Subscription Expired";
          toastDescription = "Your organization's subscription has expired. Please contact your administrator.";
        } else {
          toastTitle = "Invalid Token";
          toastDescription = "The exam token you entered is not valid or you don't have access to this exam.";
        }
        
        toast({
          title: toastTitle,
          description: toastDescription,
          variant: "destructive",
        });
        setIsValidating(false);
        return;
      }
      const exam = await res.json();
      const now = new Date();
      // Parse times as-is (they're in server timezone which matches your local timezone now)
      const start = new Date(exam.start);
      const end = new Date(exam.end);
      
      if (now < start) {
        setError("This exam has not started yet.");
        toast({
          title: "Exam Not Started",
          description: `The exam will be available at ${start.toLocaleString()}`,
          variant: "destructive",
        });
      } else if (now > end) {
        setError("This exam has already ended.");
        toast({
          title: "Exam Ended",
          description: "The submission window for this exam has closed.",
          variant: "destructive",
        });
      } else {
        // Check if student has already taken this exam
        try {
          const authToken = localStorage.getItem("token");
          if (!authToken) {
            navigate("/login");
            return;
          }

          const decoded = jwtDecode<JwtTokenPayload>(authToken);
          const studentId = decoded.id;

          // Check if this student already has results for this exam
          const resultsRes = await authenticatedFetch(
            `${API_BASE_URL}/api/exams/student/${studentId}/results`
          );

          const studentResults = await resultsRes.json();

          // Find if any result matches the current exam ID
          const alreadyTaken = studentResults.some(
            (result: any) => result.exam_id === exam.id
          );

          if (alreadyTaken) {
            setError("You have already taken this exam.");
            toast({
              title: "Exam Already Taken",
              description:
                "You cannot retake an exam you have already submitted.",
              variant: "destructive",
            });
            setIsValidating(false);
            return;
          }

          // If not taken yet, proceed to the exam
          toast({
            title: "Token Valid",
            description: "Starting your exam...",
          });

          // Store exam info in sessionStorage for TakeExam page
          sessionStorage.setItem("currentExam", JSON.stringify(exam));

          // Navigate to the exam in the same tab
          navigate("/student/take-exam");
        } catch (err) {
          console.error("Error checking exam results:", err);
          setError("Error checking your previous exam results.");
          toast({
            title: "Error",
            description: "Could not verify your previous exam attempts.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      setError("Server error. Please try again later.");
      toast({
        title: "Error",
        description: "Could not validate the exam token.",
        variant: "destructive",
      });
    }
    setIsValidating(false);
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <Card className="border-0 shadow-md rounded-lg overflow-hidden">
            <CardHeader className="bg-sidebar pb-6 pt-6 px-6">
              <CardTitle className="text-xl text-sidebar-foreground">Enter Exam</CardTitle>
              <CardDescription className="text-sidebar-foreground/70 text-sm mt-1">
                Input your exam token to access your exam
              </CardDescription>
            </CardHeader>
            
            <CardContent className="p-6 space-y-5">
              {/* Token Input */}
              <div className="space-y-2">
                <Label htmlFor="exam-token" className="text-sm font-semibold text-gray-800">
                  Exam Token
                </Label>
                <Input
                  id="exam-token"
                  placeholder="ABC123"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  className="h-10 text-center text-lg tracking-widest uppercase font-semibold border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 text-center">
                  Token is case-insensitive
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              {/* Guidelines */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-gray-900 text-sm mb-3">Before You Start</h4>
                <ul className="space-y-2 text-xs text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Complete the exam within the time limit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Timer cannot be paused once started</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Ensure stable internet connection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Exam auto-submits when time expires</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Cannot retake once submitted</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                    <span>Do not use browser back button</span>
                  </li>
                </ul>
              </div>
            </CardContent>

            <CardFooter className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <Button
                className="w-full h-9 text-sm font-semibold rounded-md bg-sidebar hover:bg-sidebar/90 text-sidebar-foreground shadow transition-all duration-200"
                onClick={handleValidateToken}
                disabled={!token || isValidating}
              >
                {isValidating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-sidebar-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                    Validating...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Start Exam
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default EnterExam;
