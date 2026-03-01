import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ViewQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  question: any | null;
}

interface ForensicAnswerRow {
  questionSpecimen: string;
  standardSpecimen: string;
  points: number;
  pointType?: string;
}

interface ForensicAnswerData {
  specimens: ForensicAnswerRow[];
  explanation: {
    text: string;
    points: number;
    conclusion?: string;
  };
}

const ViewQuestionDialog: React.FC<ViewQuestionDialogProps> = ({
  isOpen,
  onOpenChange,
  question,
}) => {
  if (!question) return null;

  // Split images into standard vs question images when metadata is available
  const imageGroups = useMemo(() => {
    const res = { standardImages: [] as string[], questionImages: [] as string[] };
    try {
      if (!question || !question.image) return res;
      const all = (typeof question.image === 'string' ? question.image : '').split('|').map((s: string) => s.trim()).filter((s: string) => s);

      // Try to read standardImageCount from answer.imageMetadata or common fields
      let stdCount: number | null = null;
      try {
        const parsed = typeof question.answer === 'string' ? JSON.parse(question.answer) : question.answer;
        if (parsed && parsed.imageMetadata && parsed.imageMetadata.standardImageCount !== undefined) {
          stdCount = Number(parsed.imageMetadata.standardImageCount) || 0;
        }
      } catch (e) {
        // ignore
      }

      // fallback to top-level image metadata if present
      if ((stdCount === null || Number.isNaN(stdCount)) && question.imageMetadata) {
        try {
          const meta = typeof question.imageMetadata === 'string' ? JSON.parse(question.imageMetadata) : question.imageMetadata;
          if (meta && meta.standardImageCount !== undefined) stdCount = Number(meta.standardImageCount) || 0;
        } catch (e) {
          // ignore
        }
      }

      if (stdCount !== null && !Number.isNaN(stdCount) && stdCount > 0) {
        res.standardImages = all.slice(0, stdCount);
        res.questionImages = all.slice(stdCount);
      } else {
        // No metadata: leave as a single combined array in questionImages for backwards compatibility
        res.questionImages = all;
      }
    } catch (e) {
      // ignore
    }
    return res;
  }, [question]);

  // Parse forensic answer if needed
  const forensicData = useMemo(() => {
    if (question.type === "forensic" && question.answer) {
      try {
        const parsedAnswer = JSON.parse(question.answer);

        // Handle both old format (array) and new format (object with specimens and explanation)
        if (Array.isArray(parsedAnswer)) {
          // Old format - just specimens array
          const specimens = parsedAnswer.map((row: any) => ({
            questionSpecimen: row.questionSpecimen || "",
            standardSpecimen: row.standardSpecimen || "",
            points: row.points || 1,
            pointType: row.pointType || "for each",
          }));
          return {
            specimens,
            explanation: {
              text: "",
              points: 0,
              conclusion: "",
            },
          };
        } else {
          // New format with specimens and explanation
          const specimens = (parsedAnswer.specimens || []).map((row: any) => ({
            questionSpecimen: row.questionSpecimen || "",
            standardSpecimen: row.standardSpecimen || "",
            points: row.points || 1,
            pointType: row.pointType || "for each",
          }));

          return {
            specimens,
            explanation: parsedAnswer.explanation || {
              text: "",
              points: 0,
              conclusion: "",
            },
          };
        }
      } catch (e) {
        console.error("Error parsing forensic answer:", e);
        return {
          specimens: [],
          explanation: { text: "", points: 0, conclusion: "" },
        };
      }
    }
    return null;
  }, [question]);

  // Parse rubrics - always show with defaults if not explicitly set (support legacy keys)
  const rubricsObj = useMemo(() => {
    if (!question) return null;

    try {
      if (question.rubrics) {
        const parsed = typeof question.rubrics === 'string' ? JSON.parse(question.rubrics) : question.rubrics;
        return {
          findingsSimilarity: Number(parsed.findingsSimilarity ?? parsed.completeness ?? 70),
          objectivity: Number(parsed.objectivity ?? 15),
          structure: Number(parsed.structure ?? 15),
        };
      } else {
        // Default rubrics if none assigned
        return { findingsSimilarity: 70, objectivity: 15, structure: 15 };
      }
    } catch (e) {
      console.error('Error parsing question rubrics:', e);
      // Fallback to defaults
      return { findingsSimilarity: 70, objectivity: 15, structure: 15 };
    }
  }, [question]);

  // Calculate total points for forensic questions (answer key only, accounting for pointType)
  const totalPoints = useMemo(() => {
    if (forensicData) {
      return forensicData.specimens.reduce((sum, row) => {
        const rowPoints = Number(row.points) || 1;
        const pointType = row.pointType || "both";
        const columns = Object.keys(row).filter(col => !["points", "pointType"].includes(col));
        if (pointType === "each") {
          return sum + rowPoints * Math.max(1, columns.length);
        } else {
          return sum + rowPoints;
        }
      }, 0);
    }
    return null;
  }, [forensicData]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Question Details</DialogTitle>
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
                <Label className="text-sm font-medium">Course</Label>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 font-medium">
                  {question.course}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Difficulty Level</Label>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold
                    ${question.difficulty === "easy" ? "bg-green-100 text-green-800" : ""}
                    ${question.difficulty === "medium" ? "bg-blue-100 text-blue-800" : ""}
                    ${question.difficulty === "hard" ? "bg-orange-100 text-orange-800" : ""}
                    ${question.difficulty === "expert" ? "bg-red-100 text-red-800" : ""}
                  `}
                  >
                    {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Question Title</Label>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-gray-900">
                {question.title}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Instructions</Label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-wrap text-sm text-gray-800">
                {question.text}
              </div>
            </div>
          </div>

          {/* PART 2: EVIDENCE SPECIMENS */}
          {(imageGroups.standardImages?.length > 0 || imageGroups.questionImages?.length > 0) && (
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-8 bg-green-500 rounded"></div>
                <h3 className="text-lg font-semibold text-gray-900">Evidence Specimens</h3>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {imageGroups.standardImages?.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-green-900">Standard Specimen Images ({imageGroups.standardImages.length})</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {imageGroups.standardImages.map((imgUrl, index) => (
                        <div key={`std-${index}`} className="rounded-lg border border-gray-200 overflow-hidden">
                          <img src={imgUrl} alt={`Standard ${index + 1}`} className="w-full h-24 object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {imageGroups.questionImages?.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-blue-900">Question Specimen Images ({imageGroups.questionImages.length})</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {imageGroups.questionImages.map((imgUrl, index) => (
                        <div key={`q-${index}`} className="rounded-lg border border-gray-200 overflow-hidden">
                          <img src={imgUrl} alt={`Question ${index + 1}`} className="w-full h-24 object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PART 3: ANSWER KEY & KEYWORDS */}
          {question.type === "forensic" && forensicData ? (
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-8 bg-purple-500 rounded"></div>
                <h3 className="text-lg font-semibold text-gray-900">Answer Key</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">Specimen comparison specifications</p>
                  <div className="text-sm font-semibold text-purple-600">Total Points: {totalPoints}</div>
                </div>

                <div className="max-h-[280px] overflow-auto border rounded-lg bg-gray-50">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-gray-100 border-b">
                      <tr>
                        <th className="p-3 text-left font-semibold text-gray-700 w-8">#</th>
                        <th className="p-3 text-left font-semibold text-gray-700">Question Specimen</th>
                        <th className="p-3 text-left font-semibold text-gray-700">Standard Specimen</th>
                        <th className="p-3 text-center font-semibold text-gray-700 w-24">Point Type</th>
                        <th className="p-3 text-center font-semibold text-gray-700 w-20">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forensicData.specimens.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-white">
                          <td className="p-3 text-center font-medium text-gray-700">{idx + 1}</td>
                          <td className="p-3 text-gray-800">{row.questionSpecimen}</td>
                          <td className="p-3 text-gray-800">{row.standardSpecimen}</td>
                          <td className="p-3 text-center text-xs text-gray-700 font-medium">
                            <span className="px-2 py-1 bg-gray-200 text-gray-800 rounded whitespace-nowrap">
                              {row.pointType === "both" ? "if both correct" : "for each correct"}
                            </span>
                          </td>
                          <td className="p-3 text-center font-semibold text-gray-900">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {question.keyword_pool_name && (
                  <div className="space-y-2 border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">Keywords (Optional)</h4>
                    </div>
                    <div className="border rounded-lg p-3 bg-indigo-50 border-indigo-200">
                      <div className="mb-2">
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 border-indigo-300 text-xs">
                          {question.keyword_pool_name}
                        </Badge>
                      </div>
                      {question.selected_keywords && (
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            try {
                              const keywords = typeof question.selected_keywords === 'string'
                                ? JSON.parse(question.selected_keywords)
                                : question.selected_keywords;
                              return Array.isArray(keywords) ? keywords : [];
                            } catch (e) {
                              return [];
                            }
                          })().map((keyword: string, index: number) => (
                            <Badge key={index} variant="outline" className="bg-indigo-200 text-indigo-900 border-indigo-300 text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* PART 4: GRADING CRITERIA */}
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 bg-amber-500 rounded"></div>
              <h3 className="text-lg font-semibold text-gray-900">Grading Criteria</h3>
            </div>

            {rubricsObj && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-amber-900">Rubric Weights (%)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                    <div className="text-xs font-semibold text-blue-900 mb-2">Completeness</div>
                    <div className="text-2xl font-bold text-blue-600">{rubricsObj.findingsSimilarity}%</div>
                    <div className="text-xs text-blue-700 mt-1">conclusion + keywords</div>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
                    <div className="text-xs font-semibold text-amber-900 mb-2">Objectivity</div>
                    <div className="text-2xl font-bold text-amber-600">{rubricsObj.objectivity}%</div>
                    <div className="text-xs text-amber-700 mt-1">no subjective words</div>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                    <div className="text-xs font-semibold text-green-900 mb-2">Structure</div>
                    <div className="text-2xl font-bold text-green-600">{rubricsObj.structure}%</div>
                    <div className="text-xs text-green-700 mt-1">reasoning words</div>
                  </div>
                </div>
              </div>
            )}

            {forensicData?.explanation && (forensicData.explanation.text || forensicData.explanation.conclusion) && (
              <div className="space-y-3 bg-teal-50 border border-teal-200 rounded-lg p-4">
                <Label className="text-sm font-semibold text-teal-900 block">Forensic Conclusion & Explanation</Label>

                {forensicData.explanation.conclusion && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-700">Expected Conclusion</Label>
                    <div className="flex gap-2">
                      <button
                        disabled
                        className={`flex-1 px-3 py-2 rounded-md font-semibold text-sm ${
                          forensicData.explanation.conclusion === "fake"
                            ? "bg-red-500 text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        Not Written By The Same Person
                      </button>
                      <button
                        disabled
                        className={`flex-1 px-3 py-2 rounded-md font-semibold text-sm ${
                          forensicData.explanation.conclusion === "real"
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        Written By The Same Person
                      </button>
                    </div>
                  </div>
                )}

                {forensicData.explanation.text && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-gray-700">Expected Explanation</Label>
                      {forensicData.explanation.points > 0 && (
                        <span className="text-xs text-gray-600">({forensicData.explanation.points} points)</span>
                      )}
                    </div>
                    <div className="p-3 bg-white border border-teal-200 rounded-lg whitespace-pre-wrap text-sm text-gray-800">
                      {forensicData.explanation.text}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Created Info */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-700">Created By</Label>
              <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-800">
                {question.created_by || "System"}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-700">Created Date</Label>
              <div className="p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-800">
                {question.created ? (() => {
                  try {
                    const date = new Date(question.created);
                    const phtDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
                    return phtDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                  } catch (e) {
                    return question.created;
                  }
                })() : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewQuestionDialog;
