import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tags } from "lucide-react";

interface ViewQuestionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  question: any | null;
}

interface ForensicAnswerRow {
  questionSpecimen: string;
  standardSpecimen: string;
  points: number;
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
          findingsSimilarity: Number(parsed.findingsSimilarity ?? parsed.accuracy ?? 70),
          clarity: Number(parsed.clarity ?? 20),
          objectivity: Number(parsed.objectivity ?? 15),
          structure: Number(parsed.structure ?? parsed.completeness ?? 15),
        };
      } else {
        // Default rubrics if none assigned
        return { findingsSimilarity: 70, clarity: 20, objectivity: 15, structure: 15 };
      }
    } catch (e) {
      console.error('Error parsing question rubrics:', e);
      // Fallback to defaults
      return { findingsSimilarity: 70, clarity: 20, objectivity: 15, structure: 15 };
    }
  }, [question]);

  // Calculate total points for forensic questions
  const totalPoints = useMemo(() => {
    if (forensicData) {
      const specimenPoints = forensicData.specimens.reduce(
        (sum, row) => sum + (Number(row.points) || 1),
        0
      );
      const explanationPoints = Number(forensicData.explanation?.points) || 0;
      return specimenPoints + explanationPoints;
    }
    return null;
  }, [forensicData]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Question Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Title Section */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Title</Label>
            <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <p className="text-gray-900 font-medium">{question.title}</p>
            </div>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Question Text</Label>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm text-gray-800">
              {question.text}
            </div>
          </div>

          {/* Course & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Course</Label>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                {question.course}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Difficulty</Label>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
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

          {/* Keyword Pool Section */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Keyword Pool</Label>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              {question.keyword_pool_name ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 border-indigo-300">
                      <Tags className="h-3 w-3 mr-1" />
                      {question.keyword_pool_name}
                    </Badge>
                  </div>
                  {question.keyword_pool_description && (
                    <p className="text-sm text-gray-600">{question.keyword_pool_description}</p>
                  )}
                  {question.selected_keywords && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs font-semibold text-gray-700">Selected Keywords:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          try {
                            const keywords = typeof question.selected_keywords === 'string' 
                              ? JSON.parse(question.selected_keywords)
                              : question.selected_keywords;
                            return Array.isArray(keywords) ? keywords : [];
                          } catch (e) {
                            console.error('Error parsing selected keywords:', e);
                            return [];
                          }
                        })().map((keyword: string, index: number) => (
                          <Badge key={index} variant="outline" className="bg-white text-xs border-gray-300 text-gray-700">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-gray-500 text-sm">No keyword pool assigned</span>
              )}
            </div>
          </div>

          {/* Display Rubrics - always show (same as TakeExam) */}
          {rubricsObj && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-4">
              <div className="font-semibold text-gray-900 mb-4 text-sm">Instructor Rubric Weights</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-blue-200 rounded-lg shadow-sm">
                  <div className="text-xs font-semibold text-blue-900">Completeness</div>
                  <div className="text-2xl font-bold text-blue-600 my-2">{rubricsObj.findingsSimilarity}%</div>
                  <div className="text-xs text-blue-700">conclusion + keywords</div>
                </div>
                <div className="p-3 bg-white border border-amber-200 rounded-lg shadow-sm">
                  <div className="text-xs font-semibold text-amber-900">Objectivity</div>
                  <div className="text-2xl font-bold text-amber-600 my-2">{rubricsObj.objectivity}%</div>
                  <div className="text-xs text-amber-700">no subjective words</div>
                </div>
                <div className="p-3 bg-white border border-green-200 rounded-lg shadow-sm">
                  <div className="text-xs font-semibold text-green-900">Structure</div>
                  <div className="text-2xl font-bold text-green-600 my-2">{rubricsObj.structure}%</div>
                  <div className="text-xs text-green-700">reasoning words</div>
                </div>
              </div>
            </div>
          )}

          {/* Answer Table */}
          {question.type === "forensic" && forensicData ? (
            <>
              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-semibold text-gray-700">Answer Key Table</Label>
                <div className="max-h-[300px] overflow-auto border border-gray-200 rounded-lg">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-gradient-to-r from-gray-100 to-gray-50 sticky top-0">
                      <tr>
                        <th className="border border-gray-200 p-3 text-left font-semibold text-gray-700">#</th>
                        <th className="border border-gray-200 p-3 text-left font-semibold text-gray-700">Question Specimen</th>
                        <th className="border border-gray-200 p-3 text-left font-semibold text-gray-700">Standard Specimen</th>
                        <th className="border border-gray-200 p-3 text-center font-semibold text-gray-700 w-20">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forensicData.specimens.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="border border-gray-200 p-3 text-center font-medium text-gray-700">
                            {idx + 1}
                          </td>
                          <td className="border border-gray-200 p-3 text-gray-800">{row.questionSpecimen}</td>
                          <td className="border border-gray-200 p-3 text-gray-800">{row.standardSpecimen}</td>
                          <td className="border border-gray-200 p-3 text-center font-semibold text-gray-900">
                            {row.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {forensicData.explanation &&
                (forensicData.explanation.text ||
                  forensicData.explanation.conclusion) && (
                  <>
                    <div className="space-y-3 border-t pt-4">
                      <Label className="text-sm font-semibold text-gray-700">
                        Findings
                        <span className="text-xs text-gray-500 font-normal ml-2">
                          ({forensicData.explanation.points} points)
                        </span>
                      </Label>
                      
                      {forensicData.explanation.conclusion && (
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 space-y-3">
                          <div className="text-xs font-semibold text-indigo-900">Expected Conclusion:</div>
                          <div className="flex gap-2">
                            <button
                              disabled
                              className={`flex-1 px-3 py-2 rounded-md font-semibold text-sm transition-all ${
                                forensicData.explanation.conclusion === "fake"
                                  ? "bg-red-500 text-white"
                                  : "bg-gray-200 text-gray-500"
                              }`}
                            >
                              Not Written by Same Person
                            </button>
                            <button
                              disabled
                              className={`flex-1 px-3 py-2 rounded-md font-semibold text-sm transition-all ${
                                forensicData.explanation.conclusion === "real"
                                  ? "bg-green-500 text-white"
                                  : "bg-gray-200 text-gray-500"
                              }`}
                            >
                              Written by Same Person
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {forensicData.explanation.text && (
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm text-gray-800">
                          {forensicData.explanation.text}
                        </div>
                      )}
                    </div>
                  </>
                )}

              <div className="text-xs font-semibold text-gray-700 text-right border-t pt-3">
                Total Points: <span className="text-lg font-bold text-gray-900">{totalPoints}</span>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Answer</Label>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm text-gray-800">
                  {question.answer}
                </div>
              </div>
            </>
          )}

          {/* Images Section */}
          {question.image && (
            <>
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold text-gray-700">Specimen Images</Label>
                <div>
                  {imageGroups.standardImages && imageGroups.standardImages.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs font-semibold text-gray-700 mb-3">Standard Specimen Images</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {imageGroups.standardImages.map((imgUrl, index) => (
                          <div key={`std-${index}`} className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                            <img src={imgUrl} alt={`Standard ${index + 1}`} className="w-full h-40 object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {imageGroups.questionImages && imageGroups.questionImages.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-3">Question Specimen Images</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {imageGroups.questionImages.map((imgUrl, index) => (
                          <div key={`q-${index}`} className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                            <img src={imgUrl} alt={`Question ${index + 1}`} className="w-full h-40 object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Created Info */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-700">Created By</Label>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-800">
                {question.created_by || "System"}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-700">Created Date</Label>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-800">
                {question.created}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewQuestionDialog;
