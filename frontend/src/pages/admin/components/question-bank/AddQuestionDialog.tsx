import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCurrentUser,
  uploadImage,
  addQuestion,
  isForensicScienceRelated,
  scoreExplanation,
} from "./utils";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Settings, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import KeywordPoolManager from "./KeywordPoolManager";

interface AddQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  courses: any[];
  onQuestionAdded: () => void;
}

const AddQuestionDialog: React.FC<AddQuestionDialogProps> = ({
  isOpen,
  onOpenChange,
  courses,
  onQuestionAdded,
}) => {
  const [form, setForm] = useState({
    title: "",
    text: "",
    course: "",
    difficulty: "medium",
  });
  const [answerKey, setAnswerKey] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [questionImageFiles, setQuestionImageFiles] = useState<File[]>([]);
  const [standardImageFiles, setStandardImageFiles] = useState<File[]>([]);
  const [questionPreviews, setQuestionPreviews] = useState<string[]>([]);
  const [standardPreviews, setStandardPreviews] = useState<string[]>([]);
  const [forensicAnswerRows, setForensicAnswerRows] = useState([
    { questionSpecimen: "", standardSpecimen: "", points: 1, pointType: "each" },
  ]);
  const [explanation, setExplanation] = useState("");
  const [explanationPoints, setExplanationPoints] = useState(1);
  const [rubrics, setRubrics] = useState({ accuracy: 40, completeness: 30, clarity: 20, objectivity: 10 });
  const [forensicConclusion, setForensicConclusion] = useState<
    "fake" | "real" | ""
  >("");
  const [selectedKeywordPool, setSelectedKeywordPool] = useState<any>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isKeywordPoolManagerOpen, setIsKeywordPoolManagerOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const questionImageInputRef = useRef<HTMLInputElement>(null);
  const standardImageInputRef = useRef<HTMLInputElement>(null);

  const handleFormChange = (field: string, value: string) => {
    setForm({ ...form, [field]: value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: "question" | "standard") => {
    const MAX_FILES = 15;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ["image/png", "image/jpeg"];

    if (!e.target.files) return;

    const incoming = Array.from(e.target.files);
    const current = target === "question" ? questionImageFiles : standardImageFiles;
    const remaining = Math.max(0, MAX_FILES - current.length);

    const validated: File[] = [];

    for (const file of incoming) {
      if (validated.length >= remaining) break;

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a PNG or JPEG image.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 10MB size limit.`,
          variant: "destructive",
        });
        continue;
      }
      validated.push(file);
    }

    if (validated.length > 0) {
      if (target === "question") {
        setQuestionImageFiles((prev) => {
          const next = [...prev, ...validated];
          // create previews
          setQuestionPreviews((p) => {
            const newPreviews = validated.map((f) => URL.createObjectURL(f));
            return [...p, ...newPreviews];
          });
          // Ensure there are at least as many forensic answer rows as question images
          setForensicAnswerRows((rows) => {
            const needed = next.length - rows.length;
            if (needed <= 0) return rows;
            const lastPoints = rows.length > 0 ? rows[rows.length - 1].points : 1;
            const additions = Array.from({ length: needed }).map(() => ({ questionSpecimen: "", standardSpecimen: "", points: lastPoints }));
            return [...rows, ...additions];
          });
          return next;
        });
      } else {
        setStandardImageFiles((prev) => {
          const next = [...prev, ...validated];
          setStandardPreviews((p) => {
            const newPreviews = validated.map((f) => URL.createObjectURL(f));
            return [...p, ...newPreviews];
          });
          return next;
        });
      }
    }
  };
  const handleRemoveImage = (index: number, type: "question" | "standard") => {
    // remove image by type
    if (type === "question") {
      setQuestionImageFiles((prev) => {
        try { URL.revokeObjectURL(questionPreviews[index]); } catch (e) {}
        setQuestionPreviews((p) => p.filter((_, i) => i !== index));
        // also remove corresponding forensic answer row if present
        setForensicAnswerRows((rows) => rows.filter((_, i) => i !== index));
        return prev.filter((_, i) => i !== index);
      });
    } else if (type === "standard") {
      setStandardImageFiles((prev) => {
        try { URL.revokeObjectURL(standardPreviews[index]); } catch (e) {}
        setStandardPreviews((p) => p.filter((_, i) => i !== index));
        return prev.filter((_, i) => i !== index);
      });
    }
  };

  const handleClearImages = () => {
    setQuestionImageFiles([]);
    setStandardImageFiles([]);
    questionPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    standardPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    setQuestionPreviews([]);
    setStandardPreviews([]);
    if (questionImageInputRef.current) questionImageInputRef.current.value = "";
    if (standardImageInputRef.current) standardImageInputRef.current.value = "";
    // reset forensic rows to a single default row when clearing images
    setForensicAnswerRows([{ questionSpecimen: "", standardSpecimen: "", points: 1, pointType: "each" }]);
  };

  const handleForensicRowChange = (
    idx: number,
    field: string,
    value: string | number
  ) => {
    setForensicAnswerRows((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleAddForensicRow = () => {
    // Don't sync rows to image count. Rows are independent from images.
    // Users can have more rows than question images, or vice versa.
    const lastRowPoints =
      forensicAnswerRows.length > 0
        ? forensicAnswerRows[forensicAnswerRows.length - 1].points
        : 1;
    const lastRowPointType =
      forensicAnswerRows.length > 0
        ? forensicAnswerRows[forensicAnswerRows.length - 1].pointType
        : "each";

    setForensicAnswerRows((rows) => [
      ...rows,
      { questionSpecimen: "", standardSpecimen: "", points: lastRowPoints, pointType: lastRowPointType },
    ]);
  };

  const handleRemoveForensicRow = (idx: number) => {
    setForensicAnswerRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setForm({
      title: "",
      text: "",
      course: "",
      difficulty: "medium",
    });
    setAnswerKey("");
    setImageFiles([]);
    // clear question/standard images and revoke previews
    questionPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    standardPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    setQuestionImageFiles([]);
    setStandardImageFiles([]);
    setQuestionPreviews([]);
    setStandardPreviews([]);
    setForensicAnswerRows([
      { questionSpecimen: "", standardSpecimen: "", points: 1, pointType: "each" },
    ]);
    setExplanation("");
    setExplanationPoints(1);
    setForensicConclusion("");
    setSelectedKeywordPool(null);
    setSelectedKeywords([]);
  };

  const handleAddQuestion = async () => {
    if (!form.title || !form.course || !form.difficulty) {
      toast({
        title: "Validation Error",
        description: "Title, course, and difficulty are required.",
        variant: "destructive",
      });
      return;
    }

    // Validate forensic conclusion and explanation
    if (explanation.trim() && !forensicConclusion) {
      toast({
        title: "Validation Error",
        description:
          "Please select whether the specimen is written by the same person when providing an explanation.",
        variant: "destructive",
      });
      return;
    }

    if (forensicConclusion && !explanation.trim()) {
      toast({
        title: "Validation Error",
        description:
          "Please provide an explanation when selecting a forensic conclusion.",
        variant: "destructive",
      });
      return;
    }

    // Check if explanation is forensic science related
    if (explanation.trim() && !isForensicScienceRelated(explanation)) {
      toast({
        title: "Warning",
        description:
          "The explanation should be related to forensic science analysis. Please review your explanation.",
        variant: "destructive",
      });
      // Don't return here, just warn the user
    }

    // Handle multiple image uploads sequentially to reduce memory pressure
    // NOTE: we upload standard specimen images first, then questioned specimen images
    const questionUrls: string[] = [];
    const standardUrls: string[] = [];

    if (standardImageFiles.length > 0) {
      console.log(`[Questions] Starting upload of ${standardImageFiles.length} standard specimen image(s)`);
      for (let i = 0; i < standardImageFiles.length; i++) {
        const file = standardImageFiles[i];
        try {
          console.log(`[Questions] Uploading standard image ${i + 1}/${standardImageFiles.length}: ${file.name}`);
          const url = await new Promise<string>((resolve, reject) => {
            uploadImage(file, resolve, reject);
          });
          standardUrls.push(url);
          console.log(`[Questions] Successfully uploaded standard image ${i + 1}/${standardImageFiles.length}`);
        } catch (err: any) {
          const errorMessage = err?.message || "Unknown error occurred";
          toast({
            title: "Upload Failed",
            description: `Failed to upload "${file.name}": ${errorMessage}`,
            variant: "destructive",
          });
          console.error(`[Questions][Upload] Error uploading ${file.name}:`, err);
          return; // abort adding the question
        }
      }
    }

    if (questionImageFiles.length > 0) {
      console.log(`[Questions] Starting upload of ${questionImageFiles.length} question specimen image(s)`);
      for (let i = 0; i < questionImageFiles.length; i++) {
        const file = questionImageFiles[i];
        try {
          console.log(`[Questions] Uploading question image ${i + 1}/${questionImageFiles.length}: ${file.name}`);
          const url = await new Promise<string>((resolve, reject) => {
            uploadImage(file, resolve, reject);
          });
          questionUrls.push(url);
          console.log(`[Questions] Successfully uploaded question image ${i + 1}/${questionImageFiles.length}`);
        } catch (err: any) {
          const errorMessage = err?.message || "Unknown error occurred";
          toast({
            title: "Upload Failed",
            description: `Failed to upload "${file.name}": ${errorMessage}`,
            variant: "destructive",
          });
          console.error(`[Questions][Upload] Error uploading ${file.name}:`, err);
          return; // abort adding the question
        }
      }
    }

    // Store standard images first, followed by question images (new convention)
    const allUrls = [...standardUrls, ...questionUrls];
    const combined = allUrls.length > 0 ? allUrls.join("|") : "";
    finalizeQuestionSubmission(combined);
  };

  const finalizeQuestionSubmission = (imageUrl: string) => {
    // Create the answer data with specimens and explanation
    // IMPORTANT: Track the number of question images so TakeExam can correctly split them later
    const answerData = {
      specimens: forensicAnswerRows.map((row) => ({
        questionSpecimen: row.questionSpecimen,
        standardSpecimen: row.standardSpecimen,
        points: Number(row.points) || 1,
        pointType: row.pointType || "each",
      })),
      explanation: {
        text: explanation,
        points: Number(explanationPoints) || 0,
        conclusion: forensicConclusion,
      },
      keywordPool: selectedKeywordPool ? {
        id: selectedKeywordPool.id,
        name: selectedKeywordPool.name,
        selectedKeywords: selectedKeywords,
      } : null,
      // Store counts so TakeExam knows the correct image split
      // (since row count is independent from image count)
      imageMetadata: {
        standardImageCount: standardImageFiles.length,
        questionImageCount: questionImageFiles.length,
      },
    };

    // Stringify the complete answer structure
    const answer = JSON.stringify(answerData);

    // Get current user from token to record as creator
    const currentUser = getCurrentUser();

    // Calculate total points including both specimens and explanation
    const totalPoints =
      forensicAnswerRows.reduce(
        (sum, row) => sum + (Number(row.points) || 1),
        0
      ) + (Number(explanationPoints) || 0);

    const payload = {
      title: form.title,
      text: form.text,
      course_id: form.course,
      difficulty: form.difficulty,
      type: "forensic",
      answer,
      image: imageUrl,
      points: totalPoints,
      created_by: currentUser?.id, // Include the current user's ID
      explanation: explanation, // Add explanation as a separate field for direct access
      explanation_points: Number(explanationPoints) || 0, // Add explanation points separately
      rubrics: JSON.stringify(rubrics),
      keyword_pool_id: selectedKeywordPool?.id || null,
      selected_keywords: selectedKeywords.length > 0 ? selectedKeywords : null,
    };

    addQuestion(
      payload,
      () => {
        toast({
          title: "Success",
          description: "Question added successfully.",
        });
        resetForm();
        onOpenChange(false);
        onQuestionAdded();
      },
      (err) => {
        toast({
          title: "Error",
          description: err.message || "Failed to add question.",
          variant: "destructive",
        });
        console.error("[Questions][Add] Error:", err);
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Question</DialogTitle>
          <DialogDescription>
            Create a new question for the examination system.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="course">Course</Label>
            <Select
              value={form.course}
              onValueChange={(v) => handleFormChange("course", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Question Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => handleFormChange("title", e.target.value)}
              placeholder="Enter a title for your question"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="question-text">Question Text</Label>
            <Textarea
              id="question-text"
              value={form.text}
              onChange={(e) => handleFormChange("text", e.target.value)}
              placeholder="Enter the full question text here..."
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Standard Specimen Images</Label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              multiple
              ref={standardImageInputRef}
              onChange={(e) => handleImageChange(e, "standard")}
            />
            {standardImageFiles.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Standard Specimens ({standardImageFiles.length})
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={handleClearImages}>Clear All</Button>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {standardPreviews.map((url, index) => (
                    <div key={index} className="p-1 border rounded flex flex-col items-center">
                      <img src={url} alt={`s-${index}`} className="h-20 object-contain mb-1" />
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, "standard")}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="space-y-2">
            <Label>Question Specimen Images</Label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              multiple
              ref={questionImageInputRef}
              onChange={(e) => handleImageChange(e, "question")}
            />
            {questionImageFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Question Specimens ({questionImageFiles.length})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearImages}
                  >
                    Clear All
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {questionPreviews.map((url, index) => (
                    <div key={index} className="p-1 border rounded flex flex-col items-center">
                      <img src={url} alt={`q-${index}`} className="h-20 object-contain mb-1" />
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, "question")}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <Select
              value={form.difficulty}
              onValueChange={(v) => handleFormChange("difficulty", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Keyword Pool (Optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/keyword-pools')}
                className="flex items-center gap-1"
              >
                <Settings className="h-4 w-4" />
                Manage Pools
              </Button>
            </div>
            
            {selectedKeywordPool ? (
              <div className="border rounded-lg p-3 bg-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {selectedKeywordPool.name}
                    </h4>
                    {selectedKeywordPool.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedKeywordPool.description}
                      </p>
                    )}
                    <div className="mt-2">
                      <div className="text-sm font-medium mb-2">Selected Keywords:</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedKeywords.map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-gray-200 text-gray-800 text-xs rounded-full flex items-center gap-1"
                          >
                            {keyword}
                            <button
                              onClick={() => {
                                setSelectedKeywords(selectedKeywords.filter(k => k !== keyword));
                              }}
                              className="ml-1 hover:text-red-500"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="text-sm font-medium mb-2">Available Keywords:</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedKeywordPool.keywords
                          .filter(keyword => !selectedKeywords.includes(keyword))
                          .map((keyword, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setSelectedKeywords([...selectedKeywords, keyword]);
                              }}
                              className="px-2 py-1 bg-gray-300 text-gray-800 text-xs rounded-full hover:bg-gray-400"
                            >
                              + {keyword}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedKeywordPool(null);
                      setSelectedKeywords([]);
                    }}
                    className="text-gray-500 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsKeywordPoolManagerOpen(true)}
                  className="flex-1"
                >
                  Select Keyword Pool
                </Button>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground">
              Select a keyword pool to provide predefined keywords for answer evaluation.
              You can choose specific keywords from the pool to use for this question.
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Answer Key Table</Label>
              <div className="text-sm text-muted-foreground">
                Total Points:{" "}
                {forensicAnswerRows.reduce((sum, row) => {
                  const rowPoints = Number(row.points) || 1;
                  const pointType = row.pointType || "both";
                  // For "each" type, we need to estimate columns (typically 2: questionSpecimen, standardSpecimen, plus user inputs)
                  // We'll use a conservative estimate of 1 column minimum
                  if (pointType === "each") {
                    return sum + (rowPoints * 2); // Multiply by 2 for typical comparison (question vs standard)
                  } else {
                    return sum + rowPoints;
                  }
                }, 0)}
              </div>
            </div>

            <div className="max-h-[300px] overflow-auto border rounded-md">
              <table className="w-full border text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="border p-2 w-12">#</th>
                    <th className="border p-2">Question Specimen</th>
                    <th className="border p-2">Standard Specimen</th>
                    <th className="border p-2 w-24">Points</th>
                    <th className="border p-2 w-32">Point Type</th>
                    <th className="border p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forensicAnswerRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border p-2 text-center font-medium">
                        {idx + 1}
                      </td>
                      <td className="border p-2">
                        <input
                          className="w-full border px-2 py-1"
                          value={row.questionSpecimen}
                          onChange={(e) =>
                            handleForensicRowChange(
                              idx,
                              "questionSpecimen",
                              e.target.value
                            )
                          }
                          placeholder="Question Specimen"
                          title="Question Specimen"
                        />
                      </td>
                      <td className="border p-2">
                        <input
                          className="w-full border px-2 py-1"
                          value={row.standardSpecimen}
                          onChange={(e) =>
                            handleForensicRowChange(
                              idx,
                              "standardSpecimen",
                              e.target.value
                            )
                          }
                          placeholder="Standard Specimen"
                          title="Standard Specimen"
                        />
                      </td>
                      <td className="border p-2">
                        <input
                          className="w-full border px-2 py-1 text-center"
                          type="number"
                          min={1}
                          value={row.points}
                          onChange={(e) =>
                            handleForensicRowChange(
                              idx,
                              "points",
                              Number(e.target.value)
                            )
                          }
                          placeholder="Points"
                          title="Points for this row"
                        />
                      </td>
                      <td className="border p-2">
                        <select
                          className="w-full border px-2 py-1 text-xs"
                          value={row.pointType || "both"}
                          onChange={(e) =>
                            handleForensicRowChange(
                              idx,
                              "pointType",
                              e.target.value
                            )
                          }
                          title="each = points per correct answer, both = points only if all answers correct"
                        >
                          <option value="each">for each correct</option>
                          <option value="both">if both correct</option>
                        </select>
                      </td>
                      <td className="border p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveForensicRow(idx)}
                          disabled={forensicAnswerRows.length === 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddForensicRow}
              className="flex items-center gap-1 mt-2"
            >
              <PlusCircle className="h-4 w-4" /> Add Row
            </Button>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Rubric Weights (editable)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Accuracy (%)</Label>
                <Input type="number" min={0} max={100} value={rubrics.accuracy} onChange={e => setRubrics({ ...rubrics, accuracy: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-sm">Completeness (%)</Label>
                <Input type="number" min={0} max={100} value={rubrics.completeness} onChange={e => setRubrics({ ...rubrics, completeness: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-sm">Clarity (%)</Label>
                <Input type="number" min={0} max={100} value={rubrics.clarity} onChange={e => setRubrics({ ...rubrics, clarity: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-sm">Objectivity (%)</Label>
                <Input type="number" min={0} max={100} value={rubrics.objectivity} onChange={e => setRubrics({ ...rubrics, objectivity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Sum of rubric weights should ideally equal 100. These weights will be used by the AI grader.</div>
            <div className="flex items-center justify-between">
              <Label htmlFor="explanation">Explanation</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="explanation-points" className="text-sm">
                  Points:
                </Label>
                <Input
                  id="explanation-points"
                  type="number"
                  min={0}
                  className="w-20 h-8"
                  value={explanationPoints}
                  onChange={(e) => setExplanationPoints(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Forensic Conclusion</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={
                    forensicConclusion === "fake" ? "default" : "outline"
                  }
                  onClick={() => setForensicConclusion("fake")}
                  className="flex-1"
                >
                  Not Written by Same Person
                </Button>
                <Button
                  type="button"
                  variant={
                    forensicConclusion === "real" ? "default" : "outline"
                  }
                  onClick={() => setForensicConclusion("real")}
                  className="flex-1"
                >
                  Written by Same Person
                </Button>
              </div>
            </div>

            <Textarea
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Enter an explanation for the table comparison..."
              rows={4}
            />
            <div className="text-sm text-muted-foreground">
              Select the main conclusion and add an explanation. The system will
              check if the explanation is related to forensic science.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAddQuestion}>
            Save Question
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <KeywordPoolManager
        isOpen={isKeywordPoolManagerOpen}
        onOpenChange={setIsKeywordPoolManagerOpen}
        onPoolSelected={(pool) => {
          setSelectedKeywordPool(pool);
          // Initially select all keywords, user can modify later
          setSelectedKeywords([...pool.keywords]);
        }}
        selectMode={true}
      />
    </Dialog>
  );
};

export default AddQuestionDialog;
