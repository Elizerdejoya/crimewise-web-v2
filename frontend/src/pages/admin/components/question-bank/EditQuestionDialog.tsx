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
import { PlusCircle, X } from "lucide-react";
import { useRef } from "react";

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
  const [rubrics, setRubrics] = useState({ accuracy: 40, completeness: 30, clarity: 20, objectivity: 10 });
  const [standardImages, setStandardImages] = useState<string[]>([]);
  const [questionImages, setQuestionImages] = useState<string[]>([]);
  const [selectedKeywordPool, setSelectedKeywordPool] = useState<any>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
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
      // Load rubrics if present
      if (question && question.rubrics) {
        try {
          const parsed = typeof question.rubrics === 'string' ? JSON.parse(question.rubrics) : question.rubrics;
          setRubrics({
            accuracy: Number(parsed.accuracy ?? 40),
            completeness: Number(parsed.completeness ?? 30),
            clarity: Number(parsed.clarity ?? 20),
            objectivity: Number(parsed.objectivity ?? 10),
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
              points: row.points || 1
            }));
            setForensicRows(rows);
            setExplanation("");
            setExplanationPoints(0);
          } else {
            // New format - specimens and explanation
            const rows = (parsedAnswer.specimens || []).map((row: any) => ({
              questionSpecimen: row.questionSpecimen || "",
              standardSpecimen: row.standardSpecimen || "",
              points: row.points || 1
            }));
            setForensicRows(rows.length > 0 ? rows : [{ questionSpecimen: "", standardSpecimen: "", points: 1 }]);
            
            // Set explanation if it exists
            if (parsedAnswer.explanation) {
              setExplanation(parsedAnswer.explanation.text || "");
              setExplanationPoints(parsedAnswer.explanation.points || 0);
            } else {
              setExplanation("");
              setExplanationPoints(0);
            }
          }
        } catch (e) {
          console.error("Error parsing forensic answer:", e);
          // Fallback to an empty row if parsing fails
          setForensicRows([{ questionSpecimen: "", standardSpecimen: "", points: 1 }]);
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
    // Use the points value from the last row when adding a new one
    const lastRowPoints = forensicRows.length > 0 
      ? forensicRows[forensicRows.length - 1].points 
      : 1;
      
    setForensicRows(rows => [...rows, { 
      questionSpecimen: "", 
      standardSpecimen: "", 
      points: lastRowPoints 
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
        specimens: forensicRows.map(row => ({
          questionSpecimen: row.questionSpecimen,
          standardSpecimen: row.standardSpecimen,
          points: Number(row.points) || 1
        })),
        explanation: {
          text: explanation,
          points: Number(explanationPoints) || 0
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
    
    updateQuestion(
      formWithKeywords,
      () => {
        toast({ title: "Success", description: "Question updated successfully." });
        onOpenChange(false);
        onQuestionUpdated();
      },
      (err) => {
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
      <DialogContent className="sm:max-w-[625px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
        
          <div className="space-y-2">
            <Label>Title</Label>
            <Input 
              value={editForm.title} 
              onChange={e => handleEditChange("title", e.target.value)} 
            />
          </div>
          
          <div className="space-y-2">
            <Label>Text</Label>
            <Textarea 
              value={editForm.text} 
              onChange={e => handleEditChange("text", e.target.value)} 
              rows={5}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Course</Label>
            <Select 
              value={String(editForm.course_id)} 
              onValueChange={v => handleEditChange("course_id", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>Difficulty</Label>
            <Select 
              value={editForm.difficulty} 
              onValueChange={v => handleEditChange("difficulty", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Type</Label>
            <Select 
              value={editForm.type} 
              onValueChange={v => handleEditChange("type", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="forensic">Forensic Document Comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Keyword Pool Selection */}
          <div className="space-y-2">
            <Label>Keyword Pool</Label>
            <Select 
              value={selectedKeywordPool?.id ? String(selectedKeywordPool.id) : "none"} 
              onValueChange={handleKeywordPoolChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a keyword pool (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No keyword pool</SelectItem>
                {keywordPools.map((pool) => (
                  <SelectItem key={pool.id} value={String(pool.id)}>
                    {pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedKeywordPool && (
              <div className="space-y-2 p-3 bg-gray-50 rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Select Keywords:</Label>
                  <span className="text-xs text-gray-500">
                    {selectedKeywords.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    try {
                      const keywords = typeof selectedKeywordPool.keywords === 'string' 
                        ? JSON.parse(selectedKeywordPool.keywords)
                        : selectedKeywordPool.keywords;
                      return Array.isArray(keywords) ? keywords : [];
                    } catch (e) {
                      console.error('Error parsing keywords:', e);
                      return [];
                    }
                  })().map((keyword: string, index: number) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleKeyword(keyword)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        selectedKeywords.includes(keyword)
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
                {selectedKeywords.length > 0 && (
                  <div className="mt-2">
                    <Label className="text-sm font-medium">Selected Keywords:</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedKeywords.map((keyword, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-200 text-gray-800 rounded-full"
                        >
                          {keyword}
                          <button
                            type="button"
                            onClick={() => toggleKeyword(keyword)}
                            className="ml-1 text-gray-600 hover:text-gray-800"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Rubrics Editor */}
          <div className="space-y-3 border-t pt-4">
            <Label>Rubric Weights (%)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Accuracy</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={rubrics.accuracy}
                  onChange={e => setRubrics({...rubrics, accuracy: Number(e.target.value)})}
                  placeholder="Accuracy %"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Completeness</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={rubrics.completeness}
                  onChange={e => setRubrics({...rubrics, completeness: Number(e.target.value)})}
                  placeholder="Completeness %"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Clarity</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={rubrics.clarity}
                  onChange={e => setRubrics({...rubrics, clarity: Number(e.target.value)})}
                  placeholder="Clarity %"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Objectivity</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={rubrics.objectivity}
                  onChange={e => setRubrics({...rubrics, objectivity: Number(e.target.value)})}
                  placeholder="Objectivity %"
                />
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Total: {rubrics.accuracy + rubrics.completeness + rubrics.clarity + rubrics.objectivity}%
            </div>
          </div>

          {/* Image lists (standard vs question) */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Standard Specimen Images</Label>
              <Button variant="outline" size="sm" onClick={() => { setStandardImages([]); setQuestionImages([]); }}>
                Clear All
              </Button>
            </div>
            {standardImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {standardImages.map((url, index) => (
                  <div key={index} className="p-1 border rounded flex flex-col items-center">
                    <img src={url} alt={`s-${index}`} className="h-20 object-contain mb-1" />
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, 'standard')}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No standard specimen images</div>
            )}

            <Label className="pt-2">Question Specimen Images</Label>
            {questionImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {questionImages.map((url, index) => (
                  <div key={index} className="p-1 border rounded flex flex-col items-center">
                    <img src={url} alt={`q-${index}`} className="h-20 object-contain mb-1" />
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(index, 'question')}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No question specimen images</div>
            )}

            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  ref={standardImageInputRef}
                  onChange={(e) => handleImageChange(e, "standard")}
                  disabled={isUploadingImages}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingImages}
                  onClick={() => standardImageInputRef.current?.click()}
                >
                  Add Standard
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  ref={questionImageInputRef}
                  onChange={(e) => handleImageChange(e, "question")}
                  disabled={isUploadingImages}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingImages}
                  onClick={() => questionImageInputRef.current?.click()}
                >
                  Add Question
                </Button>
              </div>
            </div>
          </div>

          {/* Forensic answer editor */}
          {editForm.type === "forensic" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Answer Key Table</Label>
                <div className="text-sm text-muted-foreground">
                  Total Points: {forensicRows.reduce((sum, row) => sum + (Number(row.points) || 1), 0) + (Number(explanationPoints) || 0)}
                </div>
              </div>
              
              <div className="max-h-[300px] overflow-auto border rounded-md">
                <table className="w-full border text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="border p-2">Question Specimen</th>
                      <th className="border p-2">Standard Specimen</th>
                      <th className="border p-2 w-24">Points</th>
                      <th className="border p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forensicRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border p-2">
                          <input
                            className="w-full border px-2 py-1"
                            value={row.questionSpecimen}
                            onChange={e => handleForensicRowChange(idx, "questionSpecimen", e.target.value)}
                            placeholder="Question Specimen"
                            title="Question Specimen"
                          />
                        </td>
                        <td className="border p-2">
                          <input
                            className="w-full border px-2 py-1"
                            value={row.standardSpecimen}
                            onChange={e => handleForensicRowChange(idx, "standardSpecimen", e.target.value)}
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
                            onChange={e => handleForensicRowChange(idx, "points", Number(e.target.value))}
                            placeholder="Points"
                            title="Points for this row"
                          />
                        </td>
                        <td className="border p-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleRemoveForensicRow(idx)} 
                            disabled={forensicRows.length === 1}
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
              
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="explanation">Explanation</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="explanation-points" className="text-sm">Points:</Label>
                    <Input
                      id="explanation-points"
                      type="number"
                      min={0}
                      className="w-20 h-8"
                      value={explanationPoints}
                      onChange={e => setExplanationPoints(Number(e.target.value))}
                    />
                  </div>
                </div>
                <Textarea
                  id="explanation"
                  value={explanation}
                  onChange={e => setExplanation(e.target.value)}
                  placeholder="Enter an explanation for the table comparison..."
                  rows={4}
                />
                <div className="text-sm text-muted-foreground">
                  Add an explanation of the table comparison that will be scored separately.
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditQuestionDialog;
