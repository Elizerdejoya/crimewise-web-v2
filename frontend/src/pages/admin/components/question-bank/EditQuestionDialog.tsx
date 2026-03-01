import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
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
import { updateQuestion, uploadImage } from "./utils";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, X, Settings } from "lucide-react";
import { useRef } from "react";
import KeywordPoolManager from "./KeywordPoolManager";

interface EditQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  question: any | null;
  courses: any[];
  keywordPools: any[];
  onQuestionUpdated: () => void;
}

interface ForensicAnswerRow {
  questionSpecimen: string;
  standardSpecimen: string;
  points: number;
  pointType?: string;
}

const EditQuestionDialog: React.FC<EditQuestionDialogProps> = ({
  isOpen,
  onOpenChange,
  question,
  courses,
  keywordPools,
  onQuestionUpdated
}) => {
  const [editForm, setEditForm] = useState<any>(null);
  const [forensicRows, setForensicRows] = useState<ForensicAnswerRow[]>([]);
  const [explanation, setExplanation] = useState("");
  const [explanationPoints, setExplanationPoints] = useState(0);
  const [conclusion, setConclusion] = useState<string | null>(null);
  const [rubrics, setRubrics] = useState({ findingsSimilarity: 70, objectivity: 15, structure: 15 });
  const [standardImages, setStandardImages] = useState<string[]>([]);
  const [questionImages, setQuestionImages] = useState<string[]>([]);
  const [selectedKeywordPool, setSelectedKeywordPool] = useState<any>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isKeywordPoolManagerOpen, setIsKeywordPoolManagerOpen] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const standardImageInputRef = useRef<HTMLInputElement>(null);
  const questionImageInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when question changes
  useEffect(() => {
    if (question) {
      setEditForm({ ...question });
      
      // Initialize keyword pool data
      if (question.keyword_pool_id) {
        const pool = keywordPools.find(p => p.id === question.keyword_pool_id);
        setSelectedKeywordPool(pool || null);
        
        // Parse selected keywords
        if (question.selected_keywords) {
          try {
            const keywords = JSON.parse(question.selected_keywords);
            setSelectedKeywords(Array.isArray(keywords) ? keywords : []);
          } catch (e) {
            setSelectedKeywords([]);
          }
        } else {
          setSelectedKeywords([]);
        }
      } else {
        setSelectedKeywordPool(null);
        setSelectedKeywords([]);
      }
      // Load rubrics if present (support legacy keys and new keys)
      if (question && question.rubrics) {
        try {
          const parsed = typeof question.rubrics === 'string' ? JSON.parse(question.rubrics) : question.rubrics;
          setRubrics({
            findingsSimilarity: Number(parsed.findingsSimilarity ?? parsed.accuracy ?? 70),
            objectivity: Number(parsed.objectivity ?? 15),
            structure: Number(parsed.structure ?? parsed.completeness ?? 15),
          });
        } catch (e) {
          // ignore
        }
      }
      
      // Parse forensic answer data if question is of forensic type
      if (question.type === "forensic" && question.answer) {
        try {
          let parsedAnswer = JSON.parse(question.answer);
          
          // Handle both the old format (array of rows) and the new format with explanation
          if (Array.isArray(parsedAnswer)) {
            // Old format - just specimens array
            const rows = parsedAnswer.map((row: any) => ({
              questionSpecimen: row.questionSpecimen || "",
              standardSpecimen: row.standardSpecimen || "",
              points: row.points || 1,
              pointType: row.pointType || "" // preserve empty if not defined
            }));
            setForensicRows(rows);
            setExplanation("");
            setExplanationPoints(0);
          } else {
            // New format - specimens and explanation
            const rows = (parsedAnswer.specimens || []).map((row: any) => ({
              questionSpecimen: row.questionSpecimen || "",
              standardSpecimen: row.standardSpecimen || "",
              points: row.points || 1,
              pointType: row.pointType || ""
            }));
            setForensicRows(rows.length > 0 ? rows : [{ questionSpecimen: "", standardSpecimen: "", points: 1, pointType: "" }]);
            
            // Set explanation and conclusion if they exist
            if (parsedAnswer.explanation) {
              setExplanation(parsedAnswer.explanation.text || "");
              setExplanationPoints(parsedAnswer.explanation.points || 0);
              setConclusion(parsedAnswer.explanation.conclusion || null);
            } else {
              setExplanation("");
              setExplanationPoints(0);
              setConclusion(null);
            }
          }
        } catch (e) {
          console.error("Error parsing forensic answer:", e);
          // Fallback to an empty row if parsing fails
          setForensicRows([{ questionSpecimen: "", standardSpecimen: "", points: 1, pointType: "" }]);
          setExplanation("");
          setExplanationPoints(0);
        }
        // After parsing forensic answer, also split stored images into standard vs question images
        try {
          const allImages: string[] = question.image ? question.image.split("|") : [];
          let stdCount = 0;
          if (question.answer) {
            try {
              const parsedAnswer = JSON.parse(question.answer);
              const meta = parsedAnswer.imageMetadata || parsedAnswer.image_metadata || parsedAnswer.metadata || null;
              if (meta && typeof meta.standardImageCount === 'number') {
                stdCount = meta.standardImageCount;
              }
            } catch (e) {
              // ignore
            }
          }
          if (allImages.length > 0) {
            setStandardImages(allImages.slice(0, stdCount));
            setQuestionImages(allImages.slice(stdCount));
          } else {
            setStandardImages([]);
            setQuestionImages([]);
          }
        } catch (e) {
          setStandardImages([]);
          setQuestionImages([]);
        }
      }
    }
  }, [question]);

  // Handle form changes
  const handleEditChange = (field: string, value: string) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value });
    }
  };

  const handleKeywordPoolChange = (poolId: string) => {
    if (poolId === "none") {
      setSelectedKeywordPool(null);
      setSelectedKeywords([]);
    } else {
      const pool = keywordPools.find(p => p.id === parseInt(poolId));
      setSelectedKeywordPool(pool || null);
      setSelectedKeywords([]);
    }
  };

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => 
      prev.includes(keyword) 
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
  };
  
  // Handle forensic row changes
  const handleForensicRowChange = (idx: number, field: string, value: string | number) => {
    setForensicRows(rows => rows.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };
  
  // Add new forensic row
  const handleAddForensicRow = () => {
    // Use the points value (and pointType) from the last row when adding a new one
    const lastRowPoints = forensicRows.length > 0 
      ? forensicRows[forensicRows.length - 1].points 
      : 1;
    const lastRowPointType = forensicRows.length > 0 
      ? forensicRows[forensicRows.length - 1].pointType || "" 
      : "";

    setForensicRows(rows => [...rows, { 
      questionSpecimen: "", 
      standardSpecimen: "", 
      points: lastRowPoints,
      pointType: lastRowPointType
    }]);
  };
  
  // Remove forensic row
  const handleRemoveForensicRow = (idx: number) => {
    setForensicRows(rows => rows.filter((_, i) => i !== idx));
  };

  // Handle image file selection and upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: "standard" | "question") => {
    const MAX_FILES = 15;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ["image/png", "image/jpeg"];

    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploadingImages(true);

    // Upload files sequentially
    const uploadNext = async (index: number) => {
      if (index >= files.length) {
        setIsUploadingImages(false);
        return;
      }

      const file = files[index];

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a PNG or JPEG image.`,
          variant: "destructive",
        });
        uploadNext(index + 1);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 10MB size limit.`,
          variant: "destructive",
        });
        uploadNext(index + 1);
        return;
      }

      uploadImage(
        file,
        (url: string) => {
          if (target === "standard") {
            setStandardImages(prev => [...prev, url]);
          } else {
            setQuestionImages(prev => [...prev, url]);
          }
          uploadNext(index + 1);
        },
        (err: any) => {
          console.error("Upload error:", err);
          toast({
            title: "Upload Failed",
            description: `Failed to upload "${file.name}": ${err?.message || "Unknown error"}`,
            variant: "destructive",
          });
          uploadNext(index + 1);
        }
      );
    };

    uploadNext(0);

    // reset input
    if (target === "standard" && standardImageInputRef.current) {
      standardImageInputRef.current.value = "";
    } else if (target === "question" && questionImageInputRef.current) {
      questionImageInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (idx: number, type: "standard" | "question") => {
    if (type === "standard") {
      setStandardImages(prev => prev.filter((_, i) => i !== idx));
    } else {
      setQuestionImages(prev => prev.filter((_, i) => i !== idx));
    }
  };

  // Update answer field based on forensic rows before saving
  const updateForensicAnswer = () => {
    if (editForm.type === "forensic") {
      // Create the answer data with specimens and explanation
      const answerData = {
        specimens: forensicRows.map(row => {
          const specimen: any = {
            questionSpecimen: row.questionSpecimen,
            standardSpecimen: row.standardSpecimen,
            points: Number(row.points) || 1,
          };
          if (row.pointType) {
            specimen.pointType = row.pointType;
          }
          return specimen;
        }),
        explanation: {
          text: explanation,
          points: Number(explanationPoints) || 0,
          conclusion: conclusion
        }
      } as any;
      // Attach image metadata so TakeExam and other parts can split images
      try {
        answerData.imageMetadata = {
          standardImageCount: standardImages.length,
          questionImageCount: questionImages.length,
        };
      } catch (e) {
        // ignore
      }
      
      
      // Stringify the answer data
      const answerJson = JSON.stringify(answerData);
      
      // Calculate total points including explanation
      const totalPoints = 
        forensicRows.reduce((sum, row) => sum + (Number(row.points) || 1), 0) + 
        (Number(explanationPoints) || 0);
      
      return { 
        ...editForm, 
        answer: answerJson,
        // Update combined image field as standard images first
        image: (standardImages.concat(questionImages)).filter(Boolean).join("|"),
        points: totalPoints,
        explanation: explanation, // Add explanation as separate field
        explanation_points: Number(explanationPoints) || 0 // Add explanation points separately
      };
    }
    return editForm;
  };

  // Save edit handler
  const handleSaveEdit = () => {
    if (!editForm) return;
    // Validate rubric sum when editing
    const totalRubrics =
      Number(rubrics.findingsSimilarity || 0) +
      Number(rubrics.objectivity || 0) +
      Number(rubrics.structure || 0);
    if (totalRubrics !== 100) {
      toast({
        title: "Validation Error",
        description: "Rubric weights must total 100%.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    // Update forensic answer if applicable
    const updatedForm = editForm.type === "forensic" ? updateForensicAnswer() : editForm;
    
    // Add keyword pool data
    const formWithKeywords = {
      ...updatedForm,
      keyword_pool_id: selectedKeywordPool?.id || null,
      selected_keywords: selectedKeywords.length > 0 ? JSON.stringify(selectedKeywords) : null
    };
    // Attach rubrics
    formWithKeywords.rubrics = JSON.stringify(rubrics);
    console.log('[EditQuestionDialog] update payload', formWithKeywords);
    
    updateQuestion(
      formWithKeywords,
      (updated) => {
        setIsSaving(false);
        toast({ title: "Success", description: "Question updated successfully." });
        onOpenChange(false);
        onQuestionUpdated();
      },
      (err) => {
        setIsSaving(false);
        toast({ 
          title: "Error", 
          description: err.message || "Failed to update question.", 
          variant: "destructive" 
        });
        console.error("[Questions][Edit] Error:", err);
      }
    );
  };

  // If no question or edit form, don't render content
  if (!editForm) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Edit Question</DialogTitle>
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
                  value={String(editForm.course_id)}
                  onValueChange={(v) => handleEditChange("course_id", v)}
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
                  value={editForm.difficulty}
                  onValueChange={(v) => handleEditChange("difficulty", v)}
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
                value={editForm.title}
                onChange={(e) => handleEditChange("title", e.target.value)}
                placeholder="Enter a title for your question"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-text" className="text-sm font-medium">Instructions</Label>
              <Textarea
                id="question-text"
                value={editForm.text}
                onChange={(e) => handleEditChange("text", e.target.value)}
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
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
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
                {standardImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Standard Specimens ({standardImages.length})
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => { setStandardImages([]); setQuestionImages([]); }} className="text-red-600 hover:text-red-700 h-7 px-2">Clear</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                      {standardImages.map((url, index) => (
                        <div key={index} className="p-1 bg-white border rounded flex flex-col items-center gap-1">
                          <img src={url} alt={`s-${index}`} className="h-20 object-contain" />
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, 'standard')}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
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
                {questionImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Question Specimens ({questionImages.length})
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => { setStandardImages([]); setQuestionImages([]); }} className="text-red-600 hover:text-red-700 h-7 px-2">Clear</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                      {questionImages.map((url, index) => (
                        <div key={index} className="p-1 bg-white border rounded flex flex-col items-center gap-1">
                          <img src={url} alt={`q-${index}`} className="h-20 object-contain" />
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, 'question')}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PART 3: ANSWER KEY & KEYWORDS */}
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-purple-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Answer Key</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Define how specimens compare and assign points per row</p>
                <div className="text-sm font-semibold text-purple-600">
                  Total Points: {forensicRows.reduce((sum, row) => {
                    const rowPoints = Number(row.points) || 1;
                    const pointType = row.pointType || "both";
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
                      <th className="p-3 text-left font-semibold text-gray-700">Question Specimen</th>
                      <th className="p-3 text-left font-semibold text-gray-700">Standard Specimen</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-20">Points</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-32">Point Type</th>
                      <th className="p-3 text-center font-semibold text-gray-700 w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forensicRows.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-white">
                        <td className="p-3 text-center font-medium text-gray-700">{idx + 1}</td>
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
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            value={row.standardSpecimen}
                            onChange={(e) => handleForensicRowChange(idx, "standardSpecimen", e.target.value)}
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
                            <option value="both">if both correct</option>
                            <option value="each">for each correct</option>
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveForensicRow(idx)}
                            disabled={forensicRows.length === 1}
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
              <h3 className="text-lg font-semibold text-gray-900">Grading Criteria</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Rubric Weights (%)</Label>
                <div className={`text-xs font-medium ${
                  rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure === 100
                    ? 'text-gray-600'
                    : 'text-red-600'
                }`}>Total: {rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure}%</div>
              </div>
              {rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure !== 100 && (
                <div className="text-sm text-red-600">
                  Total must equal 100% before saving.
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                  <Label className="text-xs font-semibold text-blue-900">Completeness</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={rubrics.findingsSimilarity}
                    onChange={e => setRubrics({...rubrics, findingsSimilarity: Number(e.target.value)})}
                    className="h-8 text-sm font-bold text-center"
                  />
                  <div className="text-xs text-blue-700">conclusion + keywords</div>
                </div>
                <div className="space-y-1.5 p-3 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
                  <Label className="text-xs font-semibold text-amber-900">Objectivity</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={rubrics.objectivity}
                    onChange={e => setRubrics({...rubrics, objectivity: Number(e.target.value)})}
                    className="h-8 text-sm font-bold text-center"
                  />
                  <div className="text-xs text-amber-700">no subjective words</div>
                </div>
                <div className="space-y-1.5 p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                  <Label className="text-xs font-semibold text-green-900">Structure</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={rubrics.structure}
                    onChange={e => setRubrics({...rubrics, structure: Number(e.target.value)})}
                    className="h-8 text-sm font-bold text-center"
                  />
                  <div className="text-xs text-green-700">reasoning words</div>
                </div>
              </div>
            </div>

            {/* Forensic Conclusion & Explanation Subsection */}
            <div className="space-y-3 bg-teal-50 border border-teal-200 rounded-lg p-4">
              <Label className="text-sm font-semibold text-teal-900 block">Forensic Conclusion & Explanation</Label>
              
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700">Conclusion Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={conclusion === "fake" ? "default" : "outline"}
                    onClick={() => setConclusion("fake")}
                    className="flex-1 h-9 text-sm"
                  >
                    Not Written By The Same Person
                  </Button>
                  <Button
                    type="button"
                    variant={conclusion === "real" ? "default" : "outline"}
                    onClick={() => setConclusion("real")}
                    className="flex-1 h-9 text-sm"
                  >
                    Written By The Same Person
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="explanation" className="text-xs font-medium text-gray-700">Expected Explanation</Label>
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
          <Button variant="outline" onClick={() => !isSaving && onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} disabled={isSaving || (rubrics.findingsSimilarity + rubrics.objectivity + rubrics.structure !== 100)}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <KeywordPoolManager
        isOpen={isKeywordPoolManagerOpen}
        onOpenChange={setIsKeywordPoolManagerOpen}
        onPoolSelected={(pool) => {
          setSelectedKeywordPool(pool);
          setSelectedKeywords([...pool.keywords]);
        }}
        selectMode={true}
      />
    </Dialog>
  );
};

export default EditQuestionDialog;
