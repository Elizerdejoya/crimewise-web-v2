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

const Results = () => {
  const [results, setResults] = useState<any[]>([]);
    const [aiQueueMap, setAiQueueMap] = useState<Record<string, any>>({});
    const [requeueLoading, setRequeueLoading] = useState<Record<string, boolean>>({});
    const [isReloading, setIsReloading] = useState<boolean>(false);
  const [filteredResults, setFilteredResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [selectedAiGrade, setSelectedAiGrade] = useState<any>(null);
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

  // Helper function to safely call trim on a value
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return "";
    return typeof value === 'string' ? value : String(value);
  };

  // Format date for display (e.g., Nov 25, 2025)
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
  // Weights as percentages: Accuracy 40%, Clarity 20%, Completeness 30%, Objectivity 10%
  const DEFAULT_RUBRIC_WEIGHTS: Record<string, number> = {
    accuracy: 40,
    clarity: 20,
    completeness: 30,
    objectivity: 10,
  };

  // Search function
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);

    if (term.trim() === "") {
      setFilteredResults(results);
    } else {
      const filtered = results.filter(result => {
        const examName = (result.examName || result.exam_id || "").toString().toLowerCase();
        const courseName = resolveCourseName(result.course || result.course_id).toString().toLowerCase();
        const formattedDate = formatDate(result.date).toString().toLowerCase();
        const score = (result.score || "").toString().toLowerCase();

        return examName.includes(term) || 
               courseName.includes(term) || 
               formattedDate.includes(term) ||
               score.includes(term);
      });
      setFilteredResults(filtered);
    }
  };

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
        const keys = ['accuracy', 'completeness', 'clarity', 'objectivity'];
        // Read raw component values
        const rawVals = keys.map(k => {
          const v = aiGradeData?.[k];
          const n = v === undefined || v === null ? null : (Number.isNaN(Number(v)) ? null : Number(v));
          return n;
        });
        // Determine if any component has a positive real value (>0)
        const anyPositive = rawVals.some(v => v !== null && v > 0);
        // Prepare display values
        const displayVals: Record<string, number | null> = {
          accuracy: null,
          completeness: null,
          clarity: null,
          objectivity: null,
        };

        if (anyPositive) {
          // Use actual positive component values; for zero/null components derive from overall using formula
          const knownMap: Record<string, number> = {};
          keys.forEach((k, i) => {
            const v = rawVals[i];
            if (v !== null && v > 0) knownMap[k] = Math.round(v);
          });
          // Fill known values
          Object.entries(knownMap).forEach(([k, v]) => { displayVals[k] = Math.max(0, Math.min(100, v)); });
          // For missing keys, derive from overall using weights
          keys.forEach((k) => {
            if (!(k in knownMap)) {
              const weight = (DEFAULT_RUBRIC_WEIGHTS[k] || 0) / 100;
              const derived = Math.round(Math.round(overall) * weight);
              displayVals[k] = Math.max(0, Math.min(100, derived));
            }
          });
        } else if (!Number.isNaN(overall)) {
          // No positive components present: compute all by formula S × (W / 100)
          keys.forEach((k) => {
            const weight = (DEFAULT_RUBRIC_WEIGHTS[k] || 0) / 100;
            const computed = Math.round(Math.round(overall) * weight);
            displayVals[k] = Math.max(0, Math.min(100, computed));
          });
        }

        const fmtComp = (val: number | null) => {
          return val === null ? '-' : `${Math.round(val)}%`;
        };

        examContent += `
          <div style="margin: 20px 0; padding: 12px; background: #f5f5f5; border-radius: 4px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px;">AI Rubric Breakdown</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px;">
              <div><strong>Accuracy:</strong> ${fmtComp(displayVals.accuracy)}</div>
              <div><strong>Completeness:</strong> ${fmtComp(displayVals.completeness)}</div>
              <div><strong>Clarity:</strong> ${fmtComp(displayVals.clarity)}</div>
              <div><strong>Objectivity:</strong> ${fmtComp(displayVals.objectivity)}</div>
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
    if (result.answer && result.details) {
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
        
        if (detailsObj.explanation) {
          expectedExplanation = detailsObj.explanation;
        }

        if (explanation || expectedExplanation) {
          examContent += `
            <div class="explanation-section" style="margin: 25px 0;">
              <h3 style="font-size: 14px; margin: 0 0 8px 0;">Your Findings</h3>
              <div class="explanation-text" style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 13px;">${explanation || '-'}</div>
              ${expectedExplanation ? `
                <h3 style="font-size: 14px; margin: 12px 0 8px 0;">Expected Findings</h3>
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

  // Fetch ai_queue status rows for a list of results so we can show requeue UI
  const fetchAiQueueForResults = async (resultsArr: any[]) => {
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const promises = resultsArr.map(async (r) => {
      const sid = r.student_id || r.studentId;
      const eid = r.exam_id || r.examId;
      if (!sid || !eid) return null;
      const key = `${sid}_${eid}`;
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai-grader/queue/${sid}/${eid}`, { headers: getAuthHeaders() });
        if (!res.ok) return [key, null] as [string, any];
        const data = await res.json();
        return [key, data] as [string, any];
      } catch (e) {
        return [key, null] as [string, any];
      }
    });

    try {
      const settled = await Promise.all(promises);
      const map: Record<string, any> = {};
      settled.forEach((item) => {
        if (!item) return;
        const [k, v] = item as [string, any];
        if (k) map[k] = v;
      });
      setAiQueueMap(prev => ({ ...prev, ...map }));
    } catch (e) {
      // ignore
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleRequeueAiGrade = async (studentId: number | string, examId: number | string) => {
    if (!studentId || !examId) return;
    const key = `${studentId}_${examId}`;
    setRequeueLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai-grader/requeue`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ studentId, examId }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => 'Requeue failed');
        toast({ title: 'Requeue failed', description: txt, variant: 'destructive' });
        return;
      }
      toast({ title: 'Requeue requested', description: 'AI grade will be retried shortly.', variant: 'default' });
      // refresh queue status for this item
      try {
        const qRes = await fetch(`${API_BASE_URL}/api/ai-grader/queue/${studentId}/${examId}`, { headers: getAuthHeaders() });
        if (qRes.ok) {
          const qData = await qRes.json();
          setAiQueueMap(prev => ({ ...prev, [key]: qData }));
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('Requeue error', e);
      toast({ title: 'Error', description: 'Failed to request requeue.', variant: 'destructive' });
    } finally {
      setRequeueLoading(prev => ({ ...prev, [key]: false }));
    }
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


  // Process results for display with sorting
  const processedResults = [...filteredResults].map(result => {
    // Parse scoring details from the details JSON field
    let raw_score = result.raw_score;
    let raw_total = result.raw_total;
    let totalPoints = 0;
    let earnedPoints = 0;

    // Try to extract score data from details field
    if (result.details) {
      try {
        const detailsObj = typeof result.details === 'string' 
          ? JSON.parse(result.details) 
          : result.details;
        
        // Extract raw score and total from details (row-level scoring, NOT points)
        if (detailsObj.raw_score !== undefined && detailsObj.raw_total !== undefined) {
          raw_score = detailsObj.raw_score;
          raw_total = detailsObj.raw_total;
        }
        
        // Extract points-based scoring (totalScore and totalPossiblePoints)
        // These include row points but NOT explanation points
        if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
          // totalScore and totalPossiblePoints already include all points
          totalPoints = detailsObj.totalPossiblePoints;
          earnedPoints = detailsObj.totalScore;
        }
        
        // If totalPossiblePoints is still 0 but we have rowDetails, recalculate it
        // This handles old exam results that might not have totalPossiblePoints stored correctly
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

    // Calculate percentage score using points system if available, otherwise raw score
    let score = result.score;
    
    // If we have totalPoints (including row points), use that for percentage
    if (totalPoints > 0) {
      score = Math.round((earnedPoints / totalPoints) * 100);
    }
    // Otherwise, if we extracted raw_score and raw_total, calculate the percentage
    else if (raw_score !== undefined && raw_total !== undefined && raw_total > 0) {
      score = Math.round((raw_score / raw_total) * 100);
    }

    const getCourseName = (r: any) => {
      // First check if course name came directly from backend (course_name field)
      if (r.course_name) return r.course_name;
      if (r.course_code) return r.course_code;
      
      // Otherwise look it up from courses array
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
  }).sort((a, b) => {
    const { key = 'submitted_at', direction = 'desc' } = sortConfig || {};
    let aValue: any;
    let bValue: any;

    switch (key) {
      case 'submitted_at': {
        const aTime = a.submitted_at || a.date || null;
        const bTime = b.submitted_at || b.date || null;
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
        aValue = new Date(a.date || 0).getTime();
        bValue = new Date(b.date || 0).getTime();
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

    // Primary values equal — tie-break by submitted_at (most recent first)
    const aTie = a.submitted_at ? new Date(a.submitted_at).getTime() : (a.date ? new Date(a.date).getTime() : 0);
    const bTie = b.submitted_at ? new Date(b.submitted_at).getTime() : (b.date ? new Date(b.date).getTime() : 0);
    if (aTie !== bTie) return aTie < bTie ? 1 : -1;

    // Final tie-break by numeric id (higher = newer)
    const aId = Number(a.id ?? a.result_id ?? a.exam_id ?? 0);
    const bId = Number(b.id ?? b.result_id ?? b.exam_id ?? 0);
    if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) return aId < bId ? 1 : -1;

    return 0;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Results</h2>
          <p className="text-muted-foreground">
            View and analyze your exam performance
          </p>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center flex-1 sm:flex-none">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by exam name, course, or date..."
              value={searchTerm}
              onChange={handleSearch}
              className="w-full sm:max-w-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleReload} disabled={isReloading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isReloading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
        </div>

          <Card>
            <CardContent className="p-0">
              <div className="hidden sm:block overflow-x-auto">
                <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('examName')}
                      className="h-auto p-0 font-semibold hover:bg-transparent"
                    >
                      <span className="flex items-center justify-center gap-1">Exam {getSortIcon('examName')}</span>
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('course')}
                      className="h-auto p-0 font-semibold hover:bg-transparent"
                    >
                      <span className="flex items-center justify-center gap-1">Course {getSortIcon('course')}</span>
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('date')}
                      className="h-auto p-0 font-semibold hover:bg-transparent"
                    >
                      <span className="flex items-center justify-center gap-1">Date {getSortIcon('date')}</span>
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('score')}
                      className="h-auto p-0 font-semibold hover:bg-transparent"
                    >
                      <span className="flex items-center justify-center gap-1">Score {getSortIcon('score')}</span>
                    </Button>
                  </TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedResults.length > 0 ? (
                    processedResults.map((result) => {
                      const findingsMaxPts = getFindingsMaxPoints(result);
                      return (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium text-center">{result.examName}</TableCell>
                        <TableCell className="text-center">{result.course}</TableCell>
                        <TableCell className="text-center">{formatDate(result.date)}</TableCell>
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
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-end">
                            {result.answer && result.details && (
                              <Dialog>
                                  <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    ref={(el) => { triggerRefs.current[`${result.student_id || result.studentId}_${result.exam_id || result.examId}`] = el as HTMLButtonElement; }}
                                      onClick={async () => { await fetchAiGradeForResult(result.student_id || result.studentId, result.exam_id || result.examId); await fetchAiQueueForResults([result]); setSelectedResult(result); }}
                                  >
                                    <Eye className="h-4 w-4 mr-2" /> View Details
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
                                        <h4 className="font-semibold mb-2">AI Rubric Breakdown</h4>
                                        {(() => {
                                          // Display rubric components. If the AI record contains per-component
                                          // values (even 0), show them. If all components are missing/zero and
                                          // an overall score exists, derive an approximate per-rubric value by
                                          // evenly distributing the overall percent across the rubrics.
                                          const overall = Number(selectedAiGrade.score ?? selectedAiGrade.overall ?? NaN);
                                          const keys = ['accuracy','completeness','clarity','objectivity'];
                                          // Read raw component values (may be undefined/null/0)
                                          const rawVals = keys.map(k => {
                                            const v = selectedAiGrade?.[k];
                                            const n = v === undefined || v === null ? null : (Number.isNaN(Number(v)) ? null : Number(v));
                                            return n;
                                          });

                                          // Determine if any component has a positive real value (>0)
                                          const anyPositive = rawVals.some(v => v !== null && v > 0);

                                          // Prepare display values and mark which are derived
                                          const displayVals: Record<string, { val: number | null; derived: boolean }> = {
                                            accuracy: { val: null, derived: false },
                                            completeness: { val: null, derived: false },
                                            clarity: { val: null, derived: false },
                                            objectivity: { val: null, derived: false },
                                          };

                                          if (anyPositive) {
                                            // Use actual positive component values; for zero/null components derive from overall using formula
                                            const knownMap: Record<string, number> = {};
                                            keys.forEach((k, i) => {
                                              const v = rawVals[i];
                                              if (v !== null && v > 0) knownMap[k] = Math.round(v);
                                            });
                                            // Fill known values, derive missing by formula
                                            Object.entries(knownMap).forEach(([k, v]) => { displayVals[k].val = Math.max(0, Math.min(100, v)); displayVals[k].derived = false; });
                                            // For missing keys, derive from overall using weights
                                            keys.forEach((k) => {
                                              if (!(k in knownMap)) {
                                                const weight = (DEFAULT_RUBRIC_WEIGHTS[k] || 0) / 100;
                                                const derived = Math.round(Math.round(overall) * weight);
                                                displayVals[k].val = Math.max(0, Math.min(100, derived));
                                                displayVals[k].derived = true;
                                              }
                                            });
                                          } else if (!Number.isNaN(overall)) {
                                            // No positive components present: compute all by formula S × (W / 100)
                                            keys.forEach((k) => {
                                              const weight = (DEFAULT_RUBRIC_WEIGHTS[k] || 0) / 100;
                                              const computed = Math.round(Math.round(overall) * weight);
                                              displayVals[k].val = Math.max(0, Math.min(100, computed));
                                              displayVals[k].derived = true;
                                            });
                                          }

                                          const showPercent = (v: number | null, d: boolean) => v === null ? '-' : `${Math.round(v)}%`;

                                          return (
                                            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                                              <div><strong>Accuracy:</strong> {showPercent(displayVals.accuracy.val, displayVals.accuracy.derived)}</div>
                                              <div><strong>Completeness:</strong> {showPercent(displayVals.completeness.val, displayVals.completeness.derived)}</div>
                                              <div><strong>Clarity:</strong> {showPercent(displayVals.clarity.val, displayVals.clarity.derived)}</div>
                                              <div><strong>Objectivity:</strong> {showPercent(displayVals.objectivity.val, displayVals.objectivity.derived)}</div>
                                              <div className="col-span-2 mt-2"><strong>Overall Score:</strong> {!Number.isNaN(overall) ? `${Math.round(overall)}%` : '-'}</div>
                                            </div>
                                          );
                                        })()}
                                        <div className="mt-2">
                                          <strong>AI Explanation:</strong>
                                          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{selectedAiGrade.feedback}</div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="p-4 border rounded-md bg-yellow-50 text-sm">
                                        <strong>AI grading pending.</strong>
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
                                      let parsedAnswer = [];
                                      let rowDetails = [];
                                      let columns = [];

                                      try {
                                        // Parse answer
                                        if (result.answer) {
                                          const rawAnswer = typeof result.answer === 'string' 
                                            ? JSON.parse(result.answer)
                                            : result.answer;
                                          parsedAnswer = rawAnswer.tableAnswers || [];
                                          console.log("Parsed answer from details:", parsedAnswer);
                                        }

                                        // Extract row details and column information from the details field
                                        if (result.details) {
                                          const detailsObj = typeof result.details === 'string'
                                            ? JSON.parse(result.details)
                                            : result.details;
                                          
                                          if (detailsObj.rowDetails && Array.isArray(detailsObj.rowDetails)) {
                                            rowDetails = detailsObj.rowDetails;
                                            console.log("Extracted rowDetails from details field:", rowDetails);
                                            
                                            // Get columns from the first row's columnScores
                                            if (rowDetails.length > 0 && rowDetails[0].columnScores) {
                                              columns = Object.keys(rowDetails[0].columnScores);
                                              console.log("Extracted columns:", columns);
                                            }
                                          }
                                        }
                                      } catch (e) {
                                        console.error("Error parsing results:", e);
                                        parsedAnswer = [];
                                        rowDetails = [];
                                        columns = [];
                                      }

                                      return columns.length > 0 ? (
                                        <div className="space-y-4">
                                          <h3 className="text-lg font-medium mt-4">Answer Table</h3>
                                          <div className="overflow-x-auto border rounded-lg">
                                            <Table className="min-w-full">
                                              <TableHeader>
                                                <TableRow>
                                                  <TableHead className="min-w-[50px] sticky left-0 bg-background z-10">#</TableHead>
                                                  {columns.map((col, idx) => (
                                                    <TableHead key={idx} className="min-w-[120px] whitespace-nowrap">{col}</TableHead>
                                                  ))}
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Result/Points</TableHead>
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Points Value</TableHead>
                                                  <TableHead className="min-w-[100px] whitespace-nowrap">Point Type</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {rowDetails.map((row: any, rowIdx: number) => {
                                                  // Use data from rowDetails
                                                  const rowCorrectCount = (row.columnScores && Object.values(row.columnScores as any).filter((col: any) => col.isExactMatch).length) || 0;
                                                  const rowTotalCount = columns.length;
                                                  const allCorrectForRow = row.correct || false;
                                                  const rowPoints = row.possiblePoints || 1;

                                                  return (
                                                    <TableRow key={rowIdx}>
                                                      <TableCell className="sticky left-0 bg-background z-10 font-medium">{rowIdx + 1}</TableCell>
                                                      {columns.map((col, colIdx) => {
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
                                                                  {isCorrect ?
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    :
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                  }
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
                                                          <span className={`text-sm font-semibold ${allCorrectForRow ? "text-green-600" : "text-red-600"}`}>
                                                            {rowCorrectCount}/{rowTotalCount}
                                                          </span>
                                                          <span className="text-xs text-muted-foreground">
                                                            {allCorrectForRow ? `+${rowPoints} pts` : `0/${rowPoints} pts`}
                                                          </span>
                                                        </div>
                                                      </TableCell>
                                                      <TableCell className="min-w-[100px] text-center">
                                                        <span className="text-sm font-medium">{row.pointsValue || 1}</span>
                                                      </TableCell>
                                                      <TableCell className="min-w-[100px] text-center">
                                                        <span className="text-sm">{row.pointType === "each" ? "for each correct" : "if both correct"}</span>
                                                      </TableCell>
                                                    </TableRow>
                                                  );
                                                })}
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
                                      ) : (
                                        <p className="text-center text-muted-foreground">No detailed answer data available.</p>
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
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => { await handlePrintExam(result); }}
                            >
                              <FileText className="h-4 w-4 mr-2" /> Print
                            </Button>
                          </div>
                        </TableCell>
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
            </div>

            {/* Mobile list view */}
            <div className="block sm:hidden space-y-3 p-3">
              {processedResults.length > 0 ? (
                processedResults.map((result) => {
                  const key = `${result.student_id || result.studentId}_${result.exam_id || result.examId}`;
                  return (
                    <div key={result.id} className="bg-white border rounded-lg p-3 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{result.examName}</div>
                              <div className="text-xs text-muted-foreground truncate">{result.course} • {formatDate(result.date)}</div>
                              <div className="text-xs mt-1 text-gray-700">
                                <span className="font-medium">Table score:</span>{' '}
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
                        </div>
                        
                      </div>

                      <div className="mt-3 flex gap-2">
                        {result.answer && result.answer_key && (
                          <Button size="sm" variant="outline" className="flex-1" onClick={async () => { await fetchAiGradeForResult(result.student_id || result.studentId, result.exam_id || result.examId); const btn = triggerRefs.current[key]; if (btn) btn.click(); }}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="flex-1" onClick={async () => { await handlePrintExam(result); }}>
                          <FileText className="h-4 w-4 mr-2" /> Print
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">{searchTerm ? "No results match your search." : "No results found."}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Results;
