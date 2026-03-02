import { useEffect, useState, useRef } from "react";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Eye, ArrowUpDown, ArrowUp, ArrowDown, FileText, Tags, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import topLogo from '@/assets/top-logo.png';
import bottomLogo from '@/assets/bottom-logo.png';

// Helper function to create auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

import { useNavigate } from "react-router-dom";

const Results = () => {
  const navigate = useNavigate();
  const [results, setResults] = useState<any[]>([]);
    const [aiQueueMap, setAiQueueMap] = useState<Record<string, any>>({});
    const [requeueLoading, setRequeueLoading] = useState<Record<string, boolean>>({});
    const [isReloading, setIsReloading] = useState<boolean>(false);
  const [filteredResults, setFilteredResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [selectedAiGrade, setSelectedAiGrade] = useState<any>(null);
  // view mode: taken results, available upcoming/open exams, or missed (past but not taken)
  const [viewMode, setViewMode] = useState<'taken' | 'available' | 'missed'>('taken');
  const [showMissedExams, setShowMissedExams] = useState(false); // legacy flag, kept for compatibility
  const [missedExams, setMissedExams] = useState<any[]>([]); // exams not yet taken
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // cache questions keyed by exam_id so details view can fall back to question metadata
  const [questionCache, setQuestionCache] = useState<Record<string, any>>({});

  // Default sort: most recent submissions first (date desc)
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>({ key: 'date', direction: 'desc' });
  const { toast } = useToast();
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({});
  const [courses, setCourses] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isMobileDevice = () => typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 600px)')?.matches || /Mobi|Android/i.test(navigator.userAgent));

  // Fetch results from API
  const fetchStudentResults = () => {
    const token = localStorage.getItem("token");
    if (!token) return Promise.reject("No token");
    const decoded: JwtTokenPayload = jwtDecode(token);
    const studentId = decoded.id;

    return fetch(`${API_BASE_URL}/api/exams/student/${studentId}/results`, {
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
        const resultsData = Array.isArray(data) ? data : [];
        setResults(resultsData);
        setFilteredResults(resultsData);
        // kick off background fetch of AI grades (non-blocking)
        fetchAiGradesForResults(resultsData);
        // fetch ai_queue status for these results so we can show requeue button when eligible
        fetchAiQueueForResults(resultsData);
        // fetch courses for name mapping
        fetch(`${API_BASE_URL}/api/courses`, { headers: getAuthHeaders() })
          .then((r) => r.ok ? r.json() : [])
          .then((courseList) => {
            if (Array.isArray(courseList)) setCourses(courseList);
          })
          .catch(() => {});
      })
      .catch(err => {
        console.error('Error fetching results:', err);
        toast({
          title: "Error",
          description: "Failed to fetch exam results.",
          variant: "destructive",
        });
      });
  };

  useEffect(() => {
    fetchStudentResults();
  }, []);

  // Fetch all exams to determine which ones are missed
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const decoded: JwtTokenPayload = jwtDecode(token);
    const studentId = decoded.id;

    // Use the updated upcoming endpoint which can return past exams when includePast=true
    fetch(`${API_BASE_URL}/api/exams/student/${studentId}/upcoming?includePast=true`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const allExams = Array.isArray(data) ? data : [];
        console.log('[DEBUG] Fetched exams (including past) from endpoint:', allExams);
        
        const takenExamIds = new Set(results.map(r => r.exam_id || r.examId));
        console.log('[DEBUG] Taken exam IDs:', Array.from(takenExamIds));
        
        const now = new Date();
        console.log('[DEBUG] Current time:', now.toISOString());
        
        // Filter for exams that:
        // 1. Have NOT been taken (not in results)
        // 2. Have a deadline/end date that has PASSED
        const missedExams = allExams
          .filter((exam: any) => {
            const examId = exam.id != null ? Number(exam.id) : null;
            
            // Skip if exam is taken or no valid ID
            if (!examId || takenExamIds.has(examId)) {
              return false;
            }
            
            // Exam must have an end date that is in the past
            if (exam.end) {
              const endDate = new Date(exam.end);
              const isDeadlinePassed = now > endDate;
              console.log(`[DEBUG] Exam ${exam.id} (${exam.name}): end=${exam.end}, now=${now.toISOString()}, deadlinePassed=${isDeadlinePassed}`);
              return isDeadlinePassed;
            }
            
            // Fallback: if end date doesn't exist, check start date
            // An exam is missed if start date is in past AND exam hasn't been taken
            if (exam.start) {
              const startDate = new Date(exam.start);
              const isStartedAndPassed = now > startDate;
              console.log(`[DEBUG] Exam ${exam.id} (${exam.name}): start=${exam.start}, now=${now.toISOString()}, startedAndPassed=${isStartedAndPassed}`);
              return isStartedAndPassed;
            }
            
            console.log(`[DEBUG] Exam ${exam.id} (${exam.name}) has no start or end date`);
            return false;
          })
          .sort((a: any, b: any) => {
            const dateA = a.start ? new Date(a.start).getTime() : 0;
            const dateB = b.start ? new Date(b.start).getTime() : 0;
            return dateB - dateA; // Most recent first
          });
        
        console.log('[DEBUG] Filtered missed exams:', missedExams);
        setMissedExams(missedExams);

        // compute available exams (not taken, deadline not passed)
        const available = allExams
          .filter((exam: any) => {
            const examId = exam.id != null ? Number(exam.id) : null;
            if (!examId || takenExamIds.has(examId)) return false;
            const now = new Date();
            // exclude past deadlines
            if (exam.end) {
              if (now > new Date(exam.end)) return false;
            }
            // include exams that are either open or not started yet
            return true;
          })
          .map((exam: any) => {
            const now = new Date();
            const start = exam.start ? new Date(exam.start) : null;
            const end = exam.end ? new Date(exam.end) : null;
            let status: 'open' | 'not_started' | 'closed' = 'open';
            if (start && now < start) {
              status = 'not_started';
            } else if (start && now >= start && end && now > end) {
              status = 'closed';
            }
            return { ...exam, status };
          })
          .sort((a: any, b: any) => {
            const aTime = a.start ? new Date(a.start).getTime() : 0;
            const bTime = b.start ? new Date(b.start).getTime() : 0;
            return bTime - aTime;
          });
        console.log('[DEBUG] Computed available exams:', available);
        setAvailableExams(available);
        if (viewMode === 'available') {
          // apply any existing search term
          if (searchTerm.trim() === "") {
            setFilteredResults(available);
          } else {
            const term = searchTerm.toLowerCase();
            const filtered = available.filter(item => {
              const examName = (item.name || item.examName || "").toString().toLowerCase();
              const courseName = ((item.course || item.course_name || item.course_code || "")).toString().toLowerCase();
              const formattedDate = (item.start ? formatDate(item.start) : "").toString().toLowerCase();
              return examName.includes(term) || courseName.includes(term) || formattedDate.includes(term);
            });
            setFilteredResults(filtered);
          }
        }
      })
      .catch(err => console.error('Error fetching missed exams:', err));
  }, [results, viewMode, searchTerm]);

  // Reset pagination when toggling mode or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, searchTerm]);

  // when a result is selected, ensure we have the underlying question cached
  useEffect(() => {
    if (!selectedResult) return;
    const examId = selectedResult.exam_id || selectedResult.examId;
    if (!examId) return;
    if (questionCache[String(examId)]) return; // already fetched

    // fetch exam record then question
    fetch(`${API_BASE_URL}/api/exams/${examId}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(exam => {
        if (exam && exam.question_id) {
          return fetch(`${API_BASE_URL}/api/questions/${exam.question_id}`, { headers: getAuthHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(q => {
              if (q) {
                setQuestionCache(prev => ({ ...prev, [String(examId)]: q }));
              }
            })
            .catch(err => console.error("Failed to fetch question", err));
        }
      })
      .catch(err => console.error("Failed to fetch exam for cache", err));
  }, [selectedResult, questionCache]);

  // Poll for pending AI grades every 5 seconds to show updates as they complete
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (results && results.length > 0) {
        // Check for results that don't have AI grades yet
        const pendingGrades = results
          .filter(r => {
            const key = `${r.student_id || r.studentId}_${r.exam_id || r.examId}`;
            return aiScores[key] === undefined; // undefined = not yet fetched
          });
        
        if (pendingGrades.length > 0) {
          // Refetch AI grades for pending items
          fetchAiGradesForResults(pendingGrades);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [results, aiScores]);

  // Helper function to safely call trim on a value
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return "";
    return typeof value === 'string' ? value : String(value);
  };

  // Parse date string, treating timezone-less timestamps as Asia/Manila local time
  const parseDateRespectingManila = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const s = String(dateStr);
    // If string contains explicit timezone (Z or ±HH:MM), let Date handle it
    if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    // Try parse ISO-like without timezone: YYYY-MM-DDTHH:MM[:SS]
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const day = Number(m[3]);
      const hh = Number(m[4]);
      const mm = Number(m[5]);
      const ss = Number(m[6] || '0');
      // Treat the provided wall time as Asia/Manila (UTC+8). To get the correct UTC instant,
      // compute UTC milliseconds for that wall time then subtract the +08:00 offset.
      const manilaOffsetMs = 8 * 60 * 60 * 1000;
      const utcMs = Date.UTC(y, mo, day, hh, mm, ss) - manilaOffsetMs;
      const d = new Date(utcMs);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  // Format date for display (e.g., Nov 25, 2025)
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const dateObj = parseDateRespectingManila(dateStr);
      if (!dateObj) return String(dateStr).split('T')[0] || String(dateStr);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' };
      return dateObj.toLocaleDateString('en-US', options);
    } catch (e) {
      try { return String(dateStr).split('T')[0]; } catch { return String(dateStr); }
    }
  };

  // Format date range (e.g., Jan 15, 2025 - Jan 20, 2025 7:00 pm)
  const formatTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    try {
      const dObj = parseDateRespectingManila(dateStr);
      if (!dObj) return "";
      const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' };
      return dObj.toLocaleTimeString('en-US', options).toLowerCase();
    } catch (e) {
      return "";
    }
  };

  const formatDateRange = (startStr: string | null | undefined, endStr: string | null | undefined): React.ReactNode => {
    const start = formatDate(startStr);
    const startTime = startStr ? formatTime(startStr) : "";
    if (!endStr) return <>{start}{startTime ? <> <span className="text-[10px] italic text-muted-foreground">{startTime}</span></> : null}</>;
    const endDay = formatDate(endStr);
    const endTime = endStr ? formatTime(endStr) : "";

    if (start === "-" && endDay === "-") return "-";
    if (start === "-") {
      return (
        <>
          -<br />
          {endDay}
          {endTime && (
            <> <span className="text-[10px] italic text-muted-foreground">{endTime}</span></>
          )}
        </>
      );
    }
    if (endDay === "-") return <>{start}{startTime ? <> <span className="text-[10px] italic text-muted-foreground">{startTime}</span></> : null}</>;
    return (
      <>
        {start}{startTime ? <> <span className="text-[10px] italic text-muted-foreground">{startTime}</span></> : null} -<br />
        {endDay}{endTime ? <> <span className="text-[10px] italic text-muted-foreground">{endTime}</span></> : null}
      </>
    );
  };

  // Get findings max points from exam (default to 20 if not found)
  const getFindingsMaxPoints = (result: any) => {
    try {
      if (!result) return 20;
      // Check for explicit findings points field
      if (result.findings_points !== undefined && result.findings_points !== null) return Number(result.findings_points);
      if (result.findingsPoints !== undefined && result.findingsPoints !== null) return Number(result.findingsPoints);
      if (result.explanation_points !== undefined && result.explanation_points !== null) return Number(result.explanation_points);
      if (result.explanationPoints !== undefined && result.explanationPoints !== null) return Number(result.explanationPoints);
      // Fallback to 20
      return 20;
    } catch (e) {
      return 20;
    }
  };

  // Convert percentage to points based on max
  const pointsFromPercent = (percent: number | null, maxPoints: number | null) => {
    if (percent === null || percent === undefined) return null;
    if (maxPoints === null || maxPoints === undefined || Number.isNaN(Number(maxPoints))) return null;
    return Math.round((Number(percent) / 100) * Number(maxPoints));
  };

  // Resolve course name from courses list or fallback to id/string
  const resolveCourseName = (cid: any) => {
    if (!cid) return cid || '';
    const found = courses.find((c) => String(c.id) === String(cid) || String(c.course_id) === String(cid) || String(c.name) === String(cid));
    return found ? found.name || found.course || String(cid) : String(cid);
  };

  // Resolve exam name from exams list or fallback to id/string
  const resolveExamName = (eid: any) => {
    if (!eid) return eid || '';
    const found = exams.find((e) => String(e.id) === String(eid) || String(e.exam_id) === String(eid) || String(e.name) === String(eid));
    return found ? found.name || String(eid) : String(eid);
  };

  // Default rubric weights used for fallback distribution when component scores are missing/zero
  // Weights as percentages: Completeness 70%, Objectivity 15%, Structure/Reasoning 15%
  const DEFAULT_RUBRIC_WEIGHTS: Record<string, number> = {
    findingsSimilarity: 70, // stored key remains findingsSimilarity for compatibility
    objectivity: 15,
    structure: 15,
  };

  const RUBRIC_LABELS: Record<string, string> = {
    findingsSimilarity: "Completeness (conclusion + keywords)",
    objectivity: "Objectivity (no subjective words)",
    structure: "Structure / Reasoning (reasoning words)",
  };

  // Search function - updated to work with taken/missed/available modes
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);

    const getSource = () => {
      if (viewMode === 'missed') return missedExams;
      if (viewMode === 'available') return availableExams;
      return results;
    };
    const sourceData = getSource();

    if (term.trim() === "") {
      setFilteredResults(sourceData);
    } else {
      const filtered = sourceData.filter(item => {
        const examName = (item.examName || item.exam_name || item.name || "").toString().toLowerCase();
        const courseName = ((item.course_name || item.course_code || item.course || "")).toString().toLowerCase();
        const formattedDate = (item.date ? formatDate(item.date) : (item.start ? formatDate(item.start) : "")).toString().toLowerCase();
        const score = (item.score || "").toString().toLowerCase();

        return examName.includes(term) || 
               courseName.includes(term) || 
               formattedDate.includes(term) ||
               score.includes(term);
      });
      setFilteredResults(filtered);
    }
  };

  // Switch view mode buttons
  const handleSwitchMode = (mode: 'taken' | 'available' | 'missed') => {
    setViewMode(mode);
    // maintain legacy flag for compatibility
    setShowMissedExams(mode === 'missed');
    const sourceData = mode === 'missed' ? missedExams : mode === 'available' ? availableExams : results;

    if (searchTerm.trim() === "") {
      setFilteredResults(sourceData);
    } else {
      // re-run search on new source
      const term = searchTerm.toLowerCase();
      const filtered = sourceData.filter(item => {
        const examName = (item.examName || item.exam_name || item.name || "").toString().toLowerCase();
        const courseName = ((item.course_name || item.course_code || item.course || "")).toString().toLowerCase();
        const formattedDate = (item.date ? formatDate(item.date) : (item.start ? formatDate(item.start) : "")).toString().toLowerCase();
        const score = (item.score || "").toString().toLowerCase();

        return examName.includes(term) || 
               courseName.includes(term) || 
               formattedDate.includes(term) ||
               score.includes(term);
      });
      setFilteredResults(filtered);
    }
    setCurrentPage(1);
  };

  // Pagination placeholders — will compute from processedResults later
  // (kept here to preserve variable ordering while we compute the real values after processing)
  let paginatedResults: any[] = [];
  let totalPages = 0;

  // Sort function
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get sort icon
  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  // Printing removed: print/export buttons were removed per request

  // Fetch AI grade for a particular result when user opens details
  const fetchAiGradeForResult = async (studentId: number, examId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-grader/result/${studentId}/${examId}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        setSelectedAiGrade(null);
        // set map entry as null to indicate not available
        setAiScores((prev) => ({ ...prev, [`${studentId}_${examId}`]: null }));
        return null;
      }
      const data = await res.json();
      // store findings score in map for row display
      const overall = Number(data.score ?? data.overall ?? NaN);
      setAiScores((prev) => ({ ...prev, [`${studentId}_${examId}`]: Number.isNaN(overall) ? null : Math.round(overall) }));
      setSelectedAiGrade(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch AI grade:', err);
      setSelectedAiGrade(null);
      setAiScores((prev) => ({ ...prev, [`${studentId}_${examId}`]: null }));
      return null;
    }
  };

  // Print individual exam result (original full implementation)
  const handlePrintExam = async (result: any) => {
    // Preload images to ensure they're available before print window opens
    const preloadImage = (src: string): Promise<void> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // resolve even if failed
        img.src = src;
      });
    };

    try {
      await preloadImage(topLogo);
      await preloadImage(bottomLogo);
    } catch (e) {
      console.error('Error preloading images:', e);
    }

    // Try to fetch AI grade so we can include rubric breakdown in the printout
    let aiGradeData = null;
    try {
      aiGradeData = await fetchAiGradeForResult(result.student_id || result.studentId, result.exam_id || result.examId);
    } catch (e) {
      console.error('Error fetching AI grade for print:', e);
      aiGradeData = null;
    }

  // Ensure imported images resolve to absolute URLs so print popup can load them
  const topLogoUrl = new URL(topLogo, import.meta.url).href;
  const bottomLogoUrl = new URL(bottomLogo, import.meta.url).href;

  // detect mobile
  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 600px)')?.matches || /Mobi|Android/i.test(navigator.userAgent));

  // helper to dynamically load script
  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if ((window as any).html2pdf) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });

  // Header and footer (logos) to ensure they always appear in printouts
  const headerHtml = `<div style="text-align:center; margin-bottom: 10px;"><img src="${topLogoUrl}" alt="Top Logo" class="print-logo-top" style="width:300px; height:auto; display:block; margin:0 auto; max-width:90%;"/></div>`;
  const footerHtml = `<div class="print-footer" style="margin-top: 20px;"><img src="${bottomLogoUrl}" class="print-logo-bottom" alt="Bottom Logo" style="width:200px; max-width:70%; height:auto;"/></div>`;

  // Generate detailed exam content (body only; logos added by header/footer)
  let examContent = `
        <div class="exam-header">
          <h1>Exam Result: ${result.examName}</h1>
          <div class="exam-info" style="margin-top: 12px;">
            <p><strong>Course:</strong> ${result.course}</p>
            <p><strong>Date:</strong> ${result.date}</p>
            <p><strong>Table score:</strong> ${result.totalPoints && result.totalPoints > 0
        ? `${result.score}% (${result.earnedPoints}/${result.totalPoints} pts)`
        : result.raw_score !== undefined && result.raw_total !== undefined
          ? `${result.score}% (${result.raw_score}/${result.raw_total})`
          : (result.score !== undefined ? `${result.score}%` : "-")}</p>
            <p><strong>Findings score:</strong> ${(() => {
            const key = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
            const v = aiScores[key];
            const findingsMaxPts = getFindingsMaxPoints(result);
            const pts = pointsFromPercent(v, findingsMaxPts);
            return v === undefined ? 'Loading...' : (v === null ? 'N/A' : `${v}% ${pts !== null ? `(${pts}/${findingsMaxPts})` : ''}`);
          })()}</p>
          </div>
        </div>
    `;

    // NOTE: Keyword pool removed from printed output per request.

    // Add AI rubric breakdown if available
    if (aiGradeData) {
      try {
        const overall = Number(aiGradeData.score ?? aiGradeData.overall ?? NaN);
        const dbKeys = ['accuracy', 'objectivity', 'structure'];
        const displayKeyMap: Record<string, string> = { accuracy: 'completeness', objectivity: 'objectivity', structure: 'structure' };
        
        // Read raw component values (may be undefined/null/0)
        const rawVals = dbKeys.map(k => {
          const v = aiGradeData?.[k];
          const n = v === undefined || v === null ? null : (Number.isNaN(Number(v)) ? null : Number(v));
          return n;
        });

        // Determine if any component has a positive real value (>0)
        const anyPositive = rawVals.some(v => v !== null && v > 0);

        // Prepare display values
        const displayVals: Record<string, number | null> = {
          completeness: null,
          objectivity: null,
          structure: null,
        };

        if (anyPositive) {
          // Map database keys to display keys and use all actual values (including explicit 0s)
          dbKeys.forEach((dbKey, i) => {
            const displayKey = displayKeyMap[dbKey];
            const v = rawVals[i];
            if (v !== null) {
              displayVals[displayKey] = Math.max(0, Math.min(100, Math.round(v)));
            } else {
              // null means no data, treat as 0
              displayVals[displayKey] = 0;
            }
          });
        } else if (!Number.isNaN(overall)) {
          // No positive components present: compute all by formula S × (W / 100)
          Object.keys(displayVals).forEach((displayKey) => {
            const weight = (DEFAULT_RUBRIC_WEIGHTS[displayKey] || 0) / 100;
            const computed = Math.round(Math.round(overall) * weight);
            displayVals[displayKey] = Math.max(0, Math.min(100, computed));
          });
        }

        const fmtComp = (val: number | null) => {
          return val === null ? '-' : `${Math.round(val)}%`;
        };

        examContent += `
          <div style="margin: 20px 0; padding: 12px; background: #f5f5f5; border-radius: 4px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px;">Rubric Breakdown</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px;">
              <div><strong>Completeness:</strong> ${fmtComp(displayVals.completeness)}</div>
              <div><strong>Objectivity:</strong> ${fmtComp(displayVals.objectivity)}</div>
              <div><strong>Structure / Reasoning:</strong> ${fmtComp(displayVals.structure)}</div>
              <div style="grid-column: 1 / -1; margin-top: 8px;"><strong>Overall Score:</strong> ${!Number.isNaN(overall) ? `${Math.round(overall)}%` : '-'}</div>
            </div>
            ${aiGradeData.feedback ? `<div style="margin-top: 10px;"><strong>AI Explanation:</strong><div style="margin-top: 6px; white-space: pre-wrap; font-size: 12px;">${aiGradeData.feedback}</div></div>` : ''}
          </div>
        `;
      } catch (e) {
        console.error('Error adding AI rubric to print:', e);
      }
    }

    // Add detailed answers for forensic questions
    if (result.answer || result.details) {
      try {
        // Parse answer
        const rawAnswer = typeof result.answer === 'string' 
          ? JSON.parse(result.answer)
          : result.answer;
        const tableAnswers = rawAnswer.tableAnswers || [];

        // Parse details to get row details
        const detailsObj = typeof result.details === 'string'
          ? JSON.parse(result.details)
          : result.details;
        
        const rowDetails = detailsObj.rowDetails || [];
        
        // Get columns from first row's columnScores
        let columns: string[] = [];
        if (rowDetails.length > 0 && rowDetails[0].columnScores) {
          columns = Object.keys(rowDetails[0].columnScores);
          // ensure standard specimen column is shown before question specimen
          if (columns.includes("standardSpecimen") && columns.includes("questionSpecimen")) {
            columns = [
              "standardSpecimen",
              "questionSpecimen",
              ...columns.filter(c => !["standardSpecimen", "questionSpecimen"].includes(c)),
            ];
          }
        }

        if (columns.length > 0 && rowDetails.length > 0) {
          examContent += `
            <div class="answers-section" style="margin: 25px 0;">
              <h2 style="font-size: 16px; margin: 0 0 12px 0;">Answer Details</h2>
              <table class="answers-table">
                <thead>
                  <tr>
                    <th>#</th>
                    ${columns.map(col => `<th>${col}</th>`).join('')}
                    <th>Result/Points</th>
                  </tr>
                </thead>
                <tbody>
          `;

          rowDetails.forEach((row: any, rowIdx: number) => {
            const rowCorrectCount = Object.values(row.columnScores || {}).filter((col: any) => col.isExactMatch).length;
            const allCorrectForRow = row.correct || false;
            const rowPoints = row.possiblePoints || 1;

            examContent += `<tr><td>${rowIdx + 1}</td>`;

            columns.forEach((col) => {
              const colScore = row.columnScores?.[col] || {};
              const isCorrect = colScore.isExactMatch || false;
              const studentValue = colScore.userValue || "-";
              const correctValue = colScore.correctValue || "-";

              examContent += `
                <td class="${isCorrect ? 'correct' : 'incorrect'}">
                  <div>
                    <span>${studentValue}</span>
                    <span class="indicator">${isCorrect ? '✓' : '✗'}</span>
                    ${!isCorrect ? `<br><small>Correct: ${correctValue}</small>` : ''}
                  </div>
                </td>
              `;
            });

            examContent += `
              <td class="${allCorrectForRow ? 'correct' : 'incorrect'}">
                ${rowCorrectCount}/${columns.length}<br>
                <small>${allCorrectForRow ? `+${rowPoints} pts` : `0/${rowPoints} pts`}</small>
              </td>
            </tr>`;
          });

          examContent += `</tbody></table>`;
        }

        // Add conclusion section
        let studentConclusion = "";
        let expectedConclusion = "";

        if (rawAnswer.conclusion) {
          studentConclusion = rawAnswer.conclusion;
        }

        if (detailsObj.explanationDetails && detailsObj.explanationDetails.expectedConclusion) {
          expectedConclusion = detailsObj.explanationDetails.expectedConclusion;
        }

        // Helper function to convert conclusion to readable text
        const formatConclusion = (conclusion: string) => {
          if (conclusion === "fake") return "Not Written by Same Person";
          if (conclusion === "real") return "Written by Same Person";
          return conclusion.charAt(0).toUpperCase() + conclusion.slice(1);
        };

        if (studentConclusion || expectedConclusion) {
          const conclusionMatch = studentConclusion && expectedConclusion && studentConclusion === expectedConclusion;
          examContent += `
            <div class="conclusion-section" style="margin: 25px 0; padding: 16px; background: #f8f9fa; border-radius: 8px;">
              <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; font-weight: 600;">Forensic Conclusion</h3>
              ${studentConclusion ? `
                <p style="margin: 6px 0; font-size: 13px;"><strong>Your Conclusion:</strong> ${formatConclusion(studentConclusion)} ${conclusionMatch ? '<span style="color: #28a745; font-weight: 600;">✓ Correct</span>' : (expectedConclusion ? '<span style="color: #dc3545; font-weight: 600;">✗ Incorrect</span>' : '')}</p>
              ` : ''}
              ${expectedConclusion ? `
                <p style="margin: 6px 0; font-size: 13px;"><strong>Correct Answer:</strong> ${formatConclusion(expectedConclusion)}</p>
              ` : ''}
            </div>
          `;
        }

        // Add explanation section
        let explanation = "";
        let expectedExplanation = "";
        
        if (typeof rawAnswer === 'object' && rawAnswer.explanation) {
          explanation = rawAnswer.explanation;
        }
        
        if (detailsObj.explanationDetails && detailsObj.explanationDetails.studentText) {
          explanation = detailsObj.explanationDetails.studentText;
        }
        
        // Get expected findings from teacherExplanation (teacher's findings/explanation text)
        if (detailsObj.teacherExplanation) {
          expectedExplanation = detailsObj.teacherExplanation;
        }

        if (explanation || expectedExplanation) {
          examContent += `
            <div class="explanation-section" style="margin: 25px 0;">
              <h3 style="font-size: 14px; margin: 0 0 8px 0;">Your Findings</h3>
              <div class="explanation-text" style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px;">${explanation || '-'}</div>
              ${expectedExplanation ? `
                <h3 style="font-size: 14px; margin: 12px 0 8px 0;">Teacher's Findings</h3>
                <div class="expected-explanation" style="background: #e3f2fd; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px;">${expectedExplanation}</div>
              ` : ''}
            </div>
          `;
        }

      } catch (e) {
        console.error('Error parsing answer details for print:', e);
        examContent += `<p>Unable to parse detailed answer data.</p>`;
      }
    }

    if (result.feedback) {
      examContent += `
        <div class="feedback-section">
          <h3>Feedback</h3>
          <p>${result.feedback}</p>
        </div>
      `;
    }

      // Mobile: generate PDF and trigger download using html2pdf
      if (isMobile) {
        try {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js');

          // create a container for printable content
          const container = document.createElement('div');
          container.style.background = '#fff';
          container.style.padding = '18px';
          container.style.color = '#000';
          // Ensure header (top logo), content, and footer (bottom logo) are present for mobile PDF
          container.innerHTML = `${headerHtml}<div>${examContent}</div>${footerHtml}`;
          document.body.appendChild(container);

          const filenameSafe = (result.examName || 'exam').replace(/[^a-z0-9\-\_ ]/gi, '_');

          await (window as any).html2pdf().from(container).set({
            margin: [10, 10, 10, 10],
            filename: `ExamResult-${filenameSafe}.pdf`,
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          }).save();

          try { document.body.removeChild(container); } catch (e) { }
          return;
        } catch (e) {
          console.error('PDF generation failed, falling back to print:', e);
          // fall through to open print window
        }
      }

      // Desktop/print preview: open a new window and write printable HTML (header/footer + content)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print the exam result.');
        return;
      }

      printWindow.document.write(`
          <html>
            <head>
              <title>Exam Result: ${result.examName}</title>
              <style>
            * { box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              font-size: 13px;
              line-height: 1.5;
              color: #333;
              padding: 20px; 
              margin: 0; 
            }
            h1 { font-size: 20px; font-weight: 600; margin: 0; }
            h2 { font-size: 16px; font-weight: 600; margin: 20px 0 12px 0; color: #333; }
            h3 { font-size: 14px; font-weight: 600; margin: 12px 0 8px 0; color: #333; }
            p { margin: 6px 0; font-size: 13px; }
            strong { font-weight: 600; }
            
            .exam-header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #333; }
            .exam-info p { margin: 6px 0; }
            .answers-section { margin: 25px 0; }
            .answers-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
            .answers-table th, .answers-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .answers-table th { background-color: #f0f0f0; font-weight: 600; }
            .correct { background-color: #e8f5e9; }
            .incorrect { background-color: #ffebee; }
            .indicator { font-weight: 600; margin-left: 6px; }
            .scoring-summary { margin: 20px 0; padding: 12px; background-color: #f5f5f5; border-radius: 4px; }
            .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; font-size: 12px; }
            .conclusion-section, .explanation-section, .feedback-section { margin: 20px 0; }
            .explanation-text { background-color: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 12px; }
            small { font-size: 11px; color: #666; }

            /* Mobile preview/print adjustments */
            @media (max-width: 600px) {
              body { padding: 10px; font-size: 12px; }
              h1 { font-size: 16px; }
              h2 { font-size: 14px; }
              .answers-table { font-size: 11px; }
              .answers-table th, .answers-table td { padding: 6px; }
              .print-logo-top, .print-logo-bottom { width: 200px; max-width: 80%; height: auto; }
            }

            @media print {
              body { margin: 0; padding: 15px; }
              .exam-header { page-break-after: avoid; }
              .print-logo-top, .print-logo-bottom { display: block; margin: 0 auto; width: 300px; height: auto; }
              .print-header, .print-footer { text-align: center; }
            }
              </style>
            </head>
            <body>
              ${headerHtml}
              <div style="margin-top: 20px;">${examContent}</div>
              ${footerHtml}
              <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #999;">
                Printed on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
              </div>
            </body>
          </html>
        `);

      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };

  // With instant grading, we don't need to fetch queue status anymore
  const fetchAiQueueForResults = async (resultsArr: any[]) => {
    // Queue checking is no longer needed - grading is instant
    return;
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleRequeueAiGrade = async (studentId: number | string, examId: number | string) => {
    // Requeue is no longer needed - grading is instant
    toast({ title: 'No requeue needed', description: 'AI grades are instant with the new system.', variant: 'default' });
  };

  // Helper to fetch a single AI grade and return numeric score or null
  const fetchAiScore = async (studentId: number, examId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-grader/result/${studentId}/${examId}`, { headers: getAuthHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const overall = Number(data.score ?? data.overall ?? NaN);
      return Number.isNaN(overall) ? null : Math.round(overall);
    } catch (e) {
      return null;
    }
  };

  // Fetch AI grades for an array of results (background, non-blocking)
  const fetchAiGradesForResults = async (resultsArr: any[]) => {
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return;
    // Limit concurrent fetches to avoid overwhelming API
    const promises = resultsArr.map((r) => {
      const sid = r.student_id || r.studentId;
      const eid = r.exam_id || r.examId;
      if (!sid || !eid) return Promise.resolve(null);
      const key = `${sid}_${eid}`;
      // mark as loading by setting undefined (leave absent) or skip if already present
      if (aiScores[key] !== undefined) return Promise.resolve(null);
      return fetchAiScore(sid, eid).then((score) => {
        setAiScores((prev) => ({ ...prev, [key]: score }));
        return null;
      });
    });
    try {
      await Promise.allSettled(promises);
    } catch (e) {
      // ignore
    }
  };


  // Process results/items for display with sorting based on viewMode
  let processedResults: any[] = [];
  if (viewMode === 'taken') {
    processedResults = [...filteredResults].map(result => {
      // existing mapping for taken results (with scores etc.)
      let raw_score = result.raw_score;
      let raw_total = result.raw_total;
      let totalPoints = 0;
      let earnedPoints = 0;

      if (result.details) {
        try {
          const detailsObj = typeof result.details === 'string' 
            ? JSON.parse(result.details) 
            : result.details;
          if (detailsObj.raw_score !== undefined && detailsObj.raw_total !== undefined) {
            raw_score = detailsObj.raw_score;
            raw_total = detailsObj.raw_total;
          }
          if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
            totalPoints = detailsObj.totalPossiblePoints;
            earnedPoints = detailsObj.totalScore;
          }
          if (totalPoints === 0 && detailsObj.rowDetails && Array.isArray(detailsObj.rowDetails)) {
            totalPoints = detailsObj.rowDetails.reduce((sum: number, row: any) => {
              return sum + (row.possiblePoints || 0);
            }, 0);
            if (earnedPoints === 0 && detailsObj.totalScore !== undefined) {
              earnedPoints = detailsObj.totalScore;
            }
          }
        } catch (e) {
          console.error("Error parsing details:", e);
        }
      }

      let score = result.score;
      if (totalPoints > 0) {
        score = Math.round((earnedPoints / totalPoints) * 100);
      } else if (raw_score !== undefined && raw_total !== undefined && raw_total > 0) {
        score = Math.round((raw_score / raw_total) * 100);
      }

      const getCourseName = (r: any) => {
        if (r.course_name) return r.course_name;
        if (r.course_code) return r.course_code;
        const cid = r.course || r.course_id;
        if (!cid) return cid || '';
        const found = courses.find((c) => String(c.id) === String(cid) || String(c.course_id) === String(cid) || String(c.name) === String(cid));
        return found ? found.name || found.course || String(cid) : String(cid);
      };

      return {
        ...result,
        answer: result.answer,
        details: result.details,
        raw_score,
        raw_total,
        totalPoints,
        earnedPoints,
        score,
        examName: result.examName || result.exam_name || result.name || resolveExamName(result.exam_id) || `Exam ${result.exam_id}`,
        course: getCourseName(result),
      };
    });
  } else {
    // missed or available exams map simple fields
    processedResults = [...filteredResults].map((exam: any) => {
      const id = exam.id || exam.exam_id;
      
      // Resolve course name from multiple possible fields
      let courseName = '';
      if (exam.course_name) {
        courseName = exam.course_name;
      } else if (exam.course_code) {
        courseName = exam.course_code;
      } else if (exam.course) {
        // Try resolving by course ID
        const found = courses.find((c) => String(c.id) === String(exam.course) || String(c.course_id) === String(exam.course) || String(c.name) === String(exam.course));
        courseName = found ? found.name || found.course || String(exam.course) : String(exam.course);
      } else if (exam.course_id) {
        // Try resolving by course_id
        const found = courses.find((c) => String(c.id) === String(exam.course_id) || String(c.course_id) === String(exam.course_id) || String(c.name) === String(exam.course_id));
        courseName = found ? found.name || found.course || String(exam.course_id) : String(exam.course_id);
      }
      
      return {
        ...exam,
        examName: exam.name || `Exam ${id}`,
        course: courseName,
        start: exam.start,
        end: exam.end,
        instructor_name: exam.instructor_name || exam.created_by || (exam.instructor_id ? `Instructor ${exam.instructor_id}` : ''),
        status: exam.status || (() => {
          const now = new Date();
          const start = exam.start ? new Date(exam.start) : null;
          const end = exam.end ? new Date(exam.end) : null;
          if (start && now < start) return 'not_started';
          if (start && now >= start && (!end || now <= end)) return 'open';
          return 'closed';
        })(),
      };
    });
  }

  // sort uniformly according to sortConfig where applicable
  processedResults.sort((a, b) => {
    const { key = 'submitted_at', direction = 'desc' } = sortConfig || {};
    let aValue: any;
    let bValue: any;

    switch (key) {
      case 'submitted_at': {
        const aTime = a.submitted_at || a.date || a.start || null;
        const bTime = b.submitted_at || b.date || b.start || null;
        aValue = aTime ? new Date(aTime).getTime() : 0;
        bValue = bTime ? new Date(bTime).getTime() : 0;
        break;
      }
      case 'examName':
        aValue = a.examName?.toLowerCase() || '';
        bValue = b.examName?.toLowerCase() || '';
        break;
      case 'course':
        aValue = a.course?.toLowerCase() || '';
        bValue = b.course?.toLowerCase() || '';
        break;
      case 'date':
        aValue = new Date(a.date || a.start || 0).getTime();
        bValue = new Date(b.date || b.start || 0).getTime();
        break;
      case 'score':
        aValue = a.score || 0;
        bValue = b.score || 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }

    // tie-break
    const aTie = a.submitted_at ? new Date(a.submitted_at).getTime() : (a.date ? new Date(a.date).getTime() : (a.start ? new Date(a.start).getTime() : 0));
    const bTie = b.submitted_at ? new Date(b.submitted_at).getTime() : (b.date ? new Date(b.date).getTime() : (b.start ? new Date(b.start).getTime() : 0));
    if (aTie !== bTie) return aTie < bTie ? 1 : -1;
    const aId = Number(a.id ?? a.result_id ?? a.exam_id ?? 0);
    const bId = Number(b.id ?? b.result_id ?? b.exam_id ?? 0);
    if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) return aId < bId ? 1 : -1;
    return 0;
  });

    // Compute pagination from processedResults so computed fields (examName, course) are present
    (function computePagination() {
      const startIdx = (currentPage - 1) * itemsPerPage;
      totalPages = Math.max(1, Math.ceil(processedResults.length / itemsPerPage));
      paginatedResults = processedResults.slice(startIdx, startIdx + itemsPerPage);
    })();

    return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Exams</h2>
          <p className="text-muted-foreground">
            View and analyze your exam performance
          </p>
        </div>

        {/* Top Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 rounded-lg mb-4">
          {/* Left Section - Grouped Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search Input - Pill Shape */}
            <div className="relative flex items-center min-w-0">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by exam name, course..."
                value={searchTerm}
                onChange={handleSearch}
                className="pl-10 pr-4 py-2 rounded-full bg-gray-50 border border-gray-200 hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filter Toggle - Segmented Control (Taken / Available / Missed) */}
            <div className="inline-flex items-center bg-gray-100 rounded-full p-1 gap-1">
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  viewMode === 'taken'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-transparent text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => handleSwitchMode('taken')}
              >
                ✓ Taken
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  viewMode === 'available'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-transparent text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => handleSwitchMode('available')}
              >
                Available
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  viewMode === 'missed'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-transparent text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => handleSwitchMode('missed')}
              >
                Missed
              </button>
            </div>

            {/* Reload Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleReload}
              disabled={isReloading}
              className="gap-2 rounded-full"
            >
              <RefreshCw className={`h-4 w-4 ${isReloading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>

          {/* Right Section - Count Display */}
          <div className="text-sm text-muted-foreground ml-4 whitespace-nowrap">
            {processedResults.length} exam{processedResults.length !== 1 ? 's' : ''} found
          </div>
        </div>

          <Card>
            <CardContent className="p-0">
              <div className="hidden sm:block overflow-x-auto">
                <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                  <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold cursor-pointer">
                    <div onClick={() => handleSort('examName')} className="flex items-center justify-center gap-2">
                      <span>Exam</span>
                      <span className="text-muted-foreground">{getSortIcon('examName')}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold cursor-pointer">
                    <div onClick={() => handleSort('course')} className="flex items-center justify-center gap-2">
                      <span>Course</span>
                      <span className="text-muted-foreground">{getSortIcon('course')}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold cursor-pointer">
                    <div onClick={() => handleSort('date')} className="flex items-center justify-center gap-2">
                      <span>{viewMode === 'missed' ? 'Scheduled Date' : 'Date'}</span>
                      <span className="text-muted-foreground">{getSortIcon('date')}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold">
                    <span>Created By</span>
                  </TableHead>
                  {viewMode === 'taken' && (
                    <>
                      <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold cursor-pointer">
                        <div onClick={() => handleSort('score')} className="flex items-center justify-center gap-2">
                          <span>Score</span>
                          <span className="text-muted-foreground">{getSortIcon('score')}</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold">Actions</TableHead>
                    </>
                  )}
                  {viewMode === 'available' && (
                    <>
                      <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold">Status</TableHead>
                      <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold">Actions</TableHead>
                    </>
                  )}
                  {viewMode === 'missed' && (
                    <TableHead className="text-center bg-gray-100 text-xs uppercase tracking-wide font-semibold">Status</TableHead>
                  )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedResults.length > 0 ? (
                    paginatedResults.map((result) => {
                      const findingsMaxPts = getFindingsMaxPoints(result);
                      return (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium text-center">{result.examName}</TableCell>
                        <TableCell className="text-center">{result.course}</TableCell>
                        <TableCell className="text-center">{formatDateRange(result.start, result.end)}</TableCell>
                        <TableCell className="text-center">{result.instructor_name || result.created_by || (result.instructor_id ? `Instructor ${result.instructor_id}` : '-')}</TableCell>
                        {viewMode === 'taken' && (
                          <TableCell>
                            <div className="text-sm">
                              <div><span className="text-xs font-medium text-gray-700">Table:</span>{' '}
                                {result.totalPoints && result.totalPoints > 0
                                  ? `${result.score}% (${result.earnedPoints}/${result.totalPoints} pts)`
                                  : result.raw_score !== undefined && result.raw_total !== undefined
                                    ? `${result.score}% (${result.raw_score}/${result.raw_total})`
                                    : (result.score !== undefined ? `${result.score}%` : "-")}
                              </div>
                              <div className="mt-1"><span className="text-xs font-medium text-gray-700">Findings:</span>{' '}
                                {(() => {
                                  const key = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                                  const v = aiScores[key];
                                  if (v === undefined) return (<span className="text-sm text-gray-500">Loading...</span>);
                                  if (v === null) return (<span className="text-sm text-gray-500">N/A</span>);
                                  const pts = pointsFromPercent(v, findingsMaxPts);
                                  return (<span className="font-semibold">{v}% {pts !== null ? `(${pts}/${findingsMaxPts})` : ''}</span>);
                                })()}
                              </div>
                            </div>
                          </TableCell>
                        )}
                        {viewMode === 'available' && (
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                                result.status === 'open'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {result.status === 'open' ? '✓ Open' : '⏳ Not Started'}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        {viewMode === 'available' && (
                          <TableCell className="text-center">
                            <Button 
                              size="sm" 
                              onClick={() => navigate('/student/exams')} 
                              disabled={result.status !== 'open'}
                              className={result.status === 'open' ? 'bg-blue-900 hover:bg-blue-950 text-white' : ''}
                            >
                              Enter
                            </Button>
                          </TableCell>
                        )}
                        {(viewMode === 'missed' || viewMode === 'taken') && (
                          <TableCell className="text-center">
                            {viewMode === 'missed' ? (
                              <div className="flex items-center justify-center">
                                <div className="inline-flex flex-col items-center gap-1">
                                  <span className="bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Missed</span>
                                  <span className="text-xs text-red-600">Deadline passed</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 justify-end items-center">
                              {(result.answer || result.details) ? (
                              <Dialog>
                                  <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    ref={(el) => { triggerRefs.current[`${result.student_id || result.studentId}_${result.exam_id || result.examId}`] = el as HTMLButtonElement; }}
                                      onClick={async () => { await fetchAiGradeForResult(result.student_id || result.studentId, result.exam_id || result.examId); await fetchAiQueueForResults([result]); setSelectedResult(result); }}
                                  >
                                    <Eye className="h-4 w-4 mr-2" /> View Results
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-[98vw] w-full h-[95vh] sm:max-w-[800px] sm:h-auto max-h-[95vh] overflow-hidden flex flex-col">
                                  <DialogHeader className="flex-shrink-0">
                                    <div className="w-full flex items-center justify-between">
                                      <DialogTitle className="pr-4">Exam Results: {result.examName}</DialogTitle>
                                      <div className="flex items-center gap-2">
                                        {/* Print removed */}
                                      </div>
                                    </div>
                                  </DialogHeader>
                                  <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                                    <div className="flex items-center justify-end gap-2">
                                      {/* Refresh removed. Show Requeue when job is pending and eligible. */}
                                      {(() => {
                                        const qKey = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                                        const qRow = aiQueueMap[qKey];
                                        const aiVal = aiScores[qKey];
                                        // show requeue when AI score is missing and submission time (or queue created_at)
                                        // is older than 30 minutes
                                        const thirtyMin = 30 * 60 * 1000;
                                        let show = false;
                                        if (aiVal === undefined || aiVal === null) {
                                          // determine submission time: prefer result.date, fallback to queue created_at
                                          let submittedAt: number | null = null;
                                          try {
                                            if (result.date) submittedAt = new Date(result.date).getTime();
                                          } catch (e) { submittedAt = null; }
                                          if (!submittedAt && qRow && qRow.created_at) {
                                            try { submittedAt = new Date(qRow.created_at).getTime(); } catch (e) { submittedAt = null; }
                                          }
                                          if (submittedAt) {
                                            const ageMs = Date.now() - submittedAt;
                                            if (ageMs > thirtyMin) show = true;
                                          } else {
                                            // if we can't determine submission time, fall back to showing the button
                                            show = true;
                                          }
                                        }
                                        if (show) {
                                          return (
                                            <Button size="sm" variant="outline" onClick={async () => { await handleRequeueAiGrade(result.student_id || result.studentId, result.exam_id || result.examId); }} disabled={!!requeueLoading[qKey]}>
                                              {requeueLoading[qKey] ? 'Requeueing...' : 'Requeue AI grade'}
                                            </Button>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                      <div>
                                        <p className="text-sm font-medium">Course</p>
                                        <p className="text-sm break-words">{result.course}</p>
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">Date</p>
                                        <p className="text-sm">{formatDate(result.date)}</p>
                                      </div>
                                      <div className="sm:col-span-2 lg:col-span-1">
                                        <p className="text-sm font-medium">Score</p>
                                        <div className="text-sm break-words">
                                          <div><span className="text-muted-foreground text-xs">Table:</span>{' '}
                                            {result.totalPoints && result.totalPoints > 0
                                              ? `${result.score}% (${result.earnedPoints}/${result.totalPoints} pts)`
                                              : result.raw_score !== undefined && result.raw_total !== undefined
                                                ? `${result.score}% (${result.raw_score}/${result.raw_total})`
                                                : (result.score !== undefined ? `${result.score}%` : "-")}
                                          </div>
                                          <div className="mt-1"><span className="text-muted-foreground text-xs">Findings:</span>{' '}
                                            {(() => {
                                              const key = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                                              const v = aiScores[key];
                                              const findingsMax = getFindingsMaxPoints(result);
                                              if (v === undefined) return (<span className="text-sm text-gray-500">Loading...</span>);
                                              if (v === null) return (<span className="text-sm text-gray-500">N/A</span>);
                                              const pts = pointsFromPercent(v, findingsMax);
                                              return (<span className="font-semibold">{v}% {pts !== null ? `(${pts}/${findingsMax})` : ''}</span>);
                                            })()}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {selectedAiGrade ? (
                                      <div className="p-4 border rounded-md bg-white">
                                        <h4 className="font-semibold mb-2">Rubric Breakdown</h4>
                                        {(() => {
                                          // Display rubric components. If the AI record contains per-component
                                          // values (even 0), show them. If all components are missing/zero and
                                          // an overall score exists, derive an approximate per-rubric value by
                                          // evenly distributing the overall percent across the rubrics.
                                          const overall = Number(selectedAiGrade.score ?? selectedAiGrade.overall ?? NaN);
                                          const dbKeys = ['accuracy','objectivity','structure'];
                                          const displayKeyMap: Record<string, string> = { accuracy: 'completeness', objectivity: 'objectivity', structure: 'structure' };
                                          
                                          // Read raw component values (may be undefined/null/0)
                                          const rawVals = dbKeys.map(k => {
                                            const v = selectedAiGrade?.[k];
                                            const n = v === undefined || v === null ? null : (Number.isNaN(Number(v)) ? null : Number(v));
                                            return n;
                                          });

                                          // Determine if any component has a positive real value (>0)
                                          const anyPositive = rawVals.some(v => v !== null && v > 0);

                                          // Prepare display values and mark which are derived
                                          const displayVals: Record<string, { val: number | null; derived: boolean }> = {
                                            completeness: { val: null, derived: false },
                                            objectivity: { val: null, derived: false },
                                            structure: { val: null, derived: false },
                                          };

                                          if (anyPositive) {
                                            // Map database keys to display keys and use all actual values (including explicit 0s)
                                            dbKeys.forEach((dbKey, i) => {
                                              const displayKey = displayKeyMap[dbKey];
                                              const v = rawVals[i];
                                              if (v !== null) {
                                                displayVals[displayKey].val = Math.max(0, Math.min(100, Math.round(v)));
                                                displayVals[displayKey].derived = false;
                                              } else {
                                                // null means no data, treat as 0
                                                displayVals[displayKey].val = 0;
                                                displayVals[displayKey].derived = false;
                                              }
                                            });
                                          } else if (!Number.isNaN(overall)) {
                                            // No positive components present: compute all by formula S × (W / 100)
                                            Object.keys(displayVals).forEach((displayKey) => {
                                              const weight = (DEFAULT_RUBRIC_WEIGHTS[displayKey] || 0) / 100;
                                              const computed = Math.round(Math.round(overall) * weight);
                                              displayVals[displayKey].val = Math.max(0, Math.min(100, computed));
                                              displayVals[displayKey].derived = true;
                                            });
                                          }

                                          const showPercent = (v: number | null, d: boolean) => v === null ? '-' : `${Math.round(v)}%`;

                                          return (
                                            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                                              <div><strong>Completeness:</strong> {showPercent(displayVals.completeness.val, displayVals.completeness.derived)}</div>
                                              <div><strong>Objectivity:</strong> {showPercent(displayVals.objectivity.val, displayVals.objectivity.derived)}</div>
                                              <div><strong>Structure / Reasoning:</strong> {showPercent(displayVals.structure.val, displayVals.structure.derived)}</div>
                                              <div className="col-span-2 mt-2"><strong>Overall Score:</strong> {!Number.isNaN(overall) ? `${Math.round(overall)}%` : '-'}</div>
                                            </div>
                                          );
                                        })()}
                                        <div className="mt-2">
                                          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{selectedAiGrade.feedback}</div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="p-4 border rounded-md bg-yellow-50 text-sm">
                                        <strong>Grading pending.</strong>
                                        <div className="mt-1">The AI grader is processing this submission. If this has been pending a long time you can request a requeue.</div>
                                        {(() => {
                                          const qKey = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                                          const qRow = aiQueueMap[qKey];
                                          const aiVal = aiScores[qKey];
                                          const thirtyMin = 30 * 60 * 1000;
                                          let show = false;
                                          if (aiVal === undefined || aiVal === null) {
                                            // determine submission time: prefer result.date, fallback to queue created_at
                                            let submittedAt: number | null = null;
                                            try {
                                              if (result.date) submittedAt = new Date(result.date).getTime();
                                            } catch (e) { submittedAt = null; }
                                            if (!submittedAt && qRow && qRow.created_at) {
                                              try { submittedAt = new Date(qRow.created_at).getTime(); } catch (e) { submittedAt = null; }
                                            }
                                            if (submittedAt) {
                                              const ageMs = Date.now() - submittedAt;
                                              if (ageMs > thirtyMin) show = true;
                                            } else {
                                              // if we can't determine submission time, fall back to showing the button
                                              show = true;
                                            }
                                          }
                                          if (show) {
                                            return (
                                              <div className="mt-3">
                                                <Button size="sm" variant="outline" onClick={async () => { await handleRequeueAiGrade(result.student_id || result.studentId, result.exam_id || result.examId); }} disabled={!!requeueLoading[qKey]}>
                                                  {requeueLoading[qKey] ? 'Requeueing...' : 'Requeue AI grade'}
                                                </Button>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    )}

                                    {/* Keyword Pool Display */}
                                    {result.keyword_pool_name && result.keyword_pool_keywords && (
                                      <div className="bg-gray-50 border rounded-lg p-4">
                                        <div className="mb-2">
                                          <p className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1">
                                            <Tags className="h-4 w-4" />
                                            Available Keywords: {result.keyword_pool_name}
                                          </p>
                                          {result.keyword_pool_description && (
                                            <p className="text-xs text-gray-600 mb-2">
                                              {result.keyword_pool_description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {(() => {
                                            try {
                                              const keywords = typeof result.keyword_pool_keywords === 'string'
                                                ? JSON.parse(result.keyword_pool_keywords)
                                                : result.keyword_pool_keywords;
                                              
                                              // If selected_keywords exist, show only those; otherwise show all keywords
                                              const keywordsToShow = result.selected_keywords ? (() => {
                                                try {
                                                  return typeof result.selected_keywords === 'string'
                                                    ? JSON.parse(result.selected_keywords)
                                                    : result.selected_keywords;
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

                                    {result.feedback && (
                                      <div>
                                        <p className="text-sm font-medium">Feedback</p>
                                        <p className="text-sm text-muted-foreground">{result.feedback}</p>
                                      </div>
                                    )}

                                    {(() => {
                                      // specimens holds the original question rows (with pointType) from various sources
                                      let parsedAnswer: any[] = [];
                                      let rowDetails: any[] = [];
                                      let columns: string[] = [];
                                      let specimens: any[] = [];
                                      let specimenSource = '';

                                      try {
                                        // parse details first; it may already contain specimens and/or scoring info
                                        if (result.details) {
                                          const detailsObj = typeof result.details === 'string'
                                            ? JSON.parse(result.details)
                                            : result.details;

                                          if (detailsObj.specimens && Array.isArray(detailsObj.specimens)) {
                                            specimens = detailsObj.specimens;
                                            specimenSource = 'details';
                                            console.log('Specimens from details:', specimens);
                                          }

                                          if (detailsObj.rowDetails && Array.isArray(detailsObj.rowDetails)) {
                                            rowDetails = detailsObj.rowDetails;
                                            console.log('Extracted rowDetails from details field:', rowDetails);

                                            if (rowDetails.length > 0 && rowDetails[0].columnScores) {
                                              columns = Object.keys(rowDetails[0].columnScores);
                                              // ensure standard specimen column comes before question specimen
                                              if (columns.includes("standardSpecimen") && columns.includes("questionSpecimen")) {
                                                columns = [
                                                  "standardSpecimen",
                                                  "questionSpecimen",
                                                  ...columns.filter(c => !["standardSpecimen","questionSpecimen"].includes(c)),
                                                ];
                                              }
                                              console.log('Extracted columns from rowDetails:', columns);
                                            }
                                          }
                                        }

                                        // parse raw answer (student input); may also hold specimens structure for older submissions
                                        if (result.answer) {
                                          const rawAnswer = typeof result.answer === 'string'
                                            ? JSON.parse(result.answer)
                                            : result.answer;

                                          // tableAnswers are what the student filled in
                                          parsedAnswer = rawAnswer.tableAnswers || [];
                                          console.log('Parsed answer from details:', parsedAnswer);

                                          // if we haven't yet found specimens, look here
                                          if (specimens.length === 0) {
                                            if (rawAnswer.specimens && Array.isArray(rawAnswer.specimens)) {
                                              specimens = rawAnswer.specimens;
                                              specimenSource = 'answer-specimens';
                                              console.log('Specimens from answer JSON:', specimens);
                                            } else if (Array.isArray(rawAnswer)) {
                                              specimens = rawAnswer;
                                              specimenSource = 'answer-array';
                                              console.log('Specimens from answer array:', specimens);
                                            }
                                          }
                                        }

                                        // if we still don't have specimens or none of them include a pointType, try to use cached question
                                        if ((specimens.length === 0 || !specimens.some(r => r.pointType)) && selectedResult) {
                                          const examId = selectedResult.exam_id || selectedResult.examId;
                                          const cachedQ = questionCache[String(examId)];
                                          if (cachedQ && cachedQ.answer) {
                                            try {
                                              const qParsed = typeof cachedQ.answer === 'string' ? JSON.parse(cachedQ.answer) : cachedQ.answer;
                                              if (qParsed.specimens && Array.isArray(qParsed.specimens)) {
                                                specimens = qParsed.specimens;
                                                specimenSource = 'cached-question';
                                                console.log('Specimens from cached question:', specimens);
                                              } else if (Array.isArray(qParsed)) {
                                                specimens = qParsed;
                                                specimenSource = 'cached-question-array';
                                                console.log('Specimens from cached question array:', specimens);
                                              }
                                            } catch (err) {
                                              console.error('Error parsing cached question answer:', err);
                                            }
                                          }
                                        }
                                      } catch (e) {
                                        console.error('Error parsing results:', e);
                                        parsedAnswer = [];
                                        rowDetails = [];
                                        columns = [];
                                        specimens = [];
                                      }

                                      // derive columns from specimens if we haven't gotten them already
                                      if (columns.length === 0 && specimens.length > 0) {
                                        columns = Object.keys(specimens[0]).filter(k => !['points', 'pointType'].includes(k));
                                        // reorder for clarity: standard left, question right
                                        if (columns.includes("standardSpecimen") && columns.includes("questionSpecimen")) {
                                          columns = [
                                            "standardSpecimen",
                                            "questionSpecimen",
                                            ...columns.filter(c => !["standardSpecimen", "questionSpecimen"].includes(c)),
                                          ];
                                        }
                                        console.log('Derived columns from specimens (' + specimenSource + '):', columns);
                                      }

                                      // Always render answer table even if explanation/conclusion are missing
                                      return (
                                        <div className="space-y-4">
                                          <h3 className="text-lg font-medium mt-4">Answer Table</h3>
                                          <div className="overflow-x-auto border-2 border-blue-300 rounded-lg">
                                            <Table className="min-w-full">
                                              <TableHeader>
                                                <TableRow>
                                                  <TableHead className="min-w-[50px] sticky left-0 bg-background z-10">#</TableHead>
                                                  {columns.length > 0 ? columns.map((col, idx) => (
                                                    <TableHead key={idx} className="min-w-[120px] whitespace-nowrap">{col}</TableHead>
                                                  )) : (
                                                    // No columns, show generic header
                                                    <TableHead className="min-w-[120px] whitespace-nowrap">Answer</TableHead>
                                                  )}
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Result/Points</TableHead>
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Points Value</TableHead>
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Point Type</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {(() => {
                                                  // If we have rowDetails, render those first (scored rows)
                                                  if (rowDetails && rowDetails.length > 0) {
                                                    return rowDetails.map((row: any, rowIdx: number) => {
                                                      const rowCorrectCount = (row.columnScores && Object.values(row.columnScores as any).filter((col: any) => col.isExactMatch).length) || 0;
                                                      const rowTotalCount = columns.length || 0;
                                                      const allCorrectForRow = row.correct || false;
                                                      const specimen = specimens[rowIdx] || {};
                                                      const pointsResolved = Number(row.possiblePoints ?? row.pointsValue ?? row.points ?? specimen.points ?? 1);
                                                      const pointTypeResolved = (row.pointType ?? row.point_type ?? specimen.pointType ?? specimen.point_type ?? specimen.pointtype ?? '').toString().toLowerCase();

                                                      let earnedForRow = 0;
                                                      let possibleForRow = 0;
                                                      if (pointTypeResolved === 'each') {
                                                        earnedForRow = rowCorrectCount * pointsResolved;
                                                        possibleForRow = rowTotalCount * pointsResolved;
                                                      } else {
                                                        earnedForRow = allCorrectForRow ? pointsResolved : 0;
                                                        possibleForRow = pointsResolved;
                                                      }

                                                      return (
                                                        <TableRow key={rowIdx}>
                                                          <TableCell className="sticky left-0 bg-background z-10 font-medium">{rowIdx + 1}</TableCell>
                                                          { (columns.length > 0 ? columns : Object.keys(row.columnScores || {})).map((col: string, colIdx: number) => {
                                                            const colScore = row.columnScores?.[col] || {};
                                                            const isCorrect = colScore.isExactMatch || false;
                                                            const studentValue = colScore.userValue || '-';
                                                            const correctValue = colScore.correctValue || '-';

                                                            return (
                                                              <TableCell key={colIdx} className={`min-w-[120px] ${isCorrect ? "bg-green-50" : "bg-red-50"}`}>
                                                                <div className="flex flex-col space-y-1">
                                                                  <div className="flex items-center flex-wrap">
                                                                    <span className={`text-sm font-medium break-words ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                                                                      {studentValue}
                                                                    </span>
                                                                    <span className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
                                                                      {isCorrect ? (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                      ) : (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                                        </svg>
                                                                      )}
                                                                    </span>
                                                                  </div>
                                                                  {!isCorrect && (
                                                                    <span className="text-xs text-muted-foreground break-words">
                                                                      Correct: {correctValue}
                                                                    </span>
                                                                  )}
                                                                </div>
                                                              </TableCell>
                                                            );
                                                          })}
                                                          <TableCell className="min-w-[100px]">
                                                            <div className="flex flex-col space-y-1">
                                                              <span className={`text-sm font-semibold ${earnedForRow > 0 ? "text-green-600" : "text-red-600"}`}>
                                                                {rowCorrectCount}/{rowTotalCount}
                                                              </span>
                                                              <span className="text-xs text-muted-foreground">
                                                                {`+${earnedForRow}/${possibleForRow} pts`}
                                                              </span>
                                                            </div>
                                                          </TableCell>
                                                          <TableCell className="min-w-[100px] text-center">
                                                            <span className="text-sm font-medium">{pointsResolved}</span>
                                                          </TableCell>
                                                          <TableCell className="min-w-[100px] text-center">
                                                            <span className="text-sm">{pointTypeResolved === 'each' ? 'for each correct' : (pointTypeResolved === 'both' || pointTypeResolved === 'both_correct' ? 'if both correct' : (pointTypeResolved || '-'))}</span>
                                                          </TableCell>
                                                        </TableRow>
                                                      );
                                                    });
                                                  }

                                                  // If parsed row details exist, they were already rendered above.
                                                  // Otherwise, attempt to render original specimen rows (may come from details, answer, or cached question).
                                                  if (specimens && specimens.length > 0) {
                                                    return specimens.map((prow: any, idx: number) => {
                                                      const cols = columns.length > 0 ? columns : Object.keys(prow).filter(k => !['points','pointType'].includes(k));
                                                      const ptRaw = prow.pointType || '';
                                                      let ptDisplay = '-';
                                                      if (ptRaw === 'each') ptDisplay = 'for each correct';
                                                      else if (ptRaw === 'both') ptDisplay = 'if both correct';
                                                      else if (ptRaw) ptDisplay = ptRaw;

                                                      return (
                                                        <TableRow key={idx}>
                                                          <TableCell className="sticky left-0 bg-background z-10 font-medium">{idx + 1}</TableCell>
                                                          {cols.map((col: any, cidx: number) => (
                                                            <TableCell key={cidx} className="min-w-[120px]"><span className="text-sm break-words">{prow[col] ?? '-'}</span></TableCell>
                                                          ))}
                                                          <TableCell className="min-w-[100px]"><span className="text-sm text-muted-foreground">-</span></TableCell>
                                                          <TableCell className="min-w-[100px] text-center"><span className="text-sm">{prow.points ?? '-'}</span></TableCell>
                                                          <TableCell className="min-w-[100px] text-center"><span className="text-sm">{ptDisplay}</span></TableCell>
                                                        </TableRow>
                                                      );
                                                    });
                                                  }

                                                  // Fallback: render 12 empty placeholder rows so table is never empty
                                                  const placeholderCount = 12;
                                                  return Array.from({ length: placeholderCount }).map((_, i) => (
                                                    <TableRow key={`ph-${i}`}>
                                                      <TableCell className="sticky left-0 bg-background z-10 font-medium">{i + 1}</TableCell>
                                                      {(columns.length > 0 ? columns : ['Answer', 'Standard']).map((col: any, cidx: number) => (
                                                        <TableCell key={cidx} className="min-w-[120px]"><span className="text-sm text-muted-foreground">-</span></TableCell>
                                                      ))}
                                                      <TableCell className="min-w-[100px]"><span className="text-sm text-muted-foreground">0/0</span></TableCell>
                                                      <TableCell className="min-w-[100px] text-center"><span className="text-sm">0</span></TableCell>
                                                      <TableCell className="min-w-[100px] text-center"><span className="text-sm">-</span></TableCell>
                                                    </TableRow>
                                                  ));
                                                })()}
                                              </TableBody>
                                            </Table>
                                          </div>

                                          {/* Summary Section */}
                                          <div className="mt-4 p-3 sm:p-4 bg-gray-50 rounded-md">
                                            <h4 className="text-sm font-medium mb-3">Scoring Summary</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                                              {result.totalPoints > 0 && (
                                                <div className="flex flex-col">
                                                  <span className="text-muted-foreground text-xs">Points:</span>
                                                  <div className="font-semibold text-sm">{result.earnedPoints}/{result.totalPoints}</div>
                                                </div>
                                              )}
                                              <div className="flex flex-col">
                                                <span className="text-muted-foreground text-xs">Percentage:</span>
                                                <div className="font-semibold text-sm">{result.score}%</div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Forensic Conclusion Section */}
                                          {(() => {
                                            let studentConclusion = "";
                                            let expectedConclusion = "";

                                            try {
                                              // Get student's conclusion from their answer
                                              const parsed = JSON.parse(result.answer || "{}");
                                              if (parsed.conclusion) {
                                                studentConclusion = parsed.conclusion;
                                              }

                                              // Get expected conclusion from details
                                              if (result.details) {
                                                const detailsObj = typeof result.details === 'string'
                                                  ? JSON.parse(result.details)
                                                  : result.details;
                                                
                                                if (detailsObj.explanationDetails && detailsObj.explanationDetails.expectedConclusion) {
                                                  expectedConclusion = detailsObj.explanationDetails.expectedConclusion;
                                                }
                                              }
                                            } catch (e) {
                                              console.error("Error parsing conclusion data:", e);
                                            }

                                            // Helper function to convert conclusion to readable text
                                            const formatConclusion = (conclusion: string) => {
                                              if (conclusion === "fake") return "Not Written by Same Person";
                                              if (conclusion === "real") return "Written by Same Person";
                                              return conclusion.charAt(0).toUpperCase() + conclusion.slice(1);
                                            };

                                            return (studentConclusion || expectedConclusion) ? (
                                              <div className="mt-6 pt-3 border-t">
                                                <h3 className="text-lg font-medium mb-4">Forensic Conclusion</h3>
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                  {studentConclusion && (
                                                    <div className={`p-4 rounded-md border-2 ${expectedConclusion && studentConclusion === expectedConclusion
                                                      ? 'bg-green-50 border-green-300'
                                                      : expectedConclusion && studentConclusion !== expectedConclusion
                                                        ? 'bg-yellow-50 border-yellow-300'
                                                        : 'bg-gray-50 border-gray-200'
                                                      }`}>
                                                      <h4 className="text-sm font-medium text-gray-600 mb-3">Your Conclusion:</h4>
                                                      <div className={`text-lg font-bold ${expectedConclusion && studentConclusion === expectedConclusion
                                                        ? 'text-green-700'
                                                        : expectedConclusion && studentConclusion !== expectedConclusion
                                                          ? 'text-yellow-700'
                                                          : 'text-gray-700'
                                                        }`}>
                                                        {formatConclusion(studentConclusion)}
                                                      </div>
                                                      {expectedConclusion && (
                                                        <div className={`mt-2 text-sm font-semibold ${studentConclusion === expectedConclusion ? 'text-green-600' : 'text-red-600'}`}>
                                                          {studentConclusion === expectedConclusion ? '✓ Correct' : '✗ Incorrect'}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}

                                                  {expectedConclusion && (
                                                    <div className="p-4 rounded-md border-2 bg-blue-50 border-blue-300">
                                                      <h4 className="text-sm font-medium text-gray-600 mb-3">Correct Answer:</h4>
                                                      <div className="text-lg font-bold text-blue-700">
                                                        {formatConclusion(expectedConclusion)}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ) : null;
                                          })()}

                                          {/* Explanation Section */}
                                          {(() => {
                                            let explanation = "";
                                            let expectedExplanation = "";
                                            try {
                                              const parsed = JSON.parse(result.answer || "{}");
                                              console.log("Parsing explanation from:", parsed);

                                              // Handle different formats of explanation storage
                                              if (typeof parsed === 'object') {
                                                // Direct explanation property
                                                if (typeof parsed.explanation === 'string') {
                                                  explanation = parsed.explanation;
                                                }
                                              }

                                              // Get expected explanation from details
                                              if (result.details) {
                                                const detailsObj = typeof result.details === 'string'
                                                  ? JSON.parse(result.details)
                                                  : result.details;
                                                
                                                if (detailsObj.explanationDetails && detailsObj.explanationDetails.studentText) {
                                                  explanation = detailsObj.explanationDetails.studentText;
                                                }
                                                // Expected explanation is stored as teacherExplanation
                                                if (detailsObj.teacherExplanation) {
                                                  expectedExplanation = detailsObj.teacherExplanation;
                                                }
                                              }

                                              console.log("Extracted explanation:", explanation);
                                            } catch (e) {
                                              console.error("Error parsing explanation:", e);
                                              // If parsing fails, try to use the explanation field directly
                                              explanation = result.explanation || "";
                                            }

                                            return explanation ? (
                                              <div className="mt-6 pt-3 border-t">
                                                <h3 className="text-lg font-medium">Your Findings</h3>
                                                <div className="bg-gray-50 p-3 rounded-md mt-2">
                                                  <p className="whitespace-pre-wrap break-words text-sm">{explanation}</p>
                                                </div>

                                                {expectedExplanation ? (
                                                  <div className="mt-3">
                                                    <h4 className="text-sm font-medium text-muted-foreground">Expected Findings</h4>
                                                    <div className="bg-blue-50 p-3 rounded-md mt-1">
                                                      <p className="whitespace-pre-wrap text-sm break-words">{expectedExplanation}</p>
                                                    </div>
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null;
                                          })()}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="flex justify-end pt-4 border-t flex-shrink-0">
                                    <DialogClose asChild>
                                      <Button>Close</Button>
                                    </DialogClose>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              ) : (
                                <span className="text-sm text-muted-foreground">Not taken</span>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => { await handlePrintExam(result); }}
                              >
                                <FileText className="h-4 w-4 mr-2" /> Print
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                      </TableRow>
                    );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6">
                        {searchTerm ? "No results match your search." : "No results found."}
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
              </Table>
              
              {/* Pagination controls */}
              {processedResults.length > 0 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({processedResults.length} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</Button>
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Prev</Button>

                    {/* Page numbers - show a window of pages */}
                    <div className="flex items-center gap-1">
                      {(() => {
                        const pages = [] as number[];
                        const window = 2; // neighbors on each side
                        const start = Math.max(1, currentPage - window);
                        const end = Math.min(totalPages, currentPage + window);
                        if (start > 1) pages.push(1);
                        if (start > 2) pages.push(-1); // ellipsis marker
                        for (let p = start; p <= end; p++) pages.push(p);
                        if (end < totalPages - 1) pages.push(-1);
                        if (end < totalPages) pages.push(totalPages);

                        return pages.map((p, idx) => {
                          if (p === -1) return <span key={`e-${idx}`} className="px-2">…</span>;
                          const isCurrent = p === currentPage;
                          return (
                            <Button key={p} size="sm" variant={isCurrent ? undefined : 'outline'} className={isCurrent ? 'bg-primary text-white' : ''} onClick={() => setCurrentPage(p)}>
                              {p}
                            </Button>
                          );
                        });
                      })()}
                    </div>

                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile list view */}
            <div className="block sm:hidden space-y-3 p-3">
              {paginatedResults.length > 0 ? (
                paginatedResults.map((result) => {
                  const key = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                  return (
                    <div key={result.id} className="bg-white border rounded-lg p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{result.examName}</div>
                          <div className="text-xs text-muted-foreground truncate">{result.course}</div>
                          <div className="text-xs text-muted-foreground truncate mt-1">{result.instructor_name || result.created_by || (result.instructor_id ? `Instructor ${result.instructor_id}` : '-')}</div>
                          <div className="text-xs text-muted-foreground">{formatDateRange(result.start, result.end)}</div>
                          {viewMode === 'available' && (
                            <div className="text-xs font-medium mt-1">
                              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                                result.status === 'open'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {result.status === 'open' ? '✓ Open' : '⏳ Not Started'}
                              </span>
                            </div>
                          )}
                          {viewMode === 'taken' && (
                            <>
                              <div className="text-xs mt-1 text-gray-700">
                                <span className="font-medium">Table:</span>{' '}
                                {result.totalPoints && result.totalPoints > 0
                                  ? `${result.score}% (${result.earnedPoints}/${result.totalPoints} pts)`
                                  : result.raw_score !== undefined && result.raw_total !== undefined
                                    ? `${result.score}% (${result.raw_score}/${result.raw_total})`
                                    : (result.score !== undefined ? `${result.score}%` : "-")}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">Findings:</span>{' '}
                                {(() => {
                                  const v = aiScores[key];
                                  const findingsMaxPts = getFindingsMaxPoints(result);
                                  if (v === undefined) return (<span className="text-sm text-gray-500">Loading...</span>);
                                  if (v === null) return (<span className="text-sm text-gray-500">N/A</span>);
                                  const pts = pointsFromPercent(v, findingsMaxPts);
                                  return (<span className="font-semibold">{v}% {pts !== null ? `(${pts}/${findingsMaxPts})` : ''}</span>);
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                        
                        {viewMode === 'missed' && (
                          <div className="flex-shrink-0">
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap">Missed</span>
                              <span className="text-xs text-red-600">Deadline passed</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {viewMode === 'taken' ? (
                        <div className="mt-3 flex gap-2">
                          {(result.answer || result.details) ? (
                            <Button size="sm" variant="outline" className="flex-1" onClick={async () => { await fetchAiGradeForResult(result.student_id || result.studentId, result.exam_id || result.examId); const btn = triggerRefs.current[key]; if (btn) btn.click(); }}>
                              <Eye className="h-4 w-4 mr-2" /> View Results
                            </Button>
                          ) : (
                            <div className="text-sm text-muted-foreground flex-1 text-center py-2">Not taken</div>
                          )}
                          <Button size="sm" variant="outline" className="flex-1" onClick={async () => { await handlePrintExam(result); }}>
                            <FileText className="h-4 w-4 mr-2" /> Print
                          </Button>
                        </div>
                      ) : viewMode === 'available' ? (
                        <div className="mt-3 flex justify-center">
                          <Button 
                            size="sm" 
                            onClick={() => navigate('/student/exams')} 
                            disabled={result.status !== 'open'}
                            className={result.status === 'open' ? 'bg-blue-900 hover:bg-blue-950 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                          >
                            Enter Exam
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">{searchTerm ? "No results match your search." : "No results found."}</div>
              )}
              
              {/* Mobile pagination controls */}
              {processedResults.length > 0 && (
                <div className="flex flex-col items-center gap-3 mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages} ({processedResults.length} total)
                  </div>
                  <div className="flex gap-2 w-full justify-center flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="max-w-xs">First</Button>
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="max-w-xs">Prev</Button>
                    {(() => {
                      const pages = [] as number[];
                      const window = 1;
                      const start = Math.max(1, currentPage - window);
                      const end = Math.min(totalPages, currentPage + window);
                      if (start > 1) pages.push(1);
                      if (start > 2) pages.push(-1);
                      for (let p = start; p <= end; p++) pages.push(p);
                      if (end < totalPages - 1) pages.push(-1);
                      if (end < totalPages) pages.push(totalPages);
                      return pages.map((p, i) => p === -1 ? <span key={`e-${i}`} className="px-2">…</span> : (
                        <Button key={p} size="sm" variant={p === currentPage ? undefined : 'outline'} className={p === currentPage ? 'bg-primary text-white' : ''} onClick={() => setCurrentPage(p)}>{p}</Button>
                      ));
                    })()}
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="max-w-xs">Next</Button>
                    <Button size="sm" variant="outline" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="max-w-xs">Last</Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Results;
