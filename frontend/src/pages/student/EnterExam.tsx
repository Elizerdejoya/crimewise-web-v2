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
        
        if (errorMessage.includes("class") && errorMessage.includes("enrolled")) {
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
      const start = new Date(exam.start);
      const end = new Date(exam.end);
      if (now < start) {
        setError("This exam has not started yet.");
        toast({
          title: "Exam Not Started",
          description: `The exam will be available at ${start.toLocaleTimeString()}`,
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
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Enter Exam</h2>
          <p className="text-muted-foreground">
            Enter the token provided by your instructor to access your exam
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Exam Access</CardTitle>
            <CardDescription>
              You will need the exam token from your instructor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exam-token">Exam Token</Label>
              <Input
                id="exam-token"
                placeholder="Enter token (e.g., ABC123)"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                className="text-center text-lg tracking-wider uppercase"
              />
              <p className="text-xs text-muted-foreground text-center">
                The token is case-insensitive
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 p-3 rounded-md flex items-center text-sm">
                <AlertCircle className="h-4 w-4 mr-2 text-destructive" />
                <span className="text-destructive">{error}</span>
              </div>
            )}

            <div className="rounded-md bg-muted p-3">
              <h4 className="text-sm font-medium mb-2">Important Information</h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>You must complete the exam within the designated time limit</li>
                <li>Once you start, the timer cannot be paused</li>
                <li>
                  Ensure you have a stable internet connection before starting
                </li>
                <li>
                  The system will automatically submit your exam when the time expires
                </li>
                <li>You cannot retake an exam once it has been submitted</li>
                <li>
                  Do not use the browser back button during the exam
                </li>
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={handleValidateToken}
              disabled={!token || isValidating}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              {isValidating ? "Validating..." : "Start Exam"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EnterExam;
