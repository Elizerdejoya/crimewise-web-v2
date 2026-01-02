import { useEffect, useState, useRef } from "react";
import { jwtDecode } from "jwt-decode";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Calendar, Clock, Copy, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Loading from "@/components/ui/Loading";
import { API_BASE_URL } from "@/lib/config";

// Get current user from localStorage
const getCurrentUser = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch (e) {
    return null;
  }
};

// Create auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

const CreateExam = () => {
  const [examName, setExamName] = useState("");
  const [course, setCourse] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const tokenDisplayRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const instructorId = currentUser.id;

    // Fetch assigned courses
    fetch(`${API_BASE_URL}/api/relations/instructor-course`, {
      headers: getAuthHeaders(),
    })
      .then(res => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return [];
        }
        return res.json();
      })
      .then(data => setCourses(data.filter((c: any) => c.instructor_id === instructorId)))
      .catch(err => console.error('Error fetching courses:', err));

    // Fetch classes taught by instructor
    fetch(`${API_BASE_URL}/api/relations/class-instructor`, {
      headers: getAuthHeaders(),
    })
      .then(res => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return [];
        }
        return res.json();
      })
      .then(data => setClasses(data.filter((c: any) => c.instructor_id === instructorId)))
      .catch(err => console.error('Error fetching classes:', err));

    // Fetch only questions created by current instructor
    fetch(`${API_BASE_URL}/api/questions`, {
      headers: getAuthHeaders(),
    })
      .then(res => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return [];
        }
        return res.json();
      })
      .then(data => setQuestions(data)) // Backend now filters by instructor automatically
      .catch(err => console.error('Error fetching questions:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerateExam = async () => {
    if (!examName || !course || !selectedClass || !startDate || !startTime || !endDate || !endTime || !duration || !selectedQuestion) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      toast({ title: "Authentication Error", description: "Please log in again.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    const instructorId = currentUser.id;
    const payload = {
      name: examName,
      course_id: course,
      class_id: selectedClass,
      instructor_id: instructorId,
      start: `${startDate}T${startTime}`,
      end: `${endDate}T${endTime}`,
      duration,
      question_id: selectedQuestion,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/exams`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setGeneratedToken(data.token || "");
        toast({ title: "Exam Created Successfully", description: "The exam token has been generated." });
        
        // Scroll to token display
        setTimeout(() => {
          tokenDisplayRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
        
        // Reset form fields after successful creation
        setExamName("");
        setCourse("");
        setSelectedClass("");
        setStartDate("");
        setStartTime("");
        setEndDate("");
        setEndTime("");
        setDuration("");
        setSelectedQuestion("");
        
        setIsGenerating(false);
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to create exam.", variant: "destructive" });
        setIsGenerating(false);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to create exam.", variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(generatedToken);
    toast({
      title: "Token Copied",
      description: "Exam token copied to clipboard.",
    });
  };

  if (loading) return <Loading fullScreen message="Loading resources..." />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Exam</h2>
          <p className="text-muted-foreground">
            Set up a new examination for your students
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Exam Details</CardTitle>
              <CardDescription>
                Enter the details for this examination
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exam-name">Exam Name</Label>
                <Input
                  id="exam-name"
                  placeholder="e.g., Midterm Forensic Biology"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="course">Course</Label>
                  <Select value={course} onValueChange={setCourse}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.course_id} value={String(c.course_id)}>
                          {c.course || c.course_name || c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="class">Class</Label>
                  <Select value={selectedClass} onValueChange={setSelectedClass}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.class_id} value={String(c.class_id)}>
                          {c.class || c.class_id || c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ This exam will be restricted to students enrolled in the selected class only
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date & Time</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        className="pl-8"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        className="pl-8"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>End Date & Time</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        className="pl-8"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="time"
                        className="pl-8"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (MM:SS)</Label>
                <Input
                  id="duration"
                  placeholder="e.g., 45:00"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select Question</CardTitle>
              <CardDescription>
                Choose one question for this examination
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions..."
                  className="pl-8"
                />
              </div>

              <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 ${selectedQuestion === question.id ? "bg-primary/10" : ""
                      }`}
                    onClick={() => setSelectedQuestion(question.id)}
                  >
                    <div>
                      <p className="font-medium">{question.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {question.type} • {question.course}
                      </p>
                    </div>
                    <div className="h-4 w-4 rounded-full border flex items-center justify-center">
                      {selectedQuestion === question.id && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={handleGenerateExam} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate Exam"}
              </Button>
            </CardFooter>
          </Card>

          {generatedToken && (
            <Card className="border-primary/50" ref={tokenDisplayRef}>
              <CardHeader className="bg-primary/5">
                <CardTitle className="text-primary">Exam Token Generated</CardTitle>
                <CardDescription>
                  Share this token with your students to provide access to the exam
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <div className="bg-muted p-4 rounded-md text-center flex-1">
                    <p className="text-sm text-muted-foreground mb-2">Exam Token</p>
                    <p className="text-2xl font-mono tracking-wider">{generatedToken}</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={handleCopyToken}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-amber-800 text-sm">
                    Important: This token is required for students to access the exam.
                    Make sure to share it with your class in a secure manner.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateExam;
