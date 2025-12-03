import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Book,
  Users,
  Layers,
  FileText,
  UserCheck,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { getCurrentUser, authenticatedFetch } from "@/lib/auth";

const statsCards = [
  { title: "Batches", key: "batches", description: "Total batches", icon: Layers, color: "bg-blue-100 text-blue-700" },
  { title: "Classes", key: "classes", description: "Active classes", icon: BookOpen, color: "bg-purple-100 text-purple-700" },
  { title: "Courses", key: "courses", description: "Available courses", icon: Book, color: "bg-green-100 text-green-700" },
  { title: "Instructors", key: "instructors", description: "Teaching staff", icon: UserCheck, color: "bg-amber-100 text-amber-700" },
  { title: "Students", key: "students", description: "Enrolled students", icon: Users, color: "bg-pink-100 text-pink-700" },
  { title: "Questions", key: "questions", description: "In question bank", icon: FileText, color: "bg-indigo-100 text-indigo-700" },
  { title: "Results", key: "results", description: "Exam results", icon: CalendarClock, color: "bg-rose-100 text-rose-700" },
  { title: "Users", key: "users", description: "System users", icon: Users, color: "bg-teal-100 text-teal-700" },
];

const AdminDashboard = () => {
  const [counts, setCounts] = useState<any>({});
  const [recentExams, setRecentExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const currentUser = getCurrentUser();

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

  useEffect(() => {
    // Fetch overview counts
    authenticatedFetch(`${API_BASE_URL}/api/admin/overview-counts`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setCounts(data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch overview counts:", err);
        // Don't show error toast as authenticatedFetch handles auth errors
        if (!err.message.includes("Authentication failed") && !err.message.includes("Token expired")) {
          toast({
            title: "Error",
            description: "Failed to fetch dashboard data.",
            variant: "destructive",
          });
        }
      });

    // Fetch recent exams
    authenticatedFetch(`${API_BASE_URL}/api/admin/recent-exams?limit=10`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          // Filter to show only exams from last 2 months
          const twoMonthsAgo = new Date();
          twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
          const filtered = data.filter((exam: any) => {
            const examDate = new Date(exam.start || exam.date || "");
            return examDate >= twoMonthsAgo;
          });
          setRecentExams(filtered);
          // Enrich recent exams with table/findings averages when possible
          try {
            enrichRecentExams(filtered);
          } catch (e) {
            // ignore enrichment errors
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch recent exams:", err);
        // Don't show error toast for recent exams as it's not critical
        // and authenticatedFetch handles auth errors
      })
      .finally(() => setLoading(false));
  }, []);

  // Helper: compute per-student table percent for an exam (simplified copy from instructor page)
  const computeTablePercentForRes = (res: any, ex: any) => {
    try {
      const rawScoreRaw = res.raw_score ?? res.rawScore ?? res.raw ?? null;
      const rawTotalRaw = res.raw_total ?? res.rawTotal ?? res.raw_total_items ?? null;
      const rawScoreNum = rawScoreRaw !== null ? Number(String(rawScoreRaw).replace('%','').trim()) : null;
      const rawTotalNum = rawTotalRaw !== null ? Number(String(rawTotalRaw).replace('%','').trim()) : null;
      if (rawScoreNum !== null && !Number.isNaN(rawScoreNum) && rawTotalNum !== null && !Number.isNaN(rawTotalNum) && rawTotalNum > 0) {
        const n = Math.round((rawScoreNum / rawTotalNum) * 100);
        return Number.isFinite(n) ? n : null;
      }

      // Try common precomputed percent or table-specific keys
      const tableCandidates = ['table_score', 'table_percent', 'table_percentage', 'tableScore', 'tablePercent', 'tablePercentage', 'percentage', 'percent'];
      for (const k of tableCandidates) {
        if (res[k] !== undefined && res[k] !== null) {
          const raw = String(res[k]).replace('%','').trim();
          const n = Number(raw);
          if (!Number.isNaN(n)) {
            if (n > 0 && n <= 1) return Math.round(n * 100);
            return Math.round(n);
          }
        }
      }

      // Try raw_response shapes
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

      if (res.score !== undefined && res.score !== null) {
        const scoreRaw = String(res.score).trim();
        if (scoreRaw.endsWith('%')) {
          const n = Number(scoreRaw.replace('%',''));
          if (!Number.isNaN(n)) return Math.round(n);
        }
        if (scoreRaw.includes('/')) {
          const parts = scoreRaw.split('/').map(p => Number(p.trim()));
          const num = parts[0];
          const den = parts[1] && !Number.isNaN(parts[1]) ? parts[1] : (ex.totalItemScore ?? ex.points ?? 100);
          const denNum = Number(den);
          if (!Number.isNaN(num) && !Number.isNaN(denNum) && denNum > 0) return Math.round((num / denNum) * 100);
        }
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

  // Helper: find findings/AI percent from result (simplified)
  const getFindingsPercent = (res: any) => {
    try {
      const candidates = ['findings_score', 'findingsPercent', 'findings_percent', 'ai_score', 'ai_grade', 'ai_overall', 'overall', 'findings', 'ai', 'findingsPercentage', 'findings_percentage', 'score_percent', 'scorePercentage'];
      for (const k of candidates) {
        if (res[k] !== undefined && res[k] !== null) {
          const str = typeof res[k] === 'string' ? res[k].replace('%', '').trim() : res[k];
          const n = Number(str);
          if (!Number.isNaN(n)) return Math.round(n);
        }
      }
      if (res.ai && typeof res.ai === 'object') {
        const overall = Number(res.ai.score ?? res.ai.overall ?? NaN);
        if (!Number.isNaN(overall)) return Math.round(overall);
      }
    } catch (e) { }
    return null;
  };

  // Compute exam-level averages for table and findings
  const computeExamAverages = (ex: any, aiMap?: Record<string, number | null>) => {
    if (!ex || !Array.isArray(ex.results) || ex.results.length === 0) return { avgTable: null, avgFindings: null, combinedAvg: null };
    const tableVals: number[] = [];
    const findingsVals: number[] = [];
    ex.results.forEach((r: any) => {
      const t = computeTablePercentForRes(r, ex);
      const key = `${r.student_id ?? r.studentId ?? r.student}_${ex.id ?? ex.exam_id ?? ex.id}`;
      const aiFromMap = aiMap && aiMap[key] !== undefined ? aiMap[key] : undefined;
      const f = aiFromMap !== undefined ? aiFromMap : getFindingsPercent(r);
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

  // Fetch AI grades for results and return a map keyed by `${studentId}_${examId}`
  const fetchAiGradesForResults = async (resultsArr: any[], examId: any) : Promise<Record<string, number | null>> => {
    const out: Record<string, number | null> = {};
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return out;
    const promises = resultsArr.map(async (r) => {
      const sid = r.student_id ?? r.studentId ?? r.student;
      const eid = examId ?? (r.exam_id ?? r.examId ?? r.exam_id);
      if (!sid || !eid) return null;
      const key = `${sid}_${eid}`;
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/api/ai-grader/result/${sid}/${eid}`, { cache: 'no-store' });
        if (!res.ok) { out[key] = null; return null; }
        const data = await res.json();
        const score = data && data.score !== undefined ? Number(data.score) : null;
        out[key] = (score === null || Number.isNaN(score)) ? null : Math.round(score);
      } catch (e) {
        out[key] = null;
      }
      return null;
    });
    try { await Promise.all(promises); } catch (e) { /* ignore */ }
    return out;
  };

  // Enrich recent exams by fetching detailed results and computing averages
  const enrichRecentExams = async (exams: any[]) => {
    if (!Array.isArray(exams) || exams.length === 0) return;
    const enriched: any[] = [];
    for (const ex of exams) {
      try {
        let resultsData: any[] = Array.isArray(ex.results) ? ex.results : [];
        if ((!resultsData || resultsData.length === 0) && Number(ex.participants) > 0) {
          const res = await authenticatedFetch(`${API_BASE_URL}/api/exams/results/${ex.id}`, { cache: 'no-store' });
          if (res.ok) {
            const details = await res.json();
            if (Array.isArray(details)) resultsData = details;
            else if (details && Array.isArray(details.results)) resultsData = details.results;
            else if (details && Array.isArray(details.data)) resultsData = details.data;
            else if (details && details.result && Array.isArray(details.result)) resultsData = details.result;
          }
        }

        let aiMap: Record<string, number | null> = {};
        if (resultsData && resultsData.length > 0) {
          aiMap = await fetchAiGradesForResults(resultsData, ex.id);
        }

        const averages = computeExamAverages({ ...ex, results: resultsData }, aiMap);
        enriched.push({ ...ex, results: resultsData, table_score: averages.avgTable, findings_score: averages.avgFindings, combined_score: averages.combinedAvg });
      } catch (e) {
        enriched.push(ex);
      }
    }
    setRecentExams(enriched);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of the CrimeWiseSystem platform statistics.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <div className={`p-2 rounded-full ${card.color}`}>
                  <card.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{counts[card.key] ?? "-"}</div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Exams Section */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Exams</CardTitle>
            <CardDescription>
              Recently completed examinations across all instructors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm border-b">
                  <th className="pb-2">Exam Name</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Instructor</th>
                  <th className="pb-2">Participants</th>
                  <th className="pb-2">Avg Table Score</th>
                  <th className="pb-2">Avg Findings Score</th>
                </tr>
              </thead>
              <tbody>
                {recentExams.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-4">No recent exams</td></tr>
                ) : recentExams.map((exam: any) => {
                  const tableMaxPts = getTableMaxPoints(exam);
                  const findingsMaxPts = getFindingsMaxPoints(exam);
                  const tableScore = exam.table_score ?? exam.tableScore ?? exam.score;
                  const findingsScore = exam.findings_score ?? exam.findingsScore ?? exam.findings?.score;
                  const tablePts = pointsFromPercent(tableScore, tableMaxPts);
                  const findingsPts = pointsFromPercent(findingsScore, findingsMaxPts);
                  return (
                    <tr key={exam.id} className="border-b">
                      <td className="py-3">{exam.name || "Untitled Exam"}</td>
                      <td className="py-3">
                        {exam.start ? exam.start.split("T")[0] : (exam.date ? exam.date.split("T")[0] : "-")}
                      </td>
                      <td className="py-3">{exam.instructor_name || "-"}</td>
                      <td className="py-3">{exam.participants || 0}</td>
                      <td className="py-3">
                        {(tableScore !== undefined && tableScore !== null) ? `${tableScore}%${(tablePts !== null && tableMaxPts !== null ? ` (${tablePts}/${tableMaxPts})` : '')}` : "-"}
                      </td>
                      <td className="py-3">
                        {(findingsScore !== undefined && findingsScore !== null) ? `${findingsScore}%${(findingsPts !== null && findingsMaxPts !== null ? ` (${findingsPts}/${findingsMaxPts})` : '')}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
