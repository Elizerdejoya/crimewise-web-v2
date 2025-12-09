import { useEffect, useState, useRef } from "react";
import { useNavigate, useBeforeUnload, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ZoomIn, ZoomOut, X, Tags } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";

// Helper function to create auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// In-place Image Viewer with Pan and Zoom (no fullscreen)
const ImageFullScreen = ({ src, alt }: { src: string; alt: string }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoomLevel((prev) => Math.max(0.5, Math.min(4, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch handlers for mobile panning
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoomLevel > 1) {
      const t = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1 && zoomLevel > 1) {
      const t = e.touches[0];
      setPosition({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
    }
  };

  const handleTouchEnd = () => setIsDragging(false);

  const resetView = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full h-full bg-white"
      style={{ overflow: 'hidden', touchAction: 'none' }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
          transition: isDragging ? 'none' : 'transform 0.08s ease-out',
          cursor: isDragging ? 'grabbing' : zoomLevel > 1 ? 'grab' : 'default',
          maxHeight: '360px',
          display: 'block',
          margin: '0 auto'
        }}
        draggable={false}
      />

      {/* Inline zoom controls */}
      <div className="absolute top-2 right-2 bg-white/90 rounded-md shadow p-1 flex gap-1 z-10">
        <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="text-xs px-2 flex items-center">{Math.round(zoomLevel * 100)}%</div>
        <Button variant="ghost" size="icon" onClick={resetView} className="h-8 w-8">
          <span className="text-xs font-bold">R</span>
        </Button>
      </div>
    </div>
  );
};

// Multi-image display: left side shows standard specimens (changeable), right side shows questioned specimen images (changeable).
const MultiImageDisplay = ({
  questionImages,
  standardImages,
}: {
  questionImages: string[];
  standardImages: string[];
}) => {
  // indices into each group's array
  const [leftStdIndex, setLeftStdIndex] = useState(0);
  const [rightQIndex, setRightQIndex] = useState(0);

  const stdCount = standardImages.length;
  const qCount = questionImages.length;

  // helpers for prev/next on each side
  const prevStd = () => setLeftStdIndex((s) => Math.max(0, s - 1));
  const nextStd = () => setLeftStdIndex((s) => Math.min(stdCount - 1, s + 1));
  const prevQ = () => setRightQIndex((s) => Math.max(0, s - 1));
  const nextQ = () => setRightQIndex((s) => Math.min(qCount - 1, s + 1));

  // Fallbacks if one group is empty
  const leftSrc = stdCount > 0 ? standardImages[leftStdIndex] : questionImages[0] || "";
  const rightSrc = qCount > 0 ? questionImages[rightQIndex] : standardImages[0] || "";

  return (
    <div className="mb-12">
      {/* Thumbnails for both groups (standards first then questions) */}
      <div className="flex gap-2 mb-4 overflow-x-auto w-full items-end">
        {standardImages.map((img, idx) => (
          <div key={`std-${idx}`} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 64 }}>
            <div className="text-[10px] text-gray-700 mb-1">SS{idx + 1}</div>
            <button
              onClick={() => setLeftStdIndex(idx)}
              className={`border rounded-md p-1 ${idx === leftStdIndex ? 'ring-2 ring-primary' : ''}`}>
              <img src={img} alt={`std-thumb-${idx}`} className="h-12 object-cover rounded-sm" />
            </button>
          </div>
        ))}

        {questionImages.map((img, idx) => (
          <div key={`q-${idx}`} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 64 }}>
            <div className="text-[10px] text-gray-700 mb-1">QS{idx + 1}</div>
            <button
              onClick={() => setRightQIndex(idx)}
              className={`border rounded-md p-1 ${idx === rightQIndex ? 'ring-2 ring-primary' : ''}`}>
              <img src={img} alt={`q-thumb-${idx}`} className="h-12 object-cover rounded-sm" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col items-center">
          <div className="text-xs font-medium mb-1">{stdCount > 0 ? `SS${leftStdIndex + 1}` : `QS1`}</div>
          <div className="w-full border rounded-md p-2">
            {leftSrc ? <ImageFullScreen src={leftSrc} alt={`left-img`} /> : <div className="p-6 text-center text-sm text-gray-500">No image</div>}
          </div>

          <div className="flex gap-2 mt-3">
            <Button onClick={prevStd} size="sm" variant="secondary" disabled={leftStdIndex <= 0}>Prev</Button>
            <Button onClick={nextStd} size="sm" variant="secondary" disabled={leftStdIndex >= Math.max(0, stdCount - 1)}>Next</Button>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="text-xs font-medium mb-1">{qCount > 0 ? `QS${rightQIndex + 1}` : `SS1`}</div>
          <div className="w-full border rounded-md p-2">
            {rightSrc ? <ImageFullScreen src={rightSrc} alt={`right-img`} /> : <div className="p-6 text-center text-sm text-gray-500">No image</div>}
          </div>

          <div className="flex gap-2 mt-3">
            <Button onClick={prevQ} size="sm" variant="secondary" disabled={rightQIndex <= 0}>Prev</Button>
            <Button onClick={nextQ} size="sm" variant="secondary" disabled={rightQIndex >= Math.max(0, qCount - 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
const TakeExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exam, setExam] = useState<any | null>(null);
  const [question, setQuestion] = useState<any | null>(null);
  const [rubrics, setRubrics] = useState<any | null>(null);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [answer, setAnswer] = useState<any>(null);
  const [studentConclusion, setStudentConclusion] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [scoringDetails, setScoringDetails] = useState<any>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setTabSwitchCount((prev) => prev + 1);
        setTimeout(() => {
          if (document.visibilityState === "visible") {
            toast({
              title: "Warning",
              description: "Tab switching detected! This has been reported to your instructor.",
              variant: "destructive",
              duration: 5000,
            });
          }
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [toast]);

  // Prevent accidental navigation
  useBeforeUnload((event) => {
    if (!isSubmitting) {
      event.preventDefault();
      return "Are you sure you want to leave? Your exam progress will be lost.";
    }
  });

  useEffect(() => {
    // Get exam info from sessionStorage
    const examData = sessionStorage.getItem("currentExam");
    if (!examData) {
      toast({
        title: "No Exam",
        description: "No exam found. Please enter a token.",
        variant: "destructive",
      });
      navigate("/student/exams");
      return;
    }
    const parsedExam = JSON.parse(examData);
    setExam(parsedExam);
    // Fetch question details from backend
    fetch(`${API_BASE_URL}/api/questions/${parsedExam.question_id}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          navigate("/student/exams");
          return;
        }
        return res.json();
      })
      .then((q) => {
        setQuestion(q);
        // Initialize answer structure based on question data
        if (q.type === "forensic" && q.answer) {
          try {
            // Parse the answer which now has a different structure
            const parsedAnswer = JSON.parse(q.answer || "{}");
            // Initialize answer array based on specimens array length
            if (
              parsedAnswer.specimens &&
              Array.isArray(parsedAnswer.specimens)
            ) {
              setAnswer(Array(parsedAnswer.specimens.length).fill({}));
            }
          } catch (e) {
            console.error("Error parsing forensic answer:", e);
          }
          // parse rubrics from question if present
          try {
            if (q && q.rubrics) {
              const parsed = typeof q.rubrics === 'string' ? JSON.parse(q.rubrics) : q.rubrics;
              setRubrics({
                accuracy: Number(parsed.accuracy ?? 40),
                completeness: Number(parsed.completeness ?? 30),
                clarity: Number(parsed.clarity ?? 20),
                objectivity: Number(parsed.objectivity ?? 10),
              });
            } else {
              setRubrics({ accuracy: 40, completeness: 30, clarity: 20, objectivity: 10 });
            }
          } catch (e) {
            console.error('Error parsing question rubrics:', e);
            setRubrics({ accuracy: 40, completeness: 30, clarity: 20, objectivity: 10 });
          }
        }
      });
    // Timer logic
    let start = Number(sessionStorage.getItem("examStartTimestamp"));
    if (!start) {
      start = Date.now();
      sessionStorage.setItem("examStartTimestamp", String(start));
    }
    setStartTimestamp(start);
    const [mins, secs] = parsedExam.duration
      .split(":")
      .map((v: string) => parseInt(v, 10));
    const totalSeconds = mins * 60 + (secs || 0);
    const elapsed = Math.floor((Date.now() - start) / 1000);
    setTimeLeft(Math.max(totalSeconds - elapsed, 0));
  }, [navigate, toast]);

  useEffect(() => {
    // Time left counting
    if (timeLeft <= 0 && startTimestamp && Date.now() - startTimestamp > 1000) {
      // Only auto-submit if the exam has actually started (not at initialization)
      handleConfirmSubmit();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleConfirmSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, startTimestamp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Common words to exclude from comparison
  const commonWords = new Set([
    "the",
    "in",
    "on",
    "at",
    "of",
    "to",
    "a",
    "an",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "yet",
    "so",
    "as",
    "by",
    "is",
    "are",
    "am",
    "was",
    "were",
    "be",
    "been",
    "being",
    "that",
    "this",
    "these",
    "those",
    "it",
    "they",
    "he",
    "she",
    "we",
    "I",
    "you",
    "who",
    "what",
    "which",
    "whose",
    "where",
    "when",
    "how",
    "why",
    "with",
    "from",
    "into",
  ]);

  const cleanText = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .split(/\s+/)
      .filter((word) => !commonWords.has(word.toLowerCase()) && word.length > 1)
      .join(" ")
      .trim();
  };

  // Enhanced scoring algorithm with more precise similarity calculation
  const compareAnswers = (userAnswer: string, correctAnswer: string) => {
    if (!userAnswer || !correctAnswer) return 0;

    const cleanUserAnswer = cleanText(userAnswer);
    const cleanCorrectAnswer = cleanText(correctAnswer);

    // Empty answers can't match
    if (!cleanUserAnswer || !cleanCorrectAnswer) return 0;

    // Split into word arrays and filter out common words
    const userWords = cleanUserAnswer
      .split(/\s+/)
      .filter((word) => word.length > 1);
    const correctWords = cleanCorrectAnswer
      .split(/\s+/)
      .filter((word) => word.length > 1);

    // If no meaningful words in either answer, can't match
    if (userWords.length === 0 || correctWords.length === 0) return 0;

    // Count matching words and consider word order for higher precision
    let matchCount = 0;
    let orderScore = 0;

    // First check for exact matches
    for (let i = 0; i < userWords.length; i++) {
      const userWord = userWords[i].toLowerCase();

      for (let j = 0; j < correctWords.length; j++) {
        const correctWord = correctWords[j].toLowerCase();

        if (userWord === correctWord) {
          matchCount++;

          // Award extra points if words appear in similar positions (order matters)
          const userRelativePos = i / Math.max(1, userWords.length - 1);
          const correctRelativePos = j / Math.max(1, correctWords.length - 1);
          const positionSimilarity =
            1 - Math.abs(userRelativePos - correctRelativePos);
          orderScore += positionSimilarity;

          break; // Found a match for this word, move to next
        }
      }
    }

    // Calculate fuzzy match for words that aren't exact matches
    let fuzzyMatchScore = 0;
    for (const userWord of userWords) {
      if (userWord.length <= 3) continue; // Skip very short words

      for (const correctWord of correctWords) {
        if (correctWord.length <= 3) continue;

        if (
          userWord.toLowerCase().includes(correctWord.toLowerCase()) ||
          correctWord.toLowerCase().includes(userWord.toLowerCase())
        ) {
          fuzzyMatchScore += 0.5; // Award partial credit for partial matches
          break;
        }
      }
    }

    // Calculate final similarity percentage
    const exactMatchScore = matchCount * 70; // Exact matches have higher weight
    const orderBonus = orderScore * 15; // Word order has medium weight
    const fuzzyBonus = fuzzyMatchScore * 15; // Partial matches have lower weight

    const maxPossible = correctWords.length * 100; // Maximum possible points
    const totalScore = exactMatchScore + orderBonus + fuzzyBonus;

    return maxPossible > 0
      ? Math.min(100, (totalScore / maxPossible) * 100)
      : 0;
  };

  const handleConfirmSubmit = () => {
    setShowSubmitDialog(true);
  };

  const handleSubmit = async () => {
    if (!exam) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const decoded = jwtDecode<JwtTokenPayload>(token!);
      const student_id = decoded.id;
      let answerToSave = answer;
      let score = null;
      let details = null;

      if (question.type === "forensic") {
        let forensicRows = [];
        try {
          // Parse the answer from the question
          const parsedAnswer = JSON.parse(question.answer || "{}");

          // Check if the answer has the new format with specimens array
          if (parsedAnswer.specimens && Array.isArray(parsedAnswer.specimens)) {
            forensicRows = parsedAnswer.specimens;
          } else if (Array.isArray(parsedAnswer)) {
            // Fallback to the old format if the answer is directly an array
            forensicRows = parsedAnswer;
          }

          // Final safety check - ensure forensicRows is an array
          if (!Array.isArray(forensicRows)) {
            forensicRows = [];
            console.error("Forensic rows is not an array after parsing");
          }
        } catch (e) {
          forensicRows = [];
          console.error("Error parsing forensic answer:", e);
        }

        // Check if forensic rows have points (from the updated format)
        const hasPointsPerRow =
          forensicRows.length > 0 && "points" in forensicRows[0];

        // Track scoring details for potentially showing to the student later
        const rowDetails = [];
        let tableScore = 0; // Score from table rows ONLY
        let totalScore = 0; // Total including explanation (for overall percentage)
        let totalPossiblePoints = 0; // Only for table rows, NOT explanation
        let raw_score = 0; // Count of correct rows
        let raw_total = 0; // Total number of rows

        // Get explanation points from parsed answer if available
        let explanationPoints = 0;
        let explanationScore = 0; // Will be calculated separately
        try {
          const parsedAnswer = JSON.parse(question.answer || "{}");
          if (
            parsedAnswer.explanation &&
            typeof parsedAnswer.explanation.points === "number"
          ) {
            explanationPoints = parsedAnswer.explanation.points;
          }
        } catch (e) {
          console.error("Error extracting explanation points:", e);
        }

        // Process each row in the forensic table - safe iteration with Array.isArray check
        if (Array.isArray(forensicRows)) {
          forensicRows.forEach((row: any, rowIdx: number) => {
            raw_total++; // Increment total row count
            
            // Get row points - check if this specific row has points, not just the first row
            const rowPoints = "points" in row ? Number(row.points) || 1 : 1;
            const pointType = row.pointType || "both"; // Default to "both" for backward compatibility

            // Get the columns to check (excluding points and pointType which are metadata)
            const columns = Object.keys(row).filter((col) => !["points", "pointType"].includes(col));
            
            // Calculate possible points for this row based on point type
            let possiblePointsForRow = rowPoints;
            if (pointType === "each") {
              // If "each", points can be earned per correct column
              possiblePointsForRow = rowPoints * columns.length;
            }
            totalPossiblePoints += possiblePointsForRow;

            const rowResult = {
              rowIndex: rowIdx,
              questionSpecimen: row.questionSpecimen,
              standardSpecimen: row.standardSpecimen,
              userValue: answer[rowIdx] || {},
              correct: false,
              points: 0,
              possiblePoints: possiblePointsForRow,
              pointsValue: rowPoints, // Store the actual points set for this row
              pointType: pointType, // Store the point type ("both" or "each")
              columnScores: {},
            };

            // Check if this row's answer is correct by evaluating each column
            if (answer[rowIdx]) {
              let allCorrect = true;
              let correctColumnCount = 0;

              // Check each column for exact match
              columns.forEach((col) => {
                const userValue = (answer[rowIdx][col] || "")
                  .trim()
                  .toLowerCase();
                const correctValue = (row[col] || "").trim().toLowerCase();

                // Skip empty columns in the correct answer (they're not required)
                if (!correctValue) return;

                const isExactMatch = userValue === correctValue;

                // Store exact match result for this column
                rowResult.columnScores[col] = {
                  isExactMatch,
                  userValue,
                  correctValue,
                };

                if (isExactMatch) {
                  correctColumnCount++;
                } else {
                  allCorrect = false;
                }
              });

              // Award points based on point type
              if (pointType === "both") {
                // Award full points only if all columns are exactly correct
                if (allCorrect) {
                  rowResult.correct = true;
                  rowResult.points = rowPoints;
                  tableScore += rowPoints;
                  totalScore += rowPoints;
                  raw_score++; // Increment correct row count
                }
              } else if (pointType === "each") {
                // Award points for each correct column
                rowResult.points = correctColumnCount * rowPoints;
                if (rowResult.points > 0) {
                  tableScore += rowResult.points;
                  totalScore += rowResult.points;
                }
                rowResult.correct = allCorrect; // Mark correct only if all correct
                if (allCorrect) {
                  raw_score++; // Increment correct row count only if all columns correct
                }
              }
            }

            rowDetails.push(rowResult);
          });
        }

        // Add points for explanation if provided
        let explanationDetails = null;
        if (explanationPoints > 0) {
          // Get the expected conclusion from the question
          try {
            const parsedAnswer = JSON.parse(question.answer || "{}");
            const expectedConclusion = parsedAnswer.explanation?.conclusion || "";

            if (expectedConclusion && studentConclusion) {
              // Check if student's conclusion matches the expected conclusion
              const conclusionMatched = studentConclusion === expectedConclusion;

              // Award points based on conclusion match
              if (conclusionMatched) {
                // Award full points if conclusion matches
                explanationScore = explanationPoints;
              } else {
                // No points for wrong conclusion
                explanationScore = 0;
              }

              explanationDetails = {
                expectedConclusion,
                studentConclusion,
                conclusionMatched,
                studentText: explanation.trim(),
                maxPoints: explanationPoints,
                earnedPoints: explanationScore,
                scoringNote: "Points awarded based on whether specimen is written by the same person"
              };
            } else if (studentConclusion) {
              // If no expected conclusion specified, award full points for any selection
              explanationScore = explanationPoints;

              explanationDetails = {
                expectedConclusion: "No specific conclusion required",
                studentConclusion,
                conclusionMatched: true,
                studentText: explanation.trim(),
                maxPoints: explanationPoints,
                earnedPoints: explanationScore,
                scoringNote: "Points awarded for providing a conclusion"
              };
            } else {
              // No conclusion selected, no points
              explanationScore = 0;

              explanationDetails = {
                expectedConclusion: expectedConclusion || "Conclusion required",
                studentConclusion: "No conclusion selected",
                conclusionMatched: false,
                studentText: explanation.trim(),
                maxPoints: explanationPoints,
                earnedPoints: 0,
                scoringNote: "No points - conclusion not selected"
              };
            }
          } catch (e) {
            console.error("Error evaluating explanation conclusion:", e);
            // Fallback: award points if student provided a conclusion
            if (studentConclusion) {
              explanationScore = explanationPoints;
            }
          }

          totalScore += explanationScore;
        }

        // Determine teacherFindings BEFORE creating details object
        let teacherFindingsForDetails = '';
        try {
          if (question.explanation && String(question.explanation).trim()) {
            teacherFindingsForDetails = question.explanation;
          } else if (question.answer) {
            const parsed = typeof question.answer === 'string' ? JSON.parse(question.answer) : question.answer;
            if (parsed && parsed.explanation) {
              if (typeof parsed.explanation === 'string') teacherFindingsForDetails = parsed.explanation;
              else if (parsed.explanation.text) teacherFindingsForDetails = parsed.explanation.text;
            } else {
              teacherFindingsForDetails = question.answer;
            }
          }
        } catch (e) {
          teacherFindingsForDetails = question.answer || '';
        }

        score = Math.round(totalScore); // Ensure score is an integer
        details = {
          rowDetails,
          totalScore: tableScore, // Use tableScore (without explanation) for table-specific scoring
          totalPossiblePoints,
          raw_score,
          raw_total,
          explanation: explanation.trim(),
          teacherExplanation: teacherFindingsForDetails,
          explanationScore,
          explanationPoints,
          explanationDetails,
          assessmentMethod: "Exact matching with same person determination",
        };

        // Save both the table answers and the explanation
        answerToSave = JSON.stringify({
          tableAnswers: answer,
          explanation: explanation.trim(),
          conclusion: studentConclusion,
        });
      } else if (question.type === "text" || question.type === "image") {
        // For text questions, use our enhanced similarity comparison
        if (question.answer) {
          const similarity = compareAnswers(answer, question.answer);
          const maxPoints = Number(question.points) || 1;

          // Calculate score based on similarity percentage
          score = Math.round((similarity / 100) * maxPoints);

          details = {
            userAnswer: answer,
            correctAnswer: question.answer,
            explanation: explanation.trim(), // Include student explanation
            similarity: similarity.toFixed(1) + "%",
            score,
            maxPoints,
          };

          // Save both the answer and explanation
          answerToSave = JSON.stringify({
            answer,
            explanation: explanation.trim(),
          });
        }
      }

      setScoringDetails(details);

      // Get teacher findings from the question data
      let teacherFindingsForPayload = '';
      if (exam && exam.questions && Array.isArray(exam.questions)) {
        const currentQuestion = exam.questions.find((q) => q.id === currentQuestionId);
        if (currentQuestion) {
          if (currentQuestion.explanation) {
            try {
              const parsed = JSON.parse(currentQuestion.explanation);
              if (typeof parsed.explanation === 'string') teacherFindingsForPayload = parsed.explanation;
              else if (parsed.explanation?.text) teacherFindingsForPayload = parsed.explanation.text;
              else teacherFindingsForPayload = currentQuestion.answer;
            } catch {
              teacherFindingsForPayload = currentQuestion.answer || '';
            }
          } else {
            teacherFindingsForPayload = currentQuestion.answer || '';
          }
        }
      } else if (question && question.answer) {
        // Fallback to question state if questions array doesn't exist
        // For forensic exams, question.answer is JSON, extract the expected conclusion
        try {
          const parsed = JSON.parse(question.answer);
          if (parsed.explanation?.conclusion) {
            teacherFindingsForPayload = parsed.explanation.conclusion;
          } else if (typeof parsed.explanation === 'string') {
            teacherFindingsForPayload = parsed.explanation;
          } else {
            teacherFindingsForPayload = question.answer;
          }
        } catch {
          // If not JSON, use as-is
          teacherFindingsForPayload = question.answer;
        }
      }

      // Extract student findings - handle both JSON and plain text
      let studentFindingsForPayload = '';
      let conclusionIsCorrect = false;
      
      if (answerToSave) {
        try {
          const parsed = JSON.parse(answerToSave);
          // For forensic exams with conclusion field
          if (parsed.conclusion) {
            studentFindingsForPayload = parsed.conclusion;
          } else if (parsed.explanation) {
            // For other types with explanation
            studentFindingsForPayload = parsed.explanation;
          } else if (parsed.answer) {
            // For text answers
            studentFindingsForPayload = parsed.answer;
          } else {
            // Use the entire JSON string
            studentFindingsForPayload = answerToSave;
          }
        } catch {
          // If not JSON, use as-is
          studentFindingsForPayload = answerToSave;
        }
      }

      // Check if conclusion is correct (based on explanationDetails which was populated above)
      if (details && details.explanationDetails) {
        conclusionIsCorrect = details.explanationDetails.conclusionMatched === true;
      }

      const payload = {
        student_id,
        exam_id: exam.id,
        answer: answerToSave,
        explanation: explanation.trim(),
        date: new Date().toISOString().split("T")[0],
        score,
        tab_switches: tabSwitchCount,
        details: JSON.stringify(details),
        studentFindings: studentFindingsForPayload,
        teacherFindings: teacherFindingsForPayload,
        conclusionCorrect: conclusionIsCorrect,
      };

      // Submit the exam
      const response = await fetch(`${API_BASE_URL}/api/exams/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        navigate("/student/exams");
        return;
      }

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to submit exam" }));
        throw new Error(errorData.error || "Failed to submit exam");
      }

      toast({
        title: "Exam Submitted",
        description:
          score !== null
            ? `Your answers have been recorded successfully.`
            : "Your answers have been recorded successfully.",
      });

      sessionStorage.removeItem("currentExam");
      sessionStorage.removeItem("examStartTimestamp");
      navigate("/student/results");
    } catch (err: any) {
      toast({
        title: "Error",
        description:
          err.message || "Failed to submit your exam. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handleBackClick = () => {
    setShowLeaveDialog(true);
  };

  const handleConfirmLeave = () => {
    sessionStorage.removeItem("currentExam");
    sessionStorage.removeItem("examStartTimestamp");
    navigate("/student");
  };

  if (!exam || !question) return <div className="p-4">Loading...</div>;

  // Render answer input based on question type
  let answerInput = null;

  // For forensic document questions
  let forensicRows = [];
  try {
    const parsedAnswer = JSON.parse(question.answer || "{}");
    // Check if the answer has the new format with specimens array
    if (parsedAnswer.specimens && Array.isArray(parsedAnswer.specimens)) {
      forensicRows = parsedAnswer.specimens;
    } else if (Array.isArray(parsedAnswer)) {
      // Fallback to the old format if needed
      forensicRows = parsedAnswer;
    }

    // Final safety check - ensure forensicRows is an array
    if (!Array.isArray(forensicRows)) {
      console.error(
        "forensicRows is not an array after parsing, resetting to empty array"
      );
      forensicRows = [];
    }
  } catch (error) {
    console.error("Error parsing forensic answer:", error);
    forensicRows = [];
  }

  // Get the columns from the first row (excluding points and pointType which are metadata)
  const columns =
    forensicRows.length > 0
      ? Object.keys(forensicRows[0]).filter((col) => !["points", "pointType"].includes(col))
      : [];

  // Split the stored image string into question vs standard images.
  // Convention: AddQuestionDialog saves [standard..., question...] with counts in metadata
  let questionImages: string[] = [];
  let standardImages: string[] = [];
  if (question.image) {
    const allImages = question.image.includes("|") ? question.image.split("|") : [question.image];
    
    try {
      const parsedAnswer = JSON.parse(question.answer || "{}");
      const metadata = parsedAnswer.imageMetadata;
      
      if (metadata && typeof metadata.standardImageCount === 'number' && typeof metadata.questionImageCount === 'number') {
        // Use metadata to split images correctly
        const standardCount = metadata.standardImageCount;
        const questionCount = metadata.questionImageCount;
        standardImages = allImages.slice(0, standardCount);
        questionImages = allImages.slice(standardCount, standardCount + questionCount);
      } else {
        // Fallback: no metadata, use old heuristic based on forensic rows
        const qCount = Math.max(1, forensicRows.length);
        if (allImages.length < qCount) {
          questionImages = allImages.slice();
          standardImages = [];
        } else {
          const newQ = allImages.slice(allImages.length - qCount);
          const newS = allImages.slice(0, Math.max(0, allImages.length - qCount));
          const oldQ = allImages.slice(0, qCount);
          const oldS = allImages.slice(qCount);
          if (newS.length === 0 && oldS.length > 0) {
            questionImages = oldQ;
            standardImages = oldS;
          } else if (oldS.length === 0 && newS.length > 0) {
            questionImages = newQ;
            standardImages = newS;
          } else {
            questionImages = newQ;
            standardImages = newS;
          }
        }
      }
    } catch (e) {
      console.error('Error parsing question answer for image metadata:', e);
      // Fallback to simple split
      const qCount = Math.max(1, forensicRows.length);
      if (allImages.length >= qCount) {
        questionImages = allImages.slice(Math.max(0, allImages.length - qCount));
        standardImages = allImages.slice(0, Math.max(0, allImages.length - qCount));
      } else {
        questionImages = allImages;
        standardImages = [];
      }
    }
  }

  answerInput = (
    <>
      {question.image && (
        <div className="mb-3">
          {(questionImages.length + standardImages.length) > 1 ? (
            <MultiImageDisplay questionImages={questionImages} standardImages={standardImages} />
          ) : (
            // Single image fallback (either a questioned or standard image)
            <ImageFullScreen src={questionImages[0] || standardImages[0] || question.image} alt="Forensic Document" />
          )}
        </div>
      )}
      
      {/* Keyword Pool Display */}
      {question.keyword_pool_name && question.keyword_pool_keywords && (
        <div className="mb-4 p-4 bg-gray-50 border rounded-lg">
          <div className="mb-2">
            <h4 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1">
              <Tags className="h-4 w-4" />
              Available Keywords: {question.keyword_pool_name}
            </h4>
            {question.keyword_pool_description && (
              <p className="text-xs text-gray-600 mb-2">
                {question.keyword_pool_description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {(() => {
              try {
                const keywords = typeof question.keyword_pool_keywords === 'string'
                  ? JSON.parse(question.keyword_pool_keywords)
                  : question.keyword_pool_keywords;
                
                // If selected_keywords exist, show only those; otherwise show all keywords
                const keywordsToShow = question.selected_keywords ? (() => {
                  try {
                    return typeof question.selected_keywords === 'string'
                      ? JSON.parse(question.selected_keywords)
                      : question.selected_keywords;
                  } catch (e) {
                    console.error('Error parsing selected keywords:', e);
                    return keywords;
                  }
                })() : keywords;
                
                return Array.isArray(keywordsToShow) ? keywordsToShow.map((keyword: string, index: number) => (
                  <span
                    key={index}
                    className="inline-block px-2 py-1 text-xs bg-white border border-gray-300 rounded-md text-gray-700"
                  >
                    {keyword}
                  </span>
                )) : [];
              } catch (e) {
                console.error('Error parsing keywords:', e);
                return [];
              }
            })()}
          </div>
        </div>
      )}
      
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full border text-sm mb-3">
          <thead>
            <tr>
              <th className="border p-1 text-xs bg-gray-50 w-12">#</th>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="border p-1 capitalize text-xs bg-gray-50"
                >
                  {col.replace(/([A-Z])/g, " $1")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forensicRows.map((row: any, rowIdx: number) => (
              <tr key={rowIdx}>
                <td className="border p-1 text-center font-medium bg-gray-50">
                  {rowIdx + 1}
                </td>
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="border p-1">
                    <input
                      className="w-full px-2 py-1 text-sm"
                      value={answer[rowIdx]?.[col] || ""}
                      onChange={(e) => {
                        const arr = Array.isArray(answer)
                          ? [...answer]
                          : Array(forensicRows.length).fill({});
                        arr[rowIdx] = {
                          ...arr[rowIdx],
                          [col]: e.target.value,
                        };
                        setAnswer(arr);
                      }}
                      placeholder={`Enter ${col}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="container max-w-4xl mx-auto px-2 py-4">
      {/* Sticky header with timer and leave button (styled like submit) */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground py-2 mb-4 border-b flex justify-between items-center px-4 w-full">
        <Button onClick={handleBackClick} size="sm" className="bg-red-600 text-white hover:bg-red-700">
          Leave Exam
        </Button>
        <div className="text-3xl font-mono px-4 py-2 rounded-md">
          {formatTime(timeLeft)}
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-lg">
            {exam.name} - Question
            {tabSwitchCount > 0 && (
              <span className="ml-2 text-sm text-red-500 font-normal">
                Tab switched {tabSwitchCount} times
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 space-y-4">
          <p>{question.text}</p>
          {rubrics && (
            <div className="bg-gray-50 border rounded-md p-3 text-sm">
              <div className="font-semibold mb-1">Instructor rubric weights</div>
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Accuracy</strong><div className="text-muted-foreground">{rubrics.accuracy}%</div></div>
                <div><strong>Completeness</strong><div className="text-muted-foreground">{rubrics.completeness}%</div></div>
                <div><strong>Clarity</strong><div className="text-muted-foreground">{rubrics.clarity}%</div></div>
                <div><strong>Objectivity</strong><div className="text-muted-foreground">{rubrics.objectivity}%</div></div>
              </div>
            </div>
          )}
          {answerInput}

          {/* Forensic Conclusion Selection - only show for forensic questions */}
          {question.type === "forensic" && (
            <div className="space-y-2 mt-6 border-t pt-4">
              <label className="block text-sm font-medium">
                Forensic Conclusion <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col md:flex-row gap-2">
                <Button
                  type="button"
                  variant={studentConclusion === "fake" ? "default" : "outline"}
                  onClick={() => setStudentConclusion("fake")}
                  className="flex-1 w-full"
                >
                  Not Written by the Same Person
                </Button>
                <Button
                  type="button"
                  variant={studentConclusion === "real" ? "default" : "outline"}
                  onClick={() => setStudentConclusion("real")}
                  className="flex-1 w-full"
                >
                  Written by the Same Person
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Required:</strong> Select whether you believe the specimen is fake or real based on your analysis.
                This selection will affect your exam score.
              </p>
            </div>
          )}

          {/* Explanation field */}
          <div className="space-y-2 mt-6 border-t pt-4">
            <label htmlFor="explanation" className="block text-sm font-medium">
              Findings
            </label>
            <textarea
              id="explanation"
              rows={4}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="Provide any additional explanation for your answers... "
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            ></textarea>
            <p className="text-xs text-muted-foreground">
              This explanation will be reviewed by your instructor.
              Your grade is based on the table answers and the fake/real conclusion above.
            </p>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleConfirmSubmit}>Submit Exam</Button>
          </div>
        </CardContent>
      </Card>

      {/* Leave Confirmation Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
            <AlertDialogDescription>
              If you leave now, your exam progress will be lost and you may not
              be able to retake this exam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLeave}
              className="bg-red-500 hover:bg-red-600"
            >
              Yes, leave exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your exam?</AlertDialogTitle>
            <AlertDialogDescription>
              {timeLeft <= 0
                ? "Time's up! Your exam will be submitted now."
                : "Are you sure you want to submit your exam? You won't be able to change your answers after submission."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {timeLeft > 0 && (
              <AlertDialogCancel>Continue working</AlertDialogCancel>
            )}
            <AlertDialogAction onClick={handleSubmit} className="bg-primary">
              Submit exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TakeExam;
