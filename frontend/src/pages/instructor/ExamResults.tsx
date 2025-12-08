import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Download,
  FileSearch,
  Trash2,
  PencilIcon,
  X,
  Search,
  MoreVertical,
  Printer,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Edit2,
  Copy,
  FileSpreadsheet,
  FileText
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { API_BASE_URL } from "@/lib/config";
import topLogo from '@/assets/top-logo.png';
import bottomLogo from '@/assets/bottom-logo.png';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer } from "recharts";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import SearchAndFilter from "@/pages/admin/components/question-bank/SearchAndFilter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const ExamResults = () => {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>("");
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [initialExamId, setInitialExamId] = useState<number | null>(null);
  const [editingExam, setEditingExam] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [viewErrorsExam, setViewErrorsExam] = useState<any>(null);
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({});
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const { toast } = useToast();

  // Load an image URL into a PNG data URL (used for jsPDF headers/footers)
  const loadImageToDataUrl = async (src: string) => {
    return new Promise<{ dataUrl: string; w: number; h: number }>((resolve, reject) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (e) => reject(e);
        try { img.src = new URL(src, window.location.href).href; } catch { img.src = src; }
      } catch (err) {
        reject(err);
      }
    });
  };

  // Fetch exam data with optimized loading
  const fetchExams = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsLoading(false);
        return;
      }
      const decoded: { id: string } = jwtDecode(token);
      const instructorId = decoded.id;
      console.log('Fetching exams for instructor:', instructorId); // Debug log

      // Try to get all exams with details in a single optimized query
      let res = await fetch(`${API_BASE_URL}/api/exams?instructorId=${instructorId}&includeDetails=true`, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      let data;
      if (res.ok) {
        data = await res.json();
        console.log('Received exam data:', data); // Debug log
      } else {
        // Fallback to the old method if the optimized endpoint fails
        console.warn("Optimized endpoint failed, falling back to individual queries");
        res = await fetch(`${API_BASE_URL}/api/exams?instructorId=${instructorId}`, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const basicData = await res.json();
        
        // If no exams, set empty results and return
        if (!basicData || basicData.length === 0) {
          setResults([]);
          setIsLoading(false);
          return;
        }

        // Fallback: fetch details for each exam (limited concurrency)
        const BATCH_SIZE = 3;
        const examsWithDetails = [];
        const totalBatches = Math.ceil(basicData.length / BATCH_SIZE);
        
        for (let i = 0; i < basicData.length; i += BATCH_SIZE) {
          const batch = basicData.slice(i, i + BATCH_SIZE);
          const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
          
          setLoadingProgress(Math.round((currentBatch / totalBatches) * 100));
          
          const batchPromises = batch.map(async (exam: any) => {
            try {
              const detailsRes = await fetch(`${API_BASE_URL}/api/exams/results/${exam.id}`, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
                }
              });

              if (detailsRes.ok) {
                const details = await detailsRes.json();
                return { ...exam, ...details };
              } else {
                return { ...exam, participants: 0, avgScore: null, results: [] };
              }
            } catch (error) {
              console.error(`Error fetching details for exam ${exam.id}:`, error);
              return { ...exam, participants: 0, avgScore: null, results: [] };
            }
          });

          const batchResults = await Promise.all(batchPromises);
          examsWithDetails.push(...batchResults);
          setResults([...examsWithDetails]);
        }

        data = examsWithDetails;
      }

      // If no exams, set empty results and return
      if (!data || data.length === 0) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      // Deduplicate any per-exam results by student id to avoid duplicate rows
      if (Array.isArray(data)) {
        data = data.map((ex: any) => {
          if (Array.isArray(ex.results)) {
            const seen = new Set<string>();
            ex.results = ex.results.filter((r: any) => {
              const sid = r.student_id ?? r.studentId ?? `${r.first_name || ''}_${r.last_name || ''}`;
              const key = sid !== undefined && sid !== null ? String(sid) : JSON.stringify(r);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
          return ex;
        });
      }

      // Set results
      setResults(data);
      // If the page was opened with an examId query param, try to open it after results load
      if (initialExamId) {
        // Defer to allow state to update
        setTimeout(() => {
          handleViewDetails(initialExamId);
          setInitialExamId(null);
        }, 50);
      }
      // kick off background AI grade fetch for any returned results so findings scores populate
      try {
        if (Array.isArray(data)) {
          // For exams that already include results, fetch AI grades.
          data.forEach((ex: any) => {
            if (ex && Array.isArray(ex.results) && ex.results.length > 0) {
              fetchAiGradesForResults(ex.results);
            }
          });

          // Additionally, for exams that report participants but do not include detailed results,
          // fetch their results in the background so averages (table/findings) can be computed
          // and displayed in the main table without opening View Details.
          data.forEach(async (ex: any) => {
            try {
              if ((!ex.results || !Array.isArray(ex.results) || ex.results.length === 0) && Number(ex.participants) > 0) {
                const token = localStorage.getItem('token');
                if (!token) return;
                const res = await fetch(`${API_BASE_URL}/api/exams/results/${ex.id}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const details = await res.json();
                let normalizedResults: any[] = [];
                if (Array.isArray(details)) normalizedResults = details.map((r: any) => normalizeResultForScoring(r, ex));
                else if (details && Array.isArray(details.results)) normalizedResults = details.results.map((r: any) => normalizeResultForScoring(r, ex));
                else if (details && Array.isArray(details.data)) normalizedResults = details.data.map((r: any) => normalizeResultForScoring(r, ex));
                else if (details && details.result && Array.isArray(details.result)) normalizedResults = details.result.map((r: any) => normalizeResultForScoring(r, ex));
                // Deduplicate by student id to avoid duplicate name/record rows
                if (Array.isArray(normalizedResults) && normalizedResults.length > 0) {
                  const seen = new Set<string>();
                  normalizedResults = normalizedResults.filter((r: any) => {
                    const sid = r.student_id ?? r.studentId ?? `${r.first_name || ''}_${r.last_name || ''}`;
                    const key = sid !== undefined && sid !== null ? String(sid) : JSON.stringify(r);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                }
                // Merge normalized results into state for this exam
                if (normalizedResults.length > 0) {
                  setResults(prev => prev.map(p => p.id === ex.id ? { ...p, results: normalizedResults, participants: details.participants ?? p.participants, avgScore: details.avgScore ?? p.avgScore, totalItemScore: details.totalItemScore ?? p.totalItemScore } : p));
                  // Fetch AI grades for these newly-loaded results so averages appear
                  try { await fetchAiGradesForResults(normalizedResults); } catch (e) { /* ignore */ }
                }
              }
            } catch (e) {
              // ignore background fetch errors
            }
          });
        }
      } catch (e) { /* ignore */ }
      setLoadingProgress(100);
    } catch (error) {
      console.error("Error fetching exams:", error);
      toast({ 
        title: "Error", 
        description: "Failed to fetch exam results. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Read examId from query string on mount
  const location = useLocation();
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const examIdParam = params.get("examId");
      if (examIdParam) {
        const id = Number(examIdParam);
        if (!isNaN(id)) setInitialExamId(id);
      }
    } catch (err) {
      // ignore
    }
  }, [location.search]);

  // If results finished loading after initialExamId was set, open details
  useEffect(() => {
    if (initialExamId && Array.isArray(results) && results.length > 0) {
      handleViewDetails(initialExamId);
      setInitialExamId(null);
    }
  }, [initialExamId, results]);

  useEffect(() => {
    fetchExams();
    // fetch courses and classes for name mapping
    fetchCourses();
    fetchClasses();
  }, []);

  const fetchCourses = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/api/courses`, { cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setCourses(data); })
      .catch(err => console.error('Error fetching courses', err));
  };

  const fetchClasses = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/api/classes`, { cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setClasses(data); })
      .catch(err => console.error('Error fetching classes', err));
  };

  // Fetch AI grade for a particular result and store numeric overall score or null
  const fetchAiScore = async (studentId: number | string, examId: number | string) => {
    if (!studentId || !examId) return null;
    const key = `${studentId}_${examId}`;
    try {
      // skip if already present
      if (aiScores[key] !== undefined) return aiScores[key];
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/ai-grader/result/${studentId}/${examId}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setAiScores(prev => ({ ...prev, [key]: null }));
        return null;
      }
      const data = await res.json();
      // The score is directly in data.score from the ai_grader table
      const score = data.score !== undefined ? Number(data.score) : NaN;
      const val = Number.isNaN(score) ? null : Math.round(score);
      setAiScores(prev => ({ ...prev, [key]: val }));
      return val;
    } catch (e) {
      setAiScores(prev => ({ ...prev, [key]: null }));
      return null;
    }
  };

  // Fetch AI grades for an array of results (skip ones already fetched)
  const fetchAiGradesForResults = async (resultsArr: any[]) : Promise<Record<string, number | null> | undefined> => {
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return undefined;
    const fetchPromises: Array<Promise<[string, number | null] | null>> = resultsArr.map(async (r) => {
      const sid = r.student_id ?? r.studentId ?? r.student;
      const eid = r.exam_id ?? r.examId ?? r.exam_id;
      if (!sid || !eid) return null;
      const key = `${sid}_${eid}`;
      // if already present in state, return existing
      if (aiScores[key] !== undefined) return [key, aiScores[key]] as [string, number | null];
      try {
        const val = await fetchAiScore(sid, eid);
        return [key, val] as [string, number | null];
      } catch (e) {
        return [key, null] as [string, number | null];
      }
    });

    let settled: Array<[string, number | null] | null> = [];
    try {
      settled = await Promise.all(fetchPromises);
    } catch (e) {
      // ignore
    }

    const resultMap: Record<string, number | null> = {};
    settled.forEach((item) => {
      if (item && Array.isArray(item)) {
        const [k, v] = item;
        resultMap[k] = v;
      }
    });

    // merge into state once so UI updates reactively
    if (Object.keys(resultMap).length > 0) {
      setAiScores(prev => ({ ...prev, ...resultMap }));
    }

    return resultMap;
  };

  // Helper: compute per-student table percent for an exam (forensic or regular)
  const computeTablePercentForRes = (res: any, ex: any) => {
    try {
      // Prefer raw_score/raw_total if present (some backends compute these already)
      const rawScoreRaw = res.raw_score ?? res.rawScore ?? res.raw ?? null;
      const rawTotalRaw = res.raw_total ?? res.rawTotal ?? res.raw_total_items ?? null;
      const rawScoreNum = rawScoreRaw !== null ? Number(String(rawScoreRaw).replace('%','').trim()) : null;
      const rawTotalNum = rawTotalRaw !== null ? Number(String(rawTotalRaw).replace('%','').trim()) : null;
      if (rawScoreNum !== null && !Number.isNaN(rawScoreNum) && rawTotalNum !== null && !Number.isNaN(rawTotalNum) && rawTotalNum > 0) {
        const n = Math.round((rawScoreNum / rawTotalNum) * 100);
        return Number.isFinite(n) ? n : null;
      }

  // Forensic (table comparison) questions stored as answer/answer_key
      if (ex.question_type === 'forensic' && ex.answer_key) {
        const parsedAnswer = (() => { try { return JSON.parse(res.answer || '[]'); } catch { return []; } })();
        const parsedKey = (() => { try { return JSON.parse(ex.answer_key || '[]'); } catch { return []; } })();
        const columns = Array.isArray(parsedKey) && parsedKey.length > 0 ? Object.keys(parsedKey[0]).filter(k => !['points', 'pointType', 'id', 'rowId'].includes(k)) : [];
        let totalPoints = 0;
        let earnedPoints = 0;
        if (Array.isArray(parsedKey)) {
          parsedKey.forEach((row: any, rowIdx: number) => {
            const rowPoints = row.points !== undefined ? Number(row.points) : 1;
            const pointType = row.pointType || "both"; // Default to "both" for backward compatibility
            
            let possiblePoints = rowPoints;
            if (pointType === "each") {
              possiblePoints = rowPoints * columns.length;
            }
            totalPoints += possiblePoints;
            
            let allCorrect = true;
            let correctColumnCount = 0;
            
            columns.forEach((col) => {
              const studentAns = (parsedAnswer[rowIdx]?.[col] || '').toString().trim().toLowerCase();
              const correctAns = (row[col] || '').toString().trim().toLowerCase();
              if (studentAns === correctAns) {
                correctColumnCount++;
              } else {
                allCorrect = false;
              }
            });
            
            if (pointType === "both") {
              if (allCorrect) earnedPoints += rowPoints;
            } else if (pointType === "each") {
              earnedPoints += correctColumnCount * rowPoints;
            }
          });
        }
        return totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null;
      }

      // Try common precomputed percent or table-specific keys
      const tableCandidates = ['table_score', 'table_percent', 'table_percentage', 'tableScore', 'tablePercent', 'tablePercentage', 'percentage', 'percent'];
      for (const k of tableCandidates) {
        if (res[k] !== undefined && res[k] !== null) {
          const raw = String(res[k]).replace('%','').trim();
          const n = Number(raw);
          if (!Number.isNaN(n)) {
            // if value looks like fraction (0-1), convert
            if (n > 0 && n <= 1) return Math.round(n * 100);
            return Math.round(n);
          }
        }
      }

      // Try raw_response field shapes that some backends use
      if (res.raw_response && typeof res.raw_response === 'object') {
        const rr = res.raw_response;
        const scoreKeys = ['score','raw_score','points_earned','earned','correct_count'];
        const totalKeys = ['total','raw_total','points_total','max','total_count'];
        let s:any = null; let t:any = null;
        for (const k of scoreKeys) if (rr[k] !== undefined) { s = rr[k]; break; }
        for (const k of totalKeys) if (rr[k] !== undefined) { t = rr[k]; break; }
        const sNum = s !== null ? Number(String(s).replace('%','').trim()) : null;
        const tNum = t !== null ? Number(String(t).replace('%','').trim()) : null;
        if (sNum !== null && !Number.isNaN(sNum) && tNum !== null && !Number.isNaN(tNum) && tNum > 0) {
          return Math.round((sNum / tNum) * 100);
        }
      }

      // Regular exams: treat res.score as points, or percent string, or 'num/den' format
      if (res.score !== undefined && res.score !== null) {
        const scoreRaw = String(res.score).trim();
        // If score is already a percent like '85%'
        if (scoreRaw.endsWith('%')) {
          const n = Number(scoreRaw.replace('%',''));
          if (!Number.isNaN(n)) return Math.round(n);
        }
        // If score is 'num/den'
        if (scoreRaw.includes('/')) {
          const parts = scoreRaw.split('/').map(p => Number(p.trim()));
          const num = parts[0];
          const den = parts[1] && !Number.isNaN(parts[1]) ? parts[1] : (ex.totalItemScore ?? ex.points ?? 100);
          const denNum = Number(den);
          if (!Number.isNaN(num) && !Number.isNaN(denNum) && denNum > 0) return Math.round((num / denNum) * 100);
        }
        // Otherwise, treat as numeric points and divide by exam total (safe numeric fallback)
        const totalRaw = ex.totalItemScore ?? ex.points ?? 100;
        const totalNum = Number(totalRaw);
        const scoreNum = Number(scoreRaw);
        if (!Number.isNaN(scoreNum) && Number.isFinite(totalNum) && totalNum > 0) return Math.round((scoreNum / totalNum) * 100);
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // Helper: find findings/AI percent from result (multiple possible property names)
  const getFindingsPercent = (res: any) => {
    try {
      // Check direct findings_score property first (highest priority)
      if (res.findings_score !== undefined && res.findings_score !== null) {
        const n = Number(res.findings_score);
        if (!Number.isNaN(n)) return Math.round(n);
      }
      
      // First, try to extract from details field (where we store explanationScore/explanationPoints)
      if (res.details) {
        try {
          const detailsObj = typeof res.details === 'string' 
            ? JSON.parse(res.details) 
            : res.details;
          
          // Check if findings_score is in details
          if (detailsObj.findings_score !== undefined && detailsObj.findings_score !== null) {
            const n = Number(detailsObj.findings_score);
            if (!Number.isNaN(n)) return Math.round(n);
          }
          
          if (detailsObj.explanationScore !== undefined && 
              detailsObj.explanationPoints !== undefined &&
              detailsObj.explanationScore !== null &&
              detailsObj.explanationPoints !== null &&
              detailsObj.explanationScore !== '' &&
              detailsObj.explanationPoints !== '') {
            const expScore = parseInt(detailsObj.explanationScore, 10);
            const expTotal = parseInt(detailsObj.explanationPoints, 10);
            if (!isNaN(expScore) && !isNaN(expTotal) && expTotal > 0) {
              return Math.round((expScore / expTotal) * 100);
            }
          }
        } catch (detailsErr) {
          // Fall through to other candidates
        }
      }
      
      const candidates = ['findings_score', 'findingsPercent', 'findings_percent', 'ai_score', 'ai_grade', 'ai_overall', 'overall', 'findings', 'ai', 'findingsPercent', 'findingsPercentage', 'findings_percentage', 'score_percent', 'scorePercentage'];
      for (const k of candidates) {
        if (res[k] !== undefined && res[k] !== null) {
          // strip trailing % if present
          const str = typeof res[k] === 'string' ? res[k].replace('%', '').trim() : res[k];
          const n = Number(str);
          if (!Number.isNaN(n)) return Math.round(n);
        }
      }
      // Sometimes AI data is nested under aiResult or ai_grade or rubric
      const nestedCandidates = ['ai_result','aiResult','ai_grade','rubric','aiGrades','ai_scores'];
      for (const k of nestedCandidates) {
        if (res[k] && typeof res[k] === 'object') {
          const obj = res[k];
          for (const sub of ['overall','score','percent','percentage']) {
            if (obj[sub] !== undefined && obj[sub] !== null) {
              const val = Number(String(obj[sub]).replace('%','').trim());
              if (!Number.isNaN(val)) return Math.round(val);
            }
          }
        }
      }
      // some endpoints may embed ai grade object
      if (res.ai && typeof res.ai === 'object') {
        const overall = Number(res.ai.score ?? res.ai.overall ?? NaN);
        if (!Number.isNaN(overall)) return Math.round(overall);
      }
    } catch (e) {
      // ignore
    }
    return null;
  };

  // Compute exam-level averages for table and findings
  const computeExamAverages = (ex: any, aiMap?: Record<string, number | null>) => {
    if (!ex || !Array.isArray(ex.results) || ex.results.length === 0) return { avgTable: null, avgFindings: null, combinedAvg: null };
    const tableVals: number[] = [];
    const findingsVals: number[] = [];
    ex.results.forEach((r: any, idx: number) => {
      const t = computeTablePercentForRes(r, ex);
      // Prefer aiMap (from API fetch) over trying to extract from result object
      const sid = r.student_id ?? r.studentId ?? r.student;
      const eid = r.exam_id ?? r.examId ?? r.exam_id;
      const key = `${sid}_${eid}`;
      const f = aiMap && aiMap[key] !== undefined ? aiMap[key] : getFindingsPercent(r);
      if (t !== null && t !== undefined) tableVals.push(t);
      if (f !== null && f !== undefined) findingsVals.push(f);
    });
    const avg = (arr: number[]) => arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const avgTable = avg(tableVals);
    const avgFindings = avg(findingsVals);
    let combined = null;
    if (avgTable !== null && avgFindings !== null) combined = Math.round((avgTable + avgFindings) / 2);
    else if (avgTable !== null) combined = avgTable;
    else if (avgFindings !== null) combined = avgFindings;
    return { avgTable, avgFindings, combinedAvg: combined };
  };

  // Helper: derive maximum possible points for the table portion of an exam
  const getTableMaxPoints = (ex: any) => {
    try {
      if (!ex) return null;
      // For forensic questions, answer_key may contain specimens with row points
      if (ex.question_type === 'forensic' && ex.answer_key) {
        try {
          const parsedKey = JSON.parse(ex.answer_key || '[]');
          const specimens = parsedKey.specimens && Array.isArray(parsedKey.specimens) ? parsedKey.specimens : (Array.isArray(parsedKey) ? parsedKey : []);
          if (Array.isArray(specimens) && specimens.length > 0) {
            return specimens.reduce((sum: number, row: any) => sum + (Number(row.points) || 1), 0);
          }
        } catch (e) {
          // fallthrough
        }
      }
      // Fallbacks: some endpoints expose totalItemScore or points
      const tot = ex.totalItemScore ?? ex.total_items ?? ex.points ?? ex.totalPoints ?? null;
      return (tot !== null && tot !== undefined) ? Number(tot) : null;
    } catch (e) {
      return null;
    }
  };

  // Helper: derive maximum possible points for the findings/explanation portion of an exam
  const getFindingsMaxPoints = (ex: any) => {
    try {
      if (!ex) return null;
      // Try top-level fields often used when questions are created
      if (ex.explanation_points !== undefined && ex.explanation_points !== null) return Number(ex.explanation_points);
      if (ex.explanationPoints !== undefined && ex.explanationPoints !== null) return Number(ex.explanationPoints);
      // Try to parse answer_key/exam.answer for explanation points
      if (ex.answer_key) {
        try {
          const parsedKey = JSON.parse(ex.answer_key || '{}');
          if (parsedKey && typeof parsedKey === 'object') {
            if (parsedKey.explanation && (parsedKey.explanation.points !== undefined)) return Number(parsedKey.explanation.points || 0);
          }
        } catch (e) { /* ignore */ }
      }
      if (ex.answer) {
        try {
          const parsed = JSON.parse(ex.answer || '{}');
          if (parsed && parsed.explanation && parsed.explanation.points !== undefined) return Number(parsed.explanation.points || 0);
        } catch (e) { /* ignore */ }
      }
      // Fallback to using exam-level totals (if findings are not separately tracked this will approximate)
      const tot = ex.totalItemScore ?? ex.points ?? null;
      return (tot !== null && tot !== undefined) ? Number(tot) : null;
    } catch (e) {
      return null;
    }
  };

  const pointsFromPercent = (percent: number | null, maxPoints: number | null) => {
    if (percent === null || percent === undefined) return null;
    if (maxPoints === null || maxPoints === undefined || Number.isNaN(Number(maxPoints))) return null;
    return Math.round((Number(percent) / 100) * Number(maxPoints));
  };

  // Helper: derive student label when name missing (global)
  const studentLabel = (res: any, idx: number) => res?.student_name || res?.student_id || res?.participant_name || `Participant ${idx + 1}`;

  // Normalize a single result (compute raw_score/raw_total/totalPoints/earnedPoints/score) similar to student Results processing
  const normalizeResultForScoring = (res: any, exam: any) => {
    const out = { ...res };
    const safeString = (value: any) => {
      if (value === null || value === undefined) return "";
      return typeof value === 'string' ? value : String(value);
    };

    let raw_score = out.raw_score;
    let raw_total = out.raw_total;
  let totalPoints = (out.totalPoints ?? out.total_points ?? out.total) || 0;
  let earnedPoints = (out.earnedPoints ?? out.earned_points ?? out.earned) || 0;

    if (exam.question_type === "forensic" && out.answer && exam.answer_key) {
      let parsedAnswer: any = [];
      let parsedKey: any = [];
      let columns: string[] = [];
      try {
        if (out.answer) {
          const rawAnswer = JSON.parse(out.answer);
          parsedAnswer = rawAnswer.tableAnswers || rawAnswer || [];
        }
        if (exam.answer_key) {
          const rawKey = JSON.parse(exam.answer_key);
          if (rawKey.specimens && Array.isArray(rawKey.specimens)) parsedKey = rawKey.specimens;
          else if (Array.isArray(rawKey)) parsedKey = rawKey;
          else parsedKey = [];
        }
        if (!Array.isArray(parsedKey)) parsedKey = [];
        columns = parsedKey.length > 0 ? Object.keys(parsedKey[0]).filter((k) => !['points','pointType','id','rowId'].includes(k)) : [];
      } catch (e) {
        parsedAnswer = [];
        parsedKey = [];
        columns = [];
      }

      raw_total = parsedKey.length * columns.length;
      raw_score = 0;
      totalPoints = 0;
      earnedPoints = 0;

      if (Array.isArray(parsedKey)) {
        parsedKey.forEach((row: any, rowIdx: number) => {
          const rowPoints = row.points !== undefined ? Number(row.points) : 1;
          const pointType = row.pointType || "both"; // Default to "both" for backward compatibility
          
          let possiblePoints = rowPoints;
          if (pointType === "each") {
            possiblePoints = rowPoints * columns.length;
          }
          totalPoints += possiblePoints;
          
          let allCorrectForRow = true;
          let correctColumnCount = 0;
          columns.forEach((col) => {
            const studentAns = safeString(parsedAnswer[rowIdx]?.[col]);
            const correctAns = safeString(row[col]);
            if (studentAns.trim().toLowerCase() === correctAns.trim().toLowerCase()) {
              raw_score++;
              correctColumnCount++;
            } else {
              allCorrectForRow = false;
            }
          });
          
          if (pointType === "both") {
            if (allCorrectForRow) earnedPoints += rowPoints;
          } else if (pointType === "each") {
            earnedPoints += correctColumnCount * rowPoints;
          }
        });
      }
    }

    // Compute percentage score
    let score = out.score;
    if (totalPoints > 0) {
      score = Math.round((earnedPoints / totalPoints) * 100);
    } else if (raw_score !== undefined && raw_total !== undefined) {
      score = raw_total > 0 ? Math.round((raw_score / raw_total) * 100) : 0;
    }

    out.raw_score = raw_score;
    out.raw_total = raw_total;
    out.totalPoints = totalPoints;
    out.earnedPoints = earnedPoints;
    out.score = score;
    return out;
  };

  const getCourseName = (exam: any) => {
    const cid = exam.course || exam.course_id;
    if (!cid) return exam.course_name || '';
    const found = courses.find(c => String(c.id) === String(cid) || String(c.course_id) === String(cid) || String(c.name) === String(cid));
    return found ? (found.name || found.course || String(cid)) : (exam.course_name || String(cid));
  };

  const getClassName = (exam: any) => {
    const cls = exam.class || exam.class_id;
    if (!cls) return '';
    const found = classes.find(c => String(c.id) === String(cls) || String(c.class_id) === String(cls) || String(c.name) === String(cls));
    return found ? (found.name || found.course || String(cls)) : String(cls);
  };

  // Debounce search term to prevent excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter and sort results with improved search
  const filteredAndSortedResults = useMemo(() => {
    let filtered = results;

    // Apply search filter with better error handling
    if (debouncedSearchTerm.trim()) {
      try {
        const searchLower = debouncedSearchTerm.toLowerCase();
        filtered = results.filter((exam) => {
          // Safely check each field with null/undefined protection
          const examName = (exam.name || exam.examName || "").toString().toLowerCase();
          const className = (exam.class || exam.class_id || "").toString().toLowerCase();
          const examToken = (exam.token || "").toString().toLowerCase();
          const questionTitle = (exam.question_title || "").toString().toLowerCase();
          
          // Format exam date in easy-to-read format (Nov 26, 2025)
          let examDateFormatted = "";
          try {
            const date = new Date(exam.start || exam.date || 0);
            const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            examDateFormatted = date.toLocaleDateString('en-US', options).toLowerCase();
          } catch (e) {
            examDateFormatted = "";
          }
          
          return (
            examName.includes(searchLower) ||
            className.includes(searchLower) ||
            examToken.includes(searchLower) ||
            questionTitle.includes(searchLower) ||
            examDateFormatted.includes(searchLower)
          );
        });
      } catch (error) {
        console.error("Error in search filter:", error);
        // If search fails, return all results
        filtered = results;
      }
    }

    // Apply sorting
    if (sortColumn) {
      const toStr = (v: any) => (v === undefined || v === null ? "" : String(v));
      filtered = [...filtered].sort((a, b) => {
        let aVal: any, bVal: any;

        switch (sortColumn) {
          case "name":
            aVal = toStr(a.name || a.examName || "").toLowerCase();
            bVal = toStr(b.name || b.examName || "").toLowerCase();
            break;
          case "class":
            aVal = toStr(a.class || a.class_id || "").toLowerCase();
            bVal = toStr(b.class || b.class_id || "").toLowerCase();
            break;
          case "course":
            aVal = toStr(a.course || a.course_id || a.courseName || "").toLowerCase();
            bVal = toStr(b.course || b.course_id || b.courseName || "").toLowerCase();
            break;
          case "date":
            aVal = new Date(a.start || a.date || 0).getTime();
            bVal = new Date(b.start || b.date || 0).getTime();
            break;
          case "participants":
            aVal = Number(a.participants || 0);
            bVal = Number(b.participants || 0);
            break;
          case "avgTable":
            aVal = (computeExamAverages(a, aiScores).avgTable !== null ? computeExamAverages(a, aiScores).avgTable : -1);
            bVal = (computeExamAverages(b, aiScores).avgTable !== null ? computeExamAverages(b, aiScores).avgTable : -1);
            break;
          case "avgFindings":
            aVal = (computeExamAverages(a, aiScores).avgFindings !== null ? computeExamAverages(a, aiScores).avgFindings : -1);
            bVal = (computeExamAverages(b, aiScores).avgFindings !== null ? computeExamAverages(b, aiScores).avgFindings : -1);
            break;
          case "avgScore":
            aVal = a.avgScore !== undefined ? Number(a.avgScore) : -1;
            bVal = b.avgScore !== undefined ? Number(b.avgScore) : -1;
            break;
          case "token":
            aVal = toStr(a.token || "").toLowerCase();
            bVal = toStr(b.token || "").toLowerCase();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [results, debouncedSearchTerm, sortColumn, sortDirection]);

  // Apply course filter
  // Get unique courses from results and map exam course_id to course details
  const availableCourses = useMemo(() => {
    const uniqueCourseIds = new Set<string>();
    results.forEach(r => {
      const courseId = String(r.course_id || r.course || "");
      if (courseId) uniqueCourseIds.add(courseId);
    });
    return courses.filter(course => uniqueCourseIds.has(String(course.id)));
  }, [results, courses]);

  // Filter and display results based on search and course filter
  const visibleResults = useMemo(() => {
    let filtered = filteredAndSortedResults;
    
    // Apply course filter
    if (courseFilter && courseFilter !== "all") {
      filtered = filtered.filter(r => {
        const examCourseId = String(r.course_id || r.course || "");
        const filterCourseId = String(courseFilter);
        return examCourseId === filterCourseId;
      });
    }

    return filtered;
  }, [filteredAndSortedResults, courseFilter]);

  // Pagination: show a fixed number of items per page
  const totalResults = visibleResults.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages]);

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return visibleResults.slice(start, start + itemsPerPage);
  }, [visibleResults, currentPage]);

  // Filter results based on search term (keeping for backward compatibility)
  const filteredResults = useMemo(() => {
    return filteredAndSortedResults;
  }, [filteredAndSortedResults]);

  // Handle delete exam
  const handleDeleteExam = async (examId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exams/${examId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (response.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete exam");
      }

      toast({ title: "Success", description: "Exam deleted successfully" });
      // Refetch exams or filter them out locally
      setResults(results.filter((exam) => exam.id !== examId));
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete exam", variant: "destructive" });
    }
  };

  // Bulk delete selected exams
  const handleBulkDeleteConfirmed = async () => {
    if (selectedIds.length === 0) return;
    try {
      for (const id of selectedIds) {
        await handleDeleteExam(id);
      }
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
    } catch (e) {
      console.error('Bulk delete failed', e);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const toggleSelectAll = () => {
    const allIds = paginatedResults.map(r => r.id);
    const isAll = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));
    if (isAll) setSelectedIds([]);
    else setSelectedIds(allIds);
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };

  // Handle update exam
  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingExam) return;

    try {
      // Ensure we send all required fields the backend validates (fall back to existing exam values)
      const existingExam = results.find(r => r.id === editingExam.id) || {};
      const payload: any = {
        name: editingExam.name ?? editingExam.examName ?? existingExam.name ?? existingExam.examName,
        course_id: editingExam.course_id ?? editingExam.course ?? existingExam.course_id ?? existingExam.course,
        class_id: editingExam.class_id ?? editingExam.class ?? existingExam.class_id ?? existingExam.class,
        instructor_id: editingExam.instructor_id ?? editingExam.instructorId ?? existingExam.instructor_id ?? existingExam.instructor_id ?? existingExam.instructor,
        question_id: editingExam.question_id ?? editingExam.questionId ?? existingExam.question_id ?? existingExam.question_id ?? existingExam.question,
        start: editingExam.start ?? existingExam.start ?? null,
        end: editingExam.end ?? existingExam.end ?? null,
        duration: editingExam.duration ?? existingExam.duration ?? null,
      };

      const response = await fetch(`${API_BASE_URL}/api/exams/${editingExam.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        toast({
          title: "Authentication Error",
          description: "Please log in again.",
          variant: "destructive",
        });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update exam");
      }

      toast({ title: "Success", description: "Exam updated successfully" });
      // Update the exam in local state: merge returned fields or edited values
      let updatedExamData: any = existingExam;
      try {
        const json = await response.json();
        if (json && json.id) {
          updatedExamData = { ...existingExam, ...json };
        } else {
          updatedExamData = { ...existingExam, ...editingExam };
        }
      } catch (e) {
        updatedExamData = { ...existingExam, ...editingExam };
      }

      setResults(results.map((exam) => exam.id === editingExam.id ? updatedExamData : exam));
      setEditingExam(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update exam", variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (examId: number) => {
    let exam = results.find(r => r.id === examId);
    if (!exam) return;

    // If participants exist but results are missing, attempt to fetch
    if ((!exam.results || !Array.isArray(exam.results) || exam.results.length === 0) && Number(exam.participants) > 0) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/exams/results/${exam.id}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const details = await res.json();
          let normalizedResults: any[] = [];
          let participants = exam.participants;
          let avgScore = exam.avgScore;
          let totalItemScore = exam.totalItemScore;

          if (Array.isArray(details)) {
            normalizedResults = details.map((r: any) => normalizeResultForScoring(r, exam));
          } else if (details && Array.isArray(details.results)) {
            normalizedResults = details.results.map((r: any) => normalizeResultForScoring(r, exam));
            participants = details.participants ?? participants;
            avgScore = details.avgScore ?? avgScore;
            totalItemScore = details.totalItemScore ?? totalItemScore;
          } else if (details && Array.isArray(details.data)) {
            normalizedResults = details.data.map((r: any) => normalizeResultForScoring(r, exam));
          } else if (details && details.result && Array.isArray(details.result)) {
            normalizedResults = details.result.map((r: any) => normalizeResultForScoring(r, exam));
          }

          exam = { ...exam, results: normalizedResults, participants, avgScore, totalItemScore };
          setResults(prev => prev.map(p => p.id === exam.id ? exam : p));
          // kick off background AI grade fetch for normalized results so findings scores populate
          try { fetchAiGradesForResults(normalizedResults); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Failed to fetch exam results for PDF', e);
      }
    }

    const doc = new jsPDF();

    // Helper: derive student label when name missing
    const studentLabel = (res: any, idx: number) => res.student_name || res.student_id || res.participant_name || `Participant ${idx + 1}`;

    // Ensure AI grades fetched and used to compute averages so Findings appear immediately in the exported PDF
    const fetchedMapForPDF = await fetchAiGradesForResults(exam.results) || {};
    const { avgTable, avgFindings, combinedAvg } = computeExamAverages(exam, fetchedMapForPDF);

    // Add top logo if available, centered
    let headerOffset = 0;
    try {
      const topUrl = new URL(topLogo, window.location.href).href;
      const bottomUrl = new URL(bottomLogo, window.location.href).href;
      const [topImg, bottomImg] = await Promise.allSettled([loadImageToDataUrl(topUrl), loadImageToDataUrl(bottomUrl)]);
      if (topImg.status === 'fulfilled') {
        const { dataUrl, w, h } = topImg.value;
        const dispW = 60; // mm
        const dispH = (h / w) * dispW;
        const pageW = doc.internal.pageSize.getWidth();
        const x = (pageW - dispW) / 2;
        doc.addImage(dataUrl, 'PNG', x, 8, dispW, dispH);
        headerOffset = dispH + 6;
      }
    } catch (e) { /* ignore */ }

    // Add title and exam information below header
    doc.text(`Exam Results: ${exam.name || exam.examName}`, 14, 15 + headerOffset);
  doc.setFontSize(10);
  // Use current date as the examination/analysis date so reports reflect when analysis was performed
  const examinationDate = (new Date()).toISOString().split('T')[0];
  doc.text(`Examination Date: ${examinationDate}`, 14, 22);
  doc.text(`Class: ${getClassName(exam) || exam.class || exam.class_id || '-'}`, 14, 27);
  doc.text(`Course: ${getCourseName(exam) || exam.course || exam.course_name || exam.course_id || '-'}`, 14, 32);
    doc.text(`Token: ${exam.token}`, 14, 37);
    doc.text(`Participants: ${exam.participants || 0}`, 14, 42);
    const tableMaxForPdf = getTableMaxPoints(exam);
    const findingsMaxForPdf = getFindingsMaxPoints(exam);
    const avgTablePts = pointsFromPercent(avgTable, tableMaxForPdf);
    const avgFindingsPts = pointsFromPercent(avgFindings, findingsMaxForPdf);
    const avgText = `Table: ${avgTable !== null ? avgTable + '%' + (avgTablePts !== null && tableMaxForPdf !== null ? ` (${avgTablePts}/${tableMaxForPdf})` : '') : '-'}  Findings: ${avgFindings !== null ? avgFindings + '%' + (avgFindingsPts !== null && findingsMaxForPdf !== null ? ` (${avgFindingsPts}/${findingsMaxForPdf})` : '') : '-'}  Combined: ${combinedAvg !== null ? combinedAvg + '%' : '-'}`;
    doc.text(`Average Score: ${avgText}`, 14, 47);

    // Add student results if available
    if (exam.results && Array.isArray(exam.results) && exam.results.length > 0) {
      if (exam.question_type === "forensic" && exam.answer_key) {
        // Process forensic exam results
        const tableRows = exam.results.map((res: any) => {
          let parsedAnswer = [];
          let parsedKey = [];
          let columns = [];
          try {
            parsedAnswer = JSON.parse(res.answer || "[]");
            parsedKey = JSON.parse(exam.answer_key || "[]");
            columns = parsedKey.length > 0 ? Object.keys(parsedKey[0]).filter(k => !['points', 'pointType'].includes(k)) : [];
          } catch { parsedAnswer = []; parsedKey = []; columns = []; }

          const raw_total = parsedKey.length * columns.length;
          let raw_score = 0;
          let totalPoints = 0;
          let earnedPoints = 0;

          parsedKey.forEach((row: any, rowIdx: number) => {
            // Get row points if available
            const rowPoints = row.points !== undefined ? Number(row.points) : 1;
            const pointType = row.pointType || "both"; // Default to "both" for backward compatibility
            
            let possiblePoints = rowPoints;
            if (pointType === "each") {
              possiblePoints = rowPoints * columns.length;
            }
            totalPoints += possiblePoints;

            // Check each column for correctness
            let allCorrectForRow = true;
            let correctColumnCount = 0;
            columns.forEach((col: string) => {
              const studentAns = (parsedAnswer[rowIdx]?.[col] || "").toString().trim().toLowerCase();
              const correctAns = (row[col] || "").toString().trim().toLowerCase();
              if (studentAns === correctAns) {
                raw_score++;
                correctColumnCount++;
              } else {
                allCorrectForRow = false;
              }
            });

            // Award points based on point type
            if (pointType === "both") {
              if (allCorrectForRow) {
                earnedPoints += rowPoints;
              }
            } else if (pointType === "each") {
              earnedPoints += correctColumnCount * rowPoints;
            }
          });

          const percent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
          return [
            res.student_name || res.student_id,
            raw_score,
            raw_total,
            `${earnedPoints}/${totalPoints}`,
            `${percent}`
          ];
        });

        autoTable(doc, {
          head: [["Student", "Raw Score", "Raw Total", "Points", "Percentage"]],
          body: tableRows,
          startY: 50,
        });
      } else {
        // Regular exam results
        autoTable(doc, {
          head: [["Student", "Score", "Date Taken"]],
          body: exam.results.map((r: any) => [
            r.student_name || r.student_id,
            r.score !== undefined ? `${r.score}/${exam.totalItemScore || exam.points || 100} (${Math.round((r.score / (exam.totalItemScore || exam.points || 100)) * 100)}%)` : '-',
            r.date || '-'
          ]),
          startY: 50,
        });
      }
    } else {
      doc.text("No results available", 14, 50);
    }

    // add bottom logo on all pages if available
    try {
      const bottomUrl = new URL(bottomLogo, window.location.href).href;
      const botImg = await loadImageToDataUrl(bottomUrl).catch(() => null);
      if (botImg) {
        const { dataUrl, w, h } = botImg;
        const dispW = 60;
        const dispH = (h / w) * dispW;
        const pageW = doc.internal.pageSize.getWidth();
        const x = (pageW - dispW) / 2;
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          const pageH = doc.internal.pageSize.getHeight();
          doc.addImage(dataUrl, 'PNG', x, pageH - dispH - 8, dispW, dispH);
        }
      }
    } catch (e) { /* ignore */ }

    doc.save(`exam_results_${examId}.pdf`);
    toast({ title: "PDF Exported", description: "Exam results PDF downloaded." });
  };

  const handleViewDetails = async (examId: number) => {
    let exam = results.find(r => r.id === examId);
    if (!exam) return;

    // If participants exist but detailed results are missing, try to fetch them
    if ((!exam.results || !Array.isArray(exam.results) || exam.results.length === 0) && Number(exam.participants) > 0) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/exams/results/${exam.id}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const details = await res.json();
          // Normalize various response shapes:
          // - array of results
          // - { results: [...], participants, avgScore }
          // - { data: [...] }
          let normalizedResults: any[] = [];
          let participants = exam.participants;
          let avgScore = exam.avgScore;
          let totalItemScore = exam.totalItemScore;
          
          // Ensure we fetch AI grades for all results
          const resultsToProcess = Array.isArray(details) ? details : 
                                 Array.isArray(details.results) ? details.results :
                                 Array.isArray(details.data) ? details.data :
                                 details.result && Array.isArray(details.result) ? details.result : [];

          if (Array.isArray(details)) {
            normalizedResults = details.map((r: any) => normalizeResultForScoring(r, exam));
          } else if (details && Array.isArray(details.results)) {
            normalizedResults = details.results.map((r: any) => normalizeResultForScoring(r, exam));
            participants = details.participants ?? participants;
            avgScore = details.avgScore ?? avgScore;
            totalItemScore = details.totalItemScore ?? totalItemScore;
          } else if (details && Array.isArray(details.data)) {
            normalizedResults = details.data.map((r: any) => normalizeResultForScoring(r, exam));
          } else if (details && details.result && Array.isArray(details.result)) {
            normalizedResults = details.result.map((r: any) => normalizeResultForScoring(r, exam));
          }

          exam = { ...exam, results: normalizedResults, participants, avgScore, totalItemScore };
          setResults(prev => prev.map(p => p.id === exam.id ? exam : p));
          try { fetchAiGradesForResults(normalizedResults); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Error fetching missing exam results:', e);
      }
    }

    // Open the print/details window synchronously so browsers treat it as a user gesture
    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Popup blocked. Please allow popups for this site.",
        variant: "destructive"
      });
      return;
    }

    // Immediately write a minimal loading page so the popup is populated synchronously
    try {
      printWindow.document.open();
      printWindow.document.write(`<html><head><title>Loading...</title></head><body><div style="font-family: Arial, sans-serif; padding:20px;">Loading exam details... Please wait.</div></body></html>`);
      printWindow.document.close();
    } catch (err) {
      // ignore write errors
    }

    // Generate CSS styles for the final print window
    const styles = `
      body { font-family: Arial, sans-serif; margin: 20px; }
      h1 { color: #333; font-size: 24px; margin-bottom: 10px; }
      h2 { color: #555; font-size: 20px; margin-top: 20px; margin-bottom: 10px; }
      .info-container { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
      .info-item { margin-bottom: 10px; }
      .info-label { font-weight: bold; color: #555; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
      .correct { color: green; }
      .incorrect { color: red; }
      .print-btn { 
        background-color: #4CAF50; 
        color: white; 
        padding: 10px 15px; 
        border: none;
        cursor: pointer;
        font-size: 16px;
        margin: 20px 0;
      }
      .print-btn:hover { background-color: #45a049; }
      .no-print { display: none; }
      @media print {
        .no-print { display: none; }
        button { display: none; }
        body { margin: 0; padding: 15px; }
      }
    `;

    // Format date for display (short month, e.g., Nov 25, 2025)
    const formatDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return '-';
      try {
        const date = new Date(dateStr);
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
      } catch (e) {
        try { return String(dateStr).split('T')[0]; } catch { return String(dateStr); }
      }
    };

    // (uses centralized helpers computeTablePercentForRes, getFindingsPercent, computeExamAverages)

    // Calculate the total item score
    // Note: total items removed from print view per request; score helpers handle missing totals robustly

    // Ensure AI grades are loaded for these results so Findings percent displays
    try {
      if (exam.results && Array.isArray(exam.results) && exam.results.length > 0) {
        // fetch and get a map of scores so we can use them immediately in this function
        // (setState inside fetchAiGradesForResults will also update component state)
        var fetchedAiMap = await fetchAiGradesForResults(exam.results) || {};
      }
    } catch (e) {
      // continue even if AI grade fetch fails
    }

    // compute averages using fetched AI scores (if any) so they appear immediately
    const { avgTable, avgFindings, combinedAvg } = computeExamAverages(exam, typeof fetchedAiMap !== 'undefined' ? fetchedAiMap : undefined);

    // Start writing a cleaner HTML report (header, info, and results table)
    const topLogoUrl = new URL(topLogo, window.location.href).href;
    const bottomLogoUrl = new URL(bottomLogo, window.location.href).href;
    printWindow.document.write(`
      <html>
        <head>
          <title>Exam Results: ${exam.name || 'Exam Details'}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #111 }
            .print-header, .print-footer { text-align: center; margin-bottom: 10px }
            .print-logo-top, .print-logo-bottom { width: 260px; height: auto; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px }
            .info-item { font-size: 13px }
            h1 { font-size: 20px; margin-bottom: 6px }
            table { width: 100%; border-collapse: collapse; margin-top: 8px }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px }
            th { background: #f3f4f6; }
            .print-actions { margin-top: 14px; text-align: center }
            .print-btn { background: #111827; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer }
            @media print { .print-actions { display: none } }
          </style>
        </head>
        <body>
          <div class="print-header"><img src="${topLogoUrl}" class="print-logo-top" alt="Top Logo" /></div>
          <h1>Exam Report — ${exam.name || exam.examName || 'Untitled'}</h1>
          <div class="info-grid">
            <div class="info-item"><strong>Examination Date:</strong> ${formatDate((new Date()).toISOString())}</div>
            <div class="info-item"><strong>Class:</strong> ${getClassName(exam) || exam.class || exam.class_id || '-'}</div>
            <div class="info-item"><strong>Course:</strong> ${getCourseName(exam) || exam.course || exam.course_name || exam.course_id || '-'}</div>
            <div class="info-item"><strong>Participants:</strong> ${exam.participants || 0}</div>
            <div class="info-item"><strong>Token:</strong> <span style="font-family:monospace">${exam.token || '-'}</span></div>
            <!-- Total Items removed -->
            <div class="info-item"><strong>Average (Table):</strong> ${avgTable !== null ? (avgTable + '%' + (pointsFromPercent(avgTable, getTableMaxPoints(exam)) !== null && getTableMaxPoints(exam) !== null ? ` (${pointsFromPercent(avgTable, getTableMaxPoints(exam))}/${getTableMaxPoints(exam)})` : '')) : '-'}</div>
            <div class="info-item"><strong>Average (Findings):</strong> ${avgFindings !== null ? (avgFindings + '%' + (pointsFromPercent(avgFindings, getFindingsMaxPoints(exam)) !== null && getFindingsMaxPoints(exam) !== null ? ` (${pointsFromPercent(avgFindings, getFindingsMaxPoints(exam))}/${getFindingsMaxPoints(exam)})` : '')) : '-'}</div>
          </div>

          <h2>Student Results</h2>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Table Score</th>
                <th>Findings Score</th>
                <th>Date Taken</th>
                <th>Tab Switches</th>
              </tr>
            </thead>
            <tbody>
    `);

    if (exam.results && Array.isArray(exam.results) && exam.results.length > 0) {
      const tableMaxForPrint = getTableMaxPoints(exam);
      const findingsMaxForPrint = getFindingsMaxPoints(exam);
      exam.results.forEach((res: any, idx: number) => {
        const tablePercent = computeTablePercentForRes(res, exam);
        const key = `${res.student_id ?? res.studentId ?? res.student}_${exam.id ?? exam.exam_id ?? exam.id}`;
        const aiFromMap = (typeof fetchedAiMap !== 'undefined' && fetchedAiMap[key] !== undefined) ? fetchedAiMap[key] : aiScores[key];
        const findingsPercent = aiFromMap !== undefined ? aiFromMap : getFindingsPercent(res);
        const tablePts = pointsFromPercent(tablePercent, tableMaxForPrint);
        const findingsPts = pointsFromPercent(findingsPercent, findingsMaxForPrint);
        printWindow.document.write(`
          <tr>
            <td>${studentLabel(res, idx)}</td>
            <td>${tablePercent !== null ? (tablePercent + '%' + (tablePts !== null && tableMaxForPrint !== null ? ` (${tablePts}/${tableMaxForPrint} pts)` : '')) : '-'}</td>
            <td>${findingsPercent !== null ? (findingsPercent + '%' + (findingsPts !== null && findingsMaxForPrint !== null ? ` (${findingsPts}/${findingsMaxForPrint} pts)` : '')) : '-'}</td>
            <td>${formatDate(res.date)}</td>
            <td>${res.tab_switches !== undefined ? res.tab_switches : '-'}</td>
          </tr>
        `);
      });
    } else {
      printWindow.document.write(`<tr><td colSpan="5" style="text-align:center; padding:12px">No student results available.</td></tr>`);
    }

    printWindow.document.write(`
            </tbody>
          </table>
          
          <div class="print-footer"><img src="${bottomLogoUrl}" class="print-logo-bottom" alt="Bottom Logo" /></div>
        </body>
      </html>
    `);

    // Add detailed forensic answer breakdown if available
    if (exam.question_type === 'forensic' && exam.results && exam.results.length > 0 && exam.answer_key) {
      const firstResult = exam.results[0];
      let parsedKey = [];
      try {
        parsedKey = JSON.parse(exam.answer_key || "[]");
      } catch { parsedKey = []; }

      if (parsedKey.length > 0) {
        printWindow.document.write(`
          <h2>Forensic Question Details</h2>
          <p>Question requires students to identify characteristics about specimens.</p>
        `);

        // Determine if we have points per row
        const hasPointsPerRow = 'points' in parsedKey[0];
        const hasPointType = 'pointType' in parsedKey[0];
        const columns = Object.keys(parsedKey[0]).filter(k => !['points', 'pointType'].includes(k));

        printWindow.document.write(`
          <table>
            <thead>
              <tr>
                <th>Row #</th>
                ${columns.map(col => `<th>${col.replace(/([A-Z])/g, ' $1')}</th>`).join('')}
                ${hasPointsPerRow ? '<th>Points Value</th>' : ''}
                ${hasPointType ? '<th>Point Type</th>' : ''}
              </tr>
            </thead>
            <tbody>
        `);

        parsedKey.forEach((row: any, idx: number) => {
          printWindow.document.write(`
            <tr>
              <td>${idx + 1}</td>
              ${columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
              ${hasPointsPerRow ? `<td>${row.points || 1}</td>` : ''}
              ${hasPointType ? `<td>${row.pointType === 'each' ? 'for each correct' : 'if both correct'}</td>` : ''}
            </tr>
          `);
        });

        printWindow.document.write(`
            </tbody>
          </table>
        `);
      }
    }

    // Finish the HTML document
    printWindow.document.write(`
          <div class="print-actions"><button class="print-btn" onclick="window.print();">Print Report</button></div>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  // Format date for table display (short month, e.g., Nov 25, 2025)
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch (e) {
      try { return String(dateStr).split('T')[0]; } catch { return String(dateStr); }
    }
  };

  // Prepare course-level series data for charts
  const courseSeries = useMemo(() => {
    if (!Array.isArray(results) || !Array.isArray(courses)) return [];
    // group exams by course id
    const map: Record<string, any[]> = {};
    results.forEach((ex: any) => {
      const courseId = ex.course ?? ex.course_id ?? ex.courseId ?? ex.id;
      if (!courseId) return;
      const key = String(courseId);
      if (!map[key]) map[key] = [];
      map[key].push(ex);
    });

    const out: Array<{ courseId: string; courseName: string; data: any[] }> = [];
    Object.entries(map).forEach(([cid, exams]) => {
      // find course name
      const course = courses.find((c: any) => String(c.id) === String(cid) || String(c.course_id) === String(cid));
      const name = course ? (course.name || course.course || String(cid)) : String(cid);
      // sort exams by date
      const sorted = exams.slice().sort((a,b) => (new Date(a.start || a.date || 0).getTime()) - (new Date(b.start || b.date || 0).getTime()));
      const data = sorted.map((ex: any) => {
        const { avgTable, avgFindings } = computeExamAverages(ex, aiScores);
        return {
          label: formatDate(ex.start || ex.date) || String(ex.id),
          avgTable: avgTable !== null ? avgTable : null,
          avgFindings: avgFindings !== null ? avgFindings : null,
        };
      });
      if (data.length > 0) out.push({ courseId: cid, courseName: name, data });
    });
    return out;
  }, [results, courses, aiScores]);

  // Prepare class-level series data for charts: for each class, list exams (by date) with avgTable and avgFindings
  const classSeries = useMemo(() => {
    if (!Array.isArray(results) || !Array.isArray(classes)) return [];
    // group exams by class id
    const map: Record<string, any[]> = {};
    results.forEach((ex: any) => {
      const clsId = ex.class ?? ex.class_id ?? ex.classId ?? ex.classId;
      if (!clsId) return;
      const key = String(clsId);
      if (!map[key]) map[key] = [];
      map[key].push(ex);
    });

    const out: Array<{ classId: string; className: string; data: any[] }> = [];
    Object.entries(map).forEach(([cid, exams]) => {
      // find class name
      const cls = classes.find((c: any) => String(c.id) === String(cid) || String(c.class_id) === String(cid));
      const name = cls ? (cls.name || cls.class || String(cid)) : String(cid);
      // sort exams by date
      const sorted = exams.slice().sort((a,b) => (new Date(a.start || a.date || 0).getTime()) - (new Date(b.start || b.date || 0).getTime()));
      const data = sorted.map((ex: any) => {
        const { avgTable, avgFindings } = computeExamAverages(ex, aiScores);
        return {
          label: formatDate(ex.start || ex.date) || String(ex.id),
          avgTable: avgTable !== null ? avgTable : null,
          avgFindings: avgFindings !== null ? avgFindings : null,
        };
      });
      if (data.length > 0) out.push({ classId: cid, className: name, data });
    });
    return out;
  }, [results, classes, aiScores]);

  // Compute most common table-answer errors per exam (for forensic/table questions)
  const commonErrorsMap = useMemo(() => {
    const map: Record<string, Array<{ cell: string; correct: string; wrong: string; count: number }>> = {};
    if (!Array.isArray(results)) return map;

    results.forEach((ex: any) => {
      const examKey = String(ex.id ?? ex.exam_id ?? '');
      map[examKey] = [];
      try {
        if (!ex || !Array.isArray(ex.results) || ex.results.length === 0) return;

        // parse answer key (specimens or array)
        let parsedKey: any[] = [];
        try {
          if (ex.answer_key) {
            const rawKey = JSON.parse(ex.answer_key);
            if (rawKey && Array.isArray(rawKey.specimens)) parsedKey = rawKey.specimens;
            else if (Array.isArray(rawKey)) parsedKey = rawKey;
          }
        } catch (e) {
          parsedKey = [];
        }
        if (!Array.isArray(parsedKey) || parsedKey.length === 0) return;

        const columns = Object.keys(parsedKey[0] || {}).filter((k) => !['points','pointType','id','rowId'].includes(k));

        // prepare tally structure per cell
        const cellTally: Record<string, { correct: string; counts: Record<string, number> }> = {};
        parsedKey.forEach((row: any, rowIdx: number) => {
          columns.forEach((col) => {
            const correct = String(row[col] ?? '').trim();
            const key = `${rowIdx}__${col}`;
            cellTally[key] = { correct, counts: {} };
          });
        });

        // accumulate wrong answers from each student's parsed answer
        ex.results.forEach((res: any) => {
          let parsedAnswer: any[] = [];
          try {
            if (res.answer) {
              const raw = JSON.parse(res.answer);
              parsedAnswer = raw.tableAnswers || raw || [];
            }
          } catch (e) {
            parsedAnswer = [];
          }

          parsedKey.forEach((row: any, rowIdx: number) => {
            columns.forEach((col) => {
              const correct = String(row[col] ?? '').trim();
              const studentAns = String((parsedAnswer[rowIdx]?.[col]) ?? '').trim();
              if (!studentAns) return; // empty answer — skip
              if (studentAns.toLowerCase() === correct.toLowerCase()) return; // correct — skip
              const key = `${rowIdx}__${col}`;
              const entry = cellTally[key];
              if (!entry) return;
              entry.counts[studentAns] = (entry.counts[studentAns] || 0) + 1;
            });
          });
        });

        // produce summary: top wrong answer per cell
        const summaries: Array<{ cell: string; correct: string; wrong: string; count: number }> = [];
        Object.entries(cellTally).forEach(([cellKey, info]) => {
          const [rowIdxStr, col] = cellKey.split('__');
          const counts = info.counts || {};
          const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          if (entries.length === 0) return;
          const [wrong, cnt] = entries[0];
          const rowNum = Number(rowIdxStr) + 1;
          summaries.push({ cell: `${rowNum}:${col}`, correct: info.correct, wrong, count: cnt });
        });

        // sort by count desc and keep top 5
        map[examKey] = summaries.sort((a, b) => b.count - a.count).slice(0, 5);
      } catch (e) {
        // ignore per-exam errors
      }
    });

    return map;
  }, [results]);

  // Auto-select the first course when courseSeries becomes available
  useEffect(() => {
    if (Array.isArray(courseSeries) && courseSeries.length > 0 && String(selectedCourseId) === "all") {
      setSelectedCourseId(String(courseSeries[0].courseId));
    }
  }, [courseSeries]);

  // Auto-select the first class when classSeries becomes available
  useEffect(() => {
    if (Array.isArray(classSeries) && classSeries.length > 0 && String(selectedClassId) === "all") {
      setSelectedClassId(String(classSeries[0].classId));
    }
  }, [classSeries]);

  // Sortable header component
  const SortableHeader = ({ column, children, className }: { column: string; children: React.ReactNode; className?: string }) => {
    const isSorted = sortColumn === column;
    const isAsc = isSorted && sortDirection === "asc";
    const isDesc = isSorted && sortDirection === "desc";
    return (
      <TableHead onClick={() => handleSort(column)} className={`cursor-pointer ${className || ''}`}>
        <div className="flex items-center gap-2">
          <span>{children}</span>
          {isSorted ? (
            isAsc ? (
              <ChevronUp className="h-3 w-3 -mt-1 text-primary" />
            ) : (
              <ChevronDown className="h-3 w-3 -mt-1 text-primary" />
            )
          ) : (
            <ChevronDown className="h-3 w-3 -mt-1 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Exam Results</h2>
            <p className="text-muted-foreground">
              View and analyze your examination results
            </p>
          </div>
        </div>

        {/* Toolbar (copied/adapted from Question Bank design) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
          <div className="flex gap-2">
            
            <Button size="sm" variant="outline" onClick={() => fetchExams()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Reload
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (selectedIds.length !== 1) {
                  toast({ title: "Select one exam", description: "Please select exactly one exam to edit." });
                  return;
                }
                const ex = results.find(r => r.id === selectedIds[0]);
                if (ex) setEditingExam(ex);
              }}
            >
              <Edit2 className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (selectedIds.length === 0) return;
                handleBulkDelete();
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (selectedIds.length === 0) return;
                const rows = results.filter(r => selectedIds.includes(r.id));
                const lines = rows.map(r => {
                  const participants = Array.isArray(r.results) && r.results.length > 0 ? (() => { const s = new Set(); r.results.forEach((res: any) => { const sid = res.student_id ?? res.studentId ?? res.student ?? `${res.first_name||''}_${res.last_name||''}`; if (sid !== undefined && sid !== null) s.add(String(sid)); }); return s.size; })() : (r.participants || 0);
                  const { avgTable, avgFindings } = computeExamAverages(r, aiScores);
                  return [
                    r.name || r.examName || '',
                    getClassName(r) || r.class || r.class_id || '-',
                    getCourseName(r) || r.course || r.course_name || r.course_id || '-',
                    r.start || r.date || '',
                    participants,
                    avgTable !== null ? `${avgTable}%` : '-',
                    avgFindings !== null ? `${avgFindings}%` : '-',
                  ].join('\t');
                });
                navigator.clipboard.writeText(lines.join('\n'));
                toast({ title: "Copied", description: "Selected exams copied to clipboard." });
              }}
              disabled={selectedIds.length === 0}
            >
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (selectedIds.length === 0) return;
                // Export selected exams to excel
                const rows = results.filter(r => selectedIds.includes(r.id));
                const sheetRows = rows.map(r => {
                  const participants = Array.isArray(r.results) && r.results.length > 0 ? (() => { const s = new Set(); r.results.forEach((res: any) => { const sid = res.student_id ?? res.studentId ?? res.student ?? `${res.first_name||''}_${res.last_name||''}`; if (sid !== undefined && sid !== null) s.add(String(sid)); }); return s.size; })() : (r.participants || 0);
                  const { avgTable, avgFindings } = computeExamAverages(r, aiScores);
                  return {
                    "Exam Name": r.name || r.examName || '',
                    "Class": getClassName(r) || r.class || r.class_id || '',
                    "Course": getCourseName(r) || r.course || r.course_name || r.course_id || '',
                    "Date": r.start || r.date || '',
                    "Participants": participants,
                    "Avg Table": avgTable !== null ? `${avgTable}%` : '',
                    "Avg Findings": avgFindings !== null ? `${avgFindings}%` : '',
                  };
                });
                const ws = XLSX.utils.json_to_sheet(sheetRows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Exams");
                XLSX.writeFile(wb, "exams.xlsx");
                toast({ title: "Excel Exported", description: "Excel file downloaded." });
              }}
              disabled={selectedIds.length === 0}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (selectedIds.length === 0) return;
                // Generate a combined PDF for selected exams (simple list)
                const rows = results.filter(r => selectedIds.includes(r.id));
                const doc = new jsPDF();

                // add top logo if available
                let headerOffset = 0;
                try {
                  const topUrl = new URL(topLogo, window.location.href).href;
                  const bottomUrl = new URL(bottomLogo, window.location.href).href;
                  const [topImg] = await Promise.allSettled([loadImageToDataUrl(topUrl)]);
                  if (topImg.status === 'fulfilled') {
                    const { dataUrl, w, h } = topImg.value;
                    const dispW = 60;
                    const dispH = (h / w) * dispW;
                    const pageW = doc.internal.pageSize.getWidth();
                    const x = (pageW - dispW) / 2;
                    doc.addImage(dataUrl, 'PNG', x, 8, dispW, dispH);
                    headerOffset = dispH + 6;
                  }
                } catch (e) { /* ignore */ }

                doc.text("Exam List", 14, 16 + headerOffset);
                const body = rows.map(r => {
                  const participants = Array.isArray(r.results) && r.results.length > 0 ? (() => { const s = new Set(); r.results.forEach((res: any) => { const sid = res.student_id ?? res.studentId ?? res.student ?? `${res.first_name||''}_${res.last_name||''}`; if (sid !== undefined && sid !== null) s.add(String(sid)); }); return s.size; })() : (r.participants || 0);
                  const { avgTable, avgFindings } = computeExamAverages(r, aiScores);
                  return [
                    r.name || r.examName || '',
                    getClassName(r) || r.class || r.class_id || '-',
                    getCourseName(r) || r.course || r.course_name || r.course_id || '-',
                    r.start || r.date || '',
                    participants,
                    avgTable !== null ? `${avgTable}%` : '-',
                    avgFindings !== null ? `${avgFindings}%` : '-',
                  ];
                });
                autoTable(doc, {
                  head: [["Exam Name", "Class", "Course", "Date", "Participants", "Avg Table", "Avg Findings"]],
                  body,
                  startY: 22 + headerOffset,
                });

                // add bottom logo on all pages if available
                try {
                  const bottomUrl = new URL(bottomLogo, window.location.href).href;
                  const botImg = await loadImageToDataUrl(bottomUrl).catch(() => null);
                  if (botImg) {
                    const { dataUrl, w, h } = botImg;
                    const dispW = 60;
                    const dispH = (h / w) * dispW;
                    const pageW = doc.internal.pageSize.getWidth();
                    const x = (pageW - dispW) / 2;
                    const pageCount = doc.getNumberOfPages();
                    for (let i = 1; i <= pageCount; i++) {
                      doc.setPage(i);
                      const pageH = doc.internal.pageSize.getHeight();
                      doc.addImage(dataUrl, 'PNG', x, pageH - dispH - 8, dispW, dispH);
                    }
                  }
                } catch (e) { /* ignore */ }

                doc.save("exams.pdf");
                toast({ title: "PDF Exported", description: "PDF file downloaded." });
              }}
              disabled={selectedIds.length === 0}
            >
              <FileText className="mr-1 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Search and Filter (matched to Question Bank design) */}
        <SearchAndFilter
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          courseFilter={courseFilter || 'all'}
          setCourseFilter={(v: string) => setCourseFilter(v)}
          courses={availableCourses}
          totalQuestions={results.length}
          filteredCount={visibleResults.length}
          placeholder="Search exam results..."
          entityName="exam results"
        />

        {/* Table View */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input className="accent-neutral-400" type="checkbox" checked={paginatedResults.length>0 && paginatedResults.every(r=>selectedIds.includes(r.id))} onChange={toggleSelectAll} />
                    </TableHead>
                    <SortableHeader column="name">Exam Name</SortableHeader>
                    <SortableHeader column="class">Class</SortableHeader>
                    <SortableHeader column="course">Course</SortableHeader>
                    <SortableHeader column="date">Date</SortableHeader>
                    <SortableHeader column="participants" className="hidden md:table-cell">Participants</SortableHeader>
                    <SortableHeader column="avgTable" className="hidden lg:table-cell">Avg Table</SortableHeader>
                    <SortableHeader column="avgFindings" className="hidden lg:table-cell">Avg Findings</SortableHeader>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      <div className="space-y-4">
                        <div>Loading exam data...</div>
                        {loadingProgress > 0 && (
                          <div className="w-full max-w-md mx-auto">
                            <Progress value={loadingProgress} className="w-full" />
                            <div className="text-sm text-muted-foreground mt-2">
                              {loadingProgress}% complete
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : visibleResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      {searchTerm ? "No matching exams found" : "No exams available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedResults.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <input className="accent-neutral-400" type="checkbox" checked={selectedIds.includes(exam.id)} onChange={() => toggleSelectRow(exam.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{exam.name || exam.examName || "Untitled Exam"}</TableCell>
                      <TableCell>{getClassName(exam) || exam.class || exam.class_id || '-'}</TableCell>
                      <TableCell>{getCourseName(exam) || exam.course || exam.course_name || exam.course_id || '-'}</TableCell>
                      <TableCell>{exam.end ? `${formatDate(exam.start || exam.date)} - ${formatDate(exam.end)}` : formatDate(exam.start || exam.date)}</TableCell>
                      <TableCell className="hidden md:table-cell">{(() => {
                        try {
                          const resArr = Array.isArray(exam.results) ? exam.results : [];
                          if (resArr.length > 0) {
                            const seen = new Set<string>();
                            resArr.forEach((r: any) => {
                              const sid = r.student_id ?? r.studentId ?? r.student ?? `${r.first_name || ''}_${r.last_name || ''}`;
                              if (sid !== undefined && sid !== null) seen.add(String(sid));
                            });
                            return seen.size;
                          }
                        } catch (e) {
                          // ignore and fallback
                        }
                        return Number(exam.participants) || 0;
                      })()}</TableCell>
                      {/* Avg Table Score */}
                      <TableCell className="hidden md:table-cell">{(() => {
                        try {
                          const { avgTable } = computeExamAverages(exam, aiScores);
                          const tableMax = getTableMaxPoints(exam);
                          const pts = pointsFromPercent(avgTable, tableMax);
                          if (avgTable !== null) return `${avgTable}%${pts !== null && tableMax !== null ? ` (${pts}/${tableMax} pts)` : ''}`;
                          return '-';
                        } catch (e) {
                          return '-';
                        }
                      })()}</TableCell>
                      {/* Avg Findings Score */}
                      <TableCell className="hidden lg:table-cell">{(() => {
                        try {
                          const { avgFindings } = computeExamAverages(exam, aiScores);
                          const findingsMax = getFindingsMaxPoints(exam);
                          const pts = pointsFromPercent(avgFindings, findingsMax);
                          if (avgFindings !== null) return `${avgFindings}%${pts !== null && findingsMax !== null ? ` (${pts}/${findingsMax} pts)` : ''}`;
                          return '-';
                        } catch (e) {
                          return '-';
                        }
                      })()}</TableCell>
                      {/* token removed from table view; still available in View Details */}
                      {/* token removed from table view; still available in View Details */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" title="View Details" onClick={() => handleViewDetails(exam.id)}>
                            <FileSearch className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="View Common Errors" onClick={() => setViewErrorsExam(exam)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditingExam(exam)}>
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setSelectedExam(exam)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>

            {/* Pagination controls inside table card */}
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {totalResults === 0 ? 0 : ( (currentPage - 1) * itemsPerPage + 1 )} - {Math.min(currentPage * itemsPerPage, totalResults)} of {totalResults} results
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="default" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</Button>
                <Button size="sm" variant="default" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                <div className="px-2 text-sm">Page {currentPage} / {totalPages}</div>
                <Button size="sm" variant="default" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                <Button size="sm" variant="default" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Exam Dialog */}
        {/* Progress charts */}
        {(classSeries.length > 0 || courseSeries.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Course progress charts */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg px-1"></h3>
              
              {courseSeries
                .filter(series => selectedCourseId === "all" || String(series.courseId) === selectedCourseId)
                .map((series) => (
                <Card key={series.courseId}>
                  <CardHeader>
                    <CardTitle className="text-xs">Course Progress</CardTitle>
                    <CardTitle>{series.courseName} — Average Progress</CardTitle>
                    <CardDescription className="text-xs">Table vs Findings averages across exams</CardDescription>
                    <div className="mb-4">
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseSeries.map((series) => (
                      <SelectItem 
                        key={series.courseId} 
                        value={String(series.courseId)}
                      >
                        {series.courseName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        table: { label: "Avg Table", color: "#3b82f6" },
                        findings: { label: "Avg Findings", color: "#06b6d4" },
                      }}
                    >
                      <LineChart data={series.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={[0, 100]} />
                        <RechartsTooltip content={<ChartTooltipContent />} />
                        <RechartsLegend />
                        <Line type="monotone" dataKey="avgTable" stroke="var(--color-table)" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="avgFindings" stroke="var(--color-findings)" strokeWidth={2} dot />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Class progress charts */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg px-1"></h3>
              
              {classSeries
                .filter(series => selectedClassId === "all" || String(series.classId) === selectedClassId)
                .map((series) => (
                <Card key={series.classId}>
                  <CardHeader>
                    <CardTitle className="text-xs">Class Progress</CardTitle>
                    <CardTitle>{series.className} — Average Progress</CardTitle>
                    <CardDescription >Table vs Findings averages across exams</CardDescription>
                    <div className="mb-4">
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classSeries.map((series) => (
                      <SelectItem 
                        key={series.classId} 
                        value={String(series.classId)}
                      >
                        {series.className}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        table: { label: "Avg Table", color: "#3b82f6" },
                        findings: { label: "Avg Findings", color: "#06b6d4" },
                      }}
                    >
                      <LineChart data={series.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={[0, 100]} />
                        <RechartsTooltip content={<ChartTooltipContent />} />
                        <RechartsLegend />
                        <Line type="monotone" dataKey="avgTable" stroke="var(--color-table)" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="avgFindings" stroke="var(--color-findings)" strokeWidth={2} dot />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        {editingExam && (
          <Dialog open={!!editingExam} onOpenChange={(open) => !open && setEditingExam(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Exam</DialogTitle>
                <DialogDescription>
                  Make changes to the exam information below.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateExam}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="exam-name" className="text-right">
                      Name
                    </Label>
                    <Input
                      id="exam-name"
                      value={editingExam.name || editingExam.examName || ""}
                      onChange={(e) => setEditingExam({ ...editingExam, name: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="exam-duration" className="text-right">
                      Duration (min)
                    </Label>
                    <Input
                      id="exam-duration"
                      type="number"
                      value={editingExam.duration || ""}
                      onChange={(e) => setEditingExam({ ...editingExam, duration: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="exam-status" className="text-right">
                      Status
                    </Label>
                    <select
                      id="exam-status"
                      value={editingExam.status || "active"}
                      onChange={(e) => setEditingExam({ ...editingExam, status: e.target.value })}
                      className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit">Save Changes</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Delete Confirmation Dialog */}
        {selectedExam && (
          <AlertDialog open={!!selectedExam} onOpenChange={(open) => !open && setSelectedExam(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the exam "{selectedExam.name || selectedExam.examName}" and all associated results.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    handleDeleteExam(selectedExam.id);
                    setSelectedExam(null);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* View Common Errors Dialog */}
        {viewErrorsExam && (
          <Dialog open={!!viewErrorsExam} onOpenChange={(open) => !open && setViewErrorsExam(null)}>
            <DialogContent className="max-w-4xl w-full">
              <DialogHeader>
                <DialogTitle>Common Errors — {viewErrorsExam.name || viewErrorsExam.examName}</DialogTitle>
                <DialogDescription>
                  Review the exam question, the correct table answers and the most common wrong answers students submitted.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[65vh] overflow-auto space-y-4 py-2">
                <div>
                  <h4 className="font-medium">Question</h4>
                  <div className="text-sm text-muted-foreground">
                    {viewErrorsExam.question_title || viewErrorsExam.question || viewErrorsExam.questionText || '-'}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium">Correct Answers (table)</h4>
                  <div className="overflow-auto">
                    {(() => {
                      try {
                        if (!viewErrorsExam.answer_key) return <div className="text-xs text-muted-foreground">No answer key available</div>;
                        const rawKey = JSON.parse(viewErrorsExam.answer_key);
                        const parsed = rawKey.specimens && Array.isArray(rawKey.specimens) ? rawKey.specimens : (Array.isArray(rawKey) ? rawKey : null);
                        if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return <div className="text-xs text-muted-foreground">No table answer key found</div>;
                        const cols = Object.keys(parsed[0]).filter(k => !['points','pointType','id','rowId'].includes(k));
                        // Compute per-row correct/wrong counts across student results
                        const rowStats = parsed.map(() => ({ correct: 0, wrong: 0 }));
                        try {
                          if (Array.isArray(viewErrorsExam.results)) {
                            viewErrorsExam.results.forEach((res: any) => {
                              try {
                                const raw = typeof res.answer === 'string' ? JSON.parse(res.answer || '[]') : (res.answer || []);
                                const parsedAnswer = raw.tableAnswers || raw || [];
                                parsed.forEach((keyRow: any, rowIdx: number) => {
                                  const colsList = cols;
                                  let allCorrectForRow = true;
                                  if (!Array.isArray(parsedAnswer) || parsedAnswer.length <= rowIdx) {
                                    allCorrectForRow = false;
                                  } else {
                                    colsList.forEach((col) => {
                                      const studentAns = String(parsedAnswer[rowIdx]?.[col] ?? '').trim().toLowerCase();
                                      const correctAns = String(keyRow[col] ?? '').trim().toLowerCase();
                                      if (studentAns !== correctAns) allCorrectForRow = false;
                                    });
                                  }
                                  if (allCorrectForRow) rowStats[rowIdx].correct += 1;
                                  else rowStats[rowIdx].wrong += 1;
                                });
                              } catch (e) {
                                // ignore parse errors for this student's answer
                              }
                            });
                          }
                        } catch (e) {
                          // ignore
                        }

                        return (
                          <table className="w-full text-sm table-auto border">
                            <thead>
                              <tr className="bg-muted">
                                <th className="p-2 border">#</th>
                                {cols.map(c => <th key={c} className="p-2 border text-left">{c}</th>)}
                                <th className="p-2 border text-center">Correct</th>
                                <th className="p-2 border text-center">Wrong</th>
                              </tr>
                            </thead>
                            <tbody>
                                  {parsed.map((row: any, idx: number) => (
                                <tr key={idx} className="border-t">
                                  <td className="p-2 border align-top">{idx + 1}</td>
                                  {cols.map(c => <td key={c} className="p-2 border align-top break-words">{String(row[c] ?? '')}</td>)}
                                  <td className="p-2 border text-center align-top font-medium">{rowStats[idx]?.correct ?? 0}</td>
                                  <td className="p-2 border text-center align-top text-red-600">{rowStats[idx]?.wrong ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      } catch (e) {
                        return <div className="text-xs text-muted-foreground">Unable to parse answer key</div>;
                      }
                    })()}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium">Most Common Errors</h4>
                  <div className="text-sm">
                    {(() => {
                      try {
                        const summary = commonErrorsMap[String(viewErrorsExam.id)] || [];
                        if (!summary || summary.length === 0) return <div className="text-xs text-muted-foreground">No common errors found</div>;
                        return (
                          <div className="space-y-2">
                            {summary.map((s, i) => (
                              <div key={i} className="grid grid-cols-12 gap-3 items-start">
                                <div className="col-span-2 text-xs font-medium break-words">{s.cell}</div>
                                <div className="col-span-10 text-sm break-words">
                                  Correct: <span className="font-semibold break-words">{s.correct}</span> — Common: <span className="font-semibold break-words">{s.wrong}</span> <span className="text-xs text-muted-foreground">({s.count})</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      } catch (e) {
                        return <div className="text-xs text-muted-foreground">Unable to load common errors</div>;
                      }
                    })()}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.length} Exam{selectedIds.length !== 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. You are about to permanently delete {selectedIds.length} exam{selectedIds.length !== 1 ? 's' : ''} and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDeleteConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default ExamResults;
