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
  const [rubrics, setRubrics] = useState({ findingsSimilarity: 70, objectivity: 15, structure: 15 });
  const [forensicConclusion, setForensicConclusion] = useState<
    "fake" | "real" | ""
  >("");
  const [selectedKeywordPool, setSelectedKeywordPool] = useState<any>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isKeywordPoolManagerOpen, setIsKeywordPoolManagerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
            const lastPointType = rows.length > 0 ? rows[rows.length - 1].pointType : "each";
            const additions = Array.from({ length: needed }).map(() => ({ questionSpecimen: "", standardSpecimen: "", points: lastPoints, pointType: lastPointType }));
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
    setRubrics({ findingsSimilarity: 70, objectivity: 15, structure: 15 });
    setForensicConclusion("");
    setSelectedKeywordPool(null);
    setSelectedKeywords([]);
  };

  const handleAddQuestion = async () => {
    setIsSaving(true);
    try {
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
    } finally {
      setIsSaving(false);
    }
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
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add New Question</DialogTitle>
            <DialogDescription>
              Create a forensic question with evidence specimens and grading criteria.
            </DialogDescription>
            </DialogHeader>
          <div className="space-y-6 py-4">
          {/* PART 1: QUESTION BASICS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-blue-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Question Details</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="course" className="text-sm font-medium">Course <span className="text-red-500">*</span></Label>
                <Select
                  value={form.course}
                  onValueChange={(v) => handleFormChange("course", v)}
                >
                  <SelectTrigger className="h-9">
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
                <Label htmlFor="difficulty" className="text-sm font-medium">Difficulty Level <span className="text-red-500">*</span></Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => handleFormChange("difficulty", v)}
                >
                  <SelectTrigger className="h-9">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">Question Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => handleFormChange("title", e.target.value)}
                placeholder="Enter a title for your question"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="question-text" className="text-sm font-medium">Instructions</Label>
              <Textarea
                id="question-text"
                value={form.text}
                onChange={(e) => handleFormChange("text", e.target.value)}
                placeholder="Enter the full question text here..."
                rows={4}
                className="text-sm"
              />
            </div>
          </div>

          {/* PART 2: EVIDENCE MANAGEMENT */}
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-green-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Evidence Specimens</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Standard Specimen Images Column */}
              <div className="space-y-3">
                <div className="bg-green-50 border-2 border-green-500 rounded-lg p-3">
                  <Label className="text-sm font-semibold text-green-900 block mb-3">Standard Specimen Images</Label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    ref={standardImageInputRef}
                    onChange={(e) => handleImageChange(e, "standard")}
                    className="text-xs text-gray-600"
                  />
                  <div className="text-xs text-green-700 mt-2">Max 15 images, 10MB each (PNG/JPEG)</div>
                </div>
                
                {standardImageFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Standard Specimens ({standardImageFiles.length})
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearImages} className="text-red-600 hover:text-red-700 h-7 px-2">Clear</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded border-2 border-gray-400 p-2 bg-gray-50">
                      {standardPreviews.map((url, index) => (
                        <div key={index} className="p-1 bg-white border rounded flex flex-col items-center gap-1">
                          <img src={url} alt={`s-${index}`} className="h-16 object-contain" />
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, "standard")} className="text-xs h-6">Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Question Specimen Images Column */}
              <div className="space-y-3">
                <div className="bg-blue-50 border-2 border-blue-500 rounded-lg p-3">
                  <Label className="text-sm font-semibold text-blue-900 block mb-3">Question Specimen Images</Label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    ref={questionImageInputRef}
                    onChange={(e) => handleImageChange(e, "question")}
                    className="text-xs text-gray-600"
                  />
                  <div className="text-xs text-blue-700 mt-2">Max 15 images, 10MB each (PNG/JPEG)</div>
                </div>
                
                {questionImageFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Question Specimens ({questionImageFiles.length})
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearImages} className="text-red-600 hover:text-red-700 h-7 px-2">Clear</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded border-2 border-gray-400 p-2 bg-gray-50">
                      {questionPreviews.map((url, index) => (
                        <div key={index} className="p-1 bg-white border rounded flex flex-col items-center gap-1">
                          <img src={url} alt={`q-${index}`} className="h-16 object-contain" />
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, "question")} className="text-xs h-6">Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PART 3: ANSWER KEY & GRADING */}
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-purple-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Answer Key</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Define how specimens compare and assign points per row</p>
                <div className="text-sm font-semibold text-purple-600">
                  Total Points: {forensicAnswerRows.reduce((sum, row) => {
                    const rowPoints = Number(row.points) || 1;
                    const pointType = row.pointType || "both";
                    // count columns other than points/pointType to mirror scoring logic in TakeExam
                    const columns = Object.keys(row).filter(col => !["points", "pointType"].includes(col));
                    if (pointType === "each") {
                      return sum + rowPoints * Math.max(1, columns.length);
                    } else {
                      return sum + rowPoints;
                    }
                  }, 0)}
                </div>
              </div>

              <div className="max-h-[280px] overflow-auto border rounded-lg bg-gray-50">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-100 border-b">
                    <tr>
                      <th className="p-3 text-left font-semibold text-gray-700 w-8">#</th>
                      <th className="p-3 text-left font-semibold text-gray-700">Standard Specimen</th>
                      <th className="p-3 text-left font-semibold text-gray-700">Question Specimen</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-20">Points</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-32">Point Type</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forensicAnswerRows.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-white">
                        <td className="p-3 text-center font-medium text-gray-700">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            value={row.standardSpecimen}
                            onChange={(e) => handleForensicRowChange(idx, "standardSpecimen", e.target.value)}
                            placeholder="e.g., slant, pressure"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            value={row.questionSpecimen}
                            onChange={(e) => handleForensicRowChange(idx, "questionSpecimen", e.target.value)}
                            placeholder="e.g., slant, pressure"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full border rounded px-2 py-1 text-center text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                            type="number"
                            min={1}
                            value={row.points}
                            onChange={(e) => handleForensicRowChange(idx, "points", Number(e.target.value))}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            value={row.pointType || "each"}
                            onChange={(e) => handleForensicRowChange(idx, "pointType", e.target.value)}
                          >
                            <option value="each">for each correct</option>
                            <option value="both">if both correct</option>
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveForensicRow(idx)}
                            disabled={forensicAnswerRows.length === 1}
                            className="h-7 text-xs"
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
                className="w-full flex items-center justify-center gap-2 h-9"
              >
                <PlusCircle className="h-4 w-4" /> Add Row
              </Button>

              {/* Keywords Subsection */}
              <div className="space-y-3 border-t pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Keywords (Optional)</h4>
                </div>
                
                {selectedKeywordPool ? (
                  <div className="border rounded-lg p-4 bg-indigo-50 border-indigo-200">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <h5 className="font-semibold text-indigo-900 mb-1">
                          {selectedKeywordPool.name}
                        </h5>
                        {selectedKeywordPool.description && (
                          <p className="text-sm text-gray-600 mb-3">{selectedKeywordPool.description}</p>
                        )}
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs font-semibold text-indigo-900 mb-2">Selected Keywords</div>
                            <div className="flex flex-wrap gap-1">
                              {selectedKeywords.length > 0 ? (
                                selectedKeywords.map((keyword, index) => (
                                  <span key={index} className="px-3 py-1 bg-indigo-200 text-indigo-900 text-xs font-medium rounded-full flex items-center gap-2">
                                    {keyword}
                                    <button onClick={() => setSelectedKeywords(selectedKeywords.filter(k => k !== keyword))} className="hover:text-red-600">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-500 italic">No keywords selected</span>
                              )}
                            </div>
                          </div>
                          {selectedKeywordPool.keywords.filter(k => !selectedKeywords.includes(k)).length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-indigo-900 mb-2">Available Keywords</div>
                              <div className="flex flex-wrap gap-1">
                                {selectedKeywordPool.keywords
                                  .filter(keyword => !selectedKeywords.includes(keyword))
                                  .map((keyword, index) => (
                                    <button
                                      key={index}
                                      onClick={() => setSelectedKeywords([...selectedKeywords, keyword])}
                                      className="px-3 py-1 bg-white border border-indigo-300 text-indigo-700 text-xs font-medium rounded-full hover:bg-indigo-100 transition"
                                    >
                                      + {keyword}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
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
                        className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsKeywordPoolManagerOpen(true)}
                    className="w-full h-9 flex items-center justify-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Select Keyword Pool
                  </Button>
                )}
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  Optionally select keywords to guide answer evaluation and provide expected terminology.
                </div>
              </div>
            </div>
          </div>

          {/* PART 4: GRADING CRITERIA */}
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-amber-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Forensic Conclusion & Explanation</h3>
            </div>
            
            {/* Rubric Weights Subsection */}
            <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold text-amber-900">Rubric Weights (%)</Label>
                <div className={`text-xs font-bold px-2 py-1 rounded ${rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure}% / 100%
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 p-3 bg-white rounded-lg border border-amber-100">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <Label className="text-xs font-semibold text-gray-900">Completeness</Label>
                  </div>
                  <Input 
                    type="number" 
                    min={0} 
                    max={100} 
                    value={rubrics.findingsSimilarity} 
                    onChange={e => setRubrics({ ...rubrics, findingsSimilarity: Number(e.target.value) })} 
                    className="h-8 text-sm font-bold text-center text-blue-600" 
                  />
                  <div className="text-xs text-gray-600">conclusion + keywords</div>
                </div>
                <div className="space-y-2 p-3 bg-white rounded-lg border border-amber-100">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                    <Label className="text-xs font-semibold text-gray-900">Objectivity</Label>
                  </div>
                  <Input 
                    type="number" 
                    min={0} 
                    max={100} 
                    value={rubrics.objectivity} 
                    onChange={e => setRubrics({...rubrics, objectivity: Number(e.target.value)})} 
                    className="h-8 text-sm font-bold text-center text-amber-600" 
                  />
                  <div className="text-xs text-gray-600">no subjective words</div>
                </div>
                <div className="space-y-2 p-3 bg-white rounded-lg border border-amber-100">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <Label className="text-xs font-semibold text-gray-900">Structure</Label>
                  </div>
                  <Input 
                    type="number" 
                    min={0} 
                    max={100} 
                    value={rubrics.structure} 
                    onChange={e => setRubrics({...rubrics, structure: Number(e.target.value)})} 
                    className="h-8 text-sm font-bold text-center text-green-600" 
                  />
                  <div className="text-xs text-gray-600">reasoning words</div>
                </div>
              </div>
            </div>

            {/* Forensic Conclusion & Explanation Subsection */}
            <div className="space-y-3 bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold text-teal-900">Forensic Conclusion & Explanation</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="explanation-points" className="text-xs font-medium text-gray-700">Points:</Label>
                  <Input
                    id="explanation-points"
                    type="number"
                    min={0}
                    className="w-16 h-8 text-center text-xs"
                    value={explanationPoints}
                    onChange={(e) => setExplanationPoints(Number(e.target.value))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700">Conclusion Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={forensicConclusion === "fake" ? "default" : "outline"}
                    onClick={() => setForensicConclusion("fake")}
                    className="flex-1 h-9 text-sm"
                  >
                    Not Written By The Same Person
                  </Button>
                  <Button
                    type="button"
                    variant={forensicConclusion === "real" ? "default" : "outline"}
                    onClick={() => setForensicConclusion("real")}
                    className="flex-1 h-9 text-sm"
                  >
                    Written By The Same Person
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="explanation" className="text-xs font-medium text-gray-700">Expected Explanation</Label>
                <Textarea
                  id="explanation"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Enter expected evidence, findings, or key phrases to look for..."
                  rows={3}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!isSaving) {
                resetForm();
                onOpenChange(false);
              }
            }}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAddQuestion} disabled={isSaving || (rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure !== 100)}>
            {isSaving ? "Saving..." : "Save Question"}
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
    </>
  );
};

export default AddQuestionDialog;
