import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";

// Function to get the current user from the JWT token
function getCurrentUser() {
  // Get the current user from the JWT token
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return jwtDecode<JwtTokenPayload>(token);
  } catch (e) {
    return null;
  }
}

// Helper function to create auth headers
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

const QuestionBank = () => {
  const [questions, setQuestions] = useState([]);
  const [forensicPoints, setForensicPoints] = useState(1);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [answerKey, setAnswerKey] = useState<any>(null);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [explanationPoints, setExplanationPoints] = useState(0);

  const { toast } = useToast();

  // New question initial state
  const [newQuestion, setNewQuestion] = useState({
    title: "",
    content: "",
    type: "forensic" // Changed default to forensic
  });

  // Load questions created by the current user when component mounts
  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = () => {
    fetch(`${API_BASE_URL}/api/questions`, {
      cache: "no-store",
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
      .then(data => {
        // Backend now filters to only show questions created by this instructor
        setQuestions(data);
      })
      .catch(err => {
        toast({
          title: "Error",
          description: "Failed to fetch questions",
          variant: "destructive",
        });
        console.error("[Questions][Fetch] Error:", err);
      });
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.title || !newQuestion.content) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Get current user from token
    const currentUser = getCurrentUser();

    try {
      const response = await fetch(`${API_BASE_URL}/api/questions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: newQuestion.title,
          text: newQuestion.content,
          course_id: "1", // You might want to add course selection
          difficulty: "medium",
          type: newQuestion.type,
          answer: "",
          created_by: currentUser?.id // Include the current user's ID
        }),
      });

      if (response.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        return;
      }

      if (response.ok) {
        toast({
          title: "Success",
          description: "Question added successfully",
        });
        setNewQuestion({ title: "", content: "", type: "forensic" }); // Reset to default forensic type
        loadQuestions(); // Reload questions to include the new one
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to add question",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      console.error("[Questions][Add] Error:", error);
    }
  };

  const handleEditAnswerKey = (question: any) => {
    setEditingQuestion(question);
    // Parse existing answer key
    try {
      const parsed = JSON.parse(question.answer || "{}");
      if (parsed.specimens) {
        setSpecimens(parsed.specimens);
        setExplanationPoints(parsed.explanation?.points || 0);
      } else {
        setSpecimens([]);
        setExplanationPoints(0);
      }
    } catch (e) {
      setSpecimens([]);
      setExplanationPoints(0);
    }
  };

  const handleAddSpecimen = () => {
    setSpecimens([...specimens, { points: 1, pointType: "both", column1: "", column2: "" }]);
  };

  const handleSpecimenChange = (index: number, field: string, value: any) => {
    const updated = [...specimens];
    updated[index] = { ...updated[index], [field]: value };
    setSpecimens(updated);
  };

  const handleSaveAnswerKey = async () => {
    if (!editingQuestion) return;

    try {
      const answerKeyJson = {
        specimens: specimens,
        explanation: {
          points: explanationPoints,
          conclusion: ""
        }
      };

      const response = await fetch(`${API_BASE_URL}/api/questions/${editingQuestion.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: editingQuestion.title,
          text: editingQuestion.content,
          type: editingQuestion.type,
          answer: JSON.stringify(answerKeyJson),
          difficulty: editingQuestion.difficulty,
          course_id: editingQuestion.course_id,
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Answer key updated successfully",
        });
        setEditingQuestion(null);
        loadQuestions();
      } else {
        toast({
          title: "Error",
          description: "Failed to update answer key",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while saving",
        variant: "destructive",
      });
      console.error(error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Question Bank</h2>
            <p className="text-muted-foreground">
              Manage your examination questions
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Question
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Question</DialogTitle>
                <DialogDescription>
                  Create a new question for your exams
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Question Title</Label>
                  <Input
                    id="title"
                    value={newQuestion.title}
                    onChange={(e) => setNewQuestion({ ...newQuestion, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="content">Instructions</Label>
                  <Textarea
                    id="content"
                    value={newQuestion.content}
                    onChange={(e) => setNewQuestion({ ...newQuestion, content: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddQuestion}>Add Question</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {questions.map((question) => (
            <Card key={question.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-medium">
                  {question.title}
                </CardTitle>
                <div className="flex space-x-2">
                  {question.type === "forensic" && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => handleEditAnswerKey(question)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Answer Key - {editingQuestion?.title}</DialogTitle>
                          <DialogDescription>
                            Configure the specimen table rows with points for each row and column headers
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4">
                          <div>
                            <Label>Explanation/Conclusion Points</Label>
                            <Input
                              type="number"
                              min="0"
                              value={explanationPoints}
                              onChange={(e) => setExplanationPoints(Number(e.target.value))}
                              placeholder="Points for conclusion"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <Label>Table Rows (Specimens)</Label>
                              <Button size="sm" onClick={handleAddSpecimen} className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="h-4 w-4 mr-1" /> Add Row
                              </Button>
                            </div>
                            
                            <div className="space-y-3 border rounded-md p-3">
                              {specimens.map((specimen, idx) => (
                                <div key={idx} className="space-y-2 p-2 border rounded bg-gray-50">
                                  <div className="flex justify-between items-center">
                                    <Label className="font-medium">Row {idx + 1}</Label>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => setSpecimens(specimens.filter((_, i) => i !== idx))}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs">Points for Row</Label>
                                      <Input
                                        type="number"
                                        min="1"
                                        value={specimen.points || 1}
                                        onChange={(e) => handleSpecimenChange(idx, "points", Number(e.target.value))}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Point Type</Label>
                                      <select
                                        className="w-full border rounded px-2 py-1 text-xs"
                                        value={specimen.pointType || "both"}
                                        onChange={(e) => handleSpecimenChange(idx, "pointType", e.target.value)}
                                      >
                                        <option value="both">if both correct</option>
                                        <option value="each">for each correct</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs">Column 1 (e.g., Aspect)</Label>
                                      <Input
                                        value={specimen.column1 || ""}
                                        onChange={(e) => handleSpecimenChange(idx, "column1", e.target.value)}
                                        placeholder="e.g., Aspect"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Column 1 Answer</Label>
                                      <Input
                                        value={specimen.standardSpecimen || specimen.column1Answer || ""}
                                        onChange={(e) => handleSpecimenChange(idx, "standardSpecimen", e.target.value)}
                                        placeholder="Expected answer"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs">Column 2 (e.g., Characteristics)</Label>
                                      <Input
                                        value={specimen.column2 || ""}
                                        onChange={(e) => handleSpecimenChange(idx, "column2", e.target.value)}
                                        placeholder="e.g., Characteristics"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Column 2 Answer</Label>
                                      <Input
                                        value={specimen.questionSpecimen || specimen.column2Answer || ""}
                                        onChange={(e) => handleSpecimenChange(idx, "questionSpecimen", e.target.value)}
                                        placeholder="Expected answer"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button variant="outline" onClick={() => setEditingQuestion(null)}>Cancel</Button>
                          <Button onClick={handleSaveAnswerKey} className="bg-green-600 hover:bg-green-700">Save Answer Key</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Button variant="ghost" size="icon">
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {question.content}
                </p>
                <div className="mt-2">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                    {question.type}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default QuestionBank;
