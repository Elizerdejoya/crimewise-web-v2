import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Calendar, FileText, TrendingUp } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/auth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

const StudentDashboard = () => {
  const [profile, setProfile] = useState<any>(null);
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  const getTokenStudentId = () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const decoded: any = jwtDecode(token);
      return decoded?.id ?? null;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const decoded: JwtTokenPayload = jwtDecode(token);
    const studentId = decoded.id;

    // Fetch student profile with batch and class information
    authenticatedFetch(`${API_BASE_URL}/api/students/full`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Try to find the student by several possible id fields returned from the API
        const student = (Array.isArray(data) ? data : []).find((s: any) => {
          const candidates = [s.student_id, s.studentId, s.id, s.user_id, s.userId];
          return candidates.map((c) => (c !== undefined && c !== null ? String(c) : null)).includes(String(studentId));
        });
        if (student) {
          setProfile({
            ...student,
            studentId: student.student_id ?? student.studentId ?? student.id ?? student.user_id ?? student.userId ?? null,
            name: student.name ?? student.full_name ?? student.fullName ?? "-",
            batch: student.batch_name ?? student.batch ?? student.batchName ?? "-",
            class: student.class_name ?? student.class ?? student.className ?? "-",
          });
        }
      })
      .catch((err) => {
        console.error('Error fetching profile:', err);
        toast({
          title: "Error",
          description: "Failed to fetch profile information.",
          variant: "destructive",
        });
      });

    // Fetch upcoming exams for student using the new endpoint
    authenticatedFetch(`${API_BASE_URL}/api/exams/student/${studentId}/upcoming`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setUpcomingExams(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Error fetching upcoming exams:', err);
        toast({
          title: "Error",
          description: "Failed to fetch upcoming exams.",
          variant: "destructive",
        });
      });

    // Fetch recent results for student
    authenticatedFetch(`${API_BASE_URL}/api/exams/student/${studentId}/results`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setRecentResults(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Error fetching results:', err);
        toast({
          title: "Error",
          description: "Failed to fetch exam results.",
          variant: "destructive",
        });
      });

    setLoading(false);
  }, []);

  // Fetch AI grader scores for recent results so dashboard averages use the same values as Results page
  useEffect(() => {
    if (!recentResults || recentResults.length === 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    let decodedId: any = null;
    try { decodedId = jwtDecode(token); } catch (e) { decodedId = null; }

    const studentIdFromToken = decodedId?.id;

    const fetches = recentResults.map(async (r: any) => {
      const sid = r.student_id ?? r.studentId ?? studentIdFromToken;
      const eid = r.exam_id ?? r.examId ?? r.id;
      if (!sid || !eid) return;
      const key = `${sid}_${eid}`;
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/api/ai-grader/result/${sid}/${eid}`);
        if (!res.ok) {
          setAiScores(prev => ({ ...prev, [key]: null }));
          return;
        }
        const data = await res.json();
        const overall = Number(data.score ?? data.overall ?? NaN);
        setAiScores(prev => ({ ...prev, [key]: Number.isNaN(overall) ? null : Math.round(overall) }));
      } catch (e) {
        setAiScores(prev => ({ ...prev, [key]: null }));
      }
    });

    void Promise.allSettled(fetches);
  }, [recentResults]);

  if (loading) return <div className="p-8">Loading...</div>;

  // Derive display list for upcoming exams that excludes exams already taken
  const takenSet = new Set<string>();
  (recentResults || []).forEach((r: any) => {
    if (r.exam_id != null) takenSet.add(String(r.exam_id));
    if (r.id != null) takenSet.add(String(r.id));
    if (r.examName) takenSet.add(String(r.examName));
    if (r.exam_name) takenSet.add(String(r.exam_name));
  });

  const visibleUpcoming = (upcomingExams || []).filter((ex: any) => {
    const exId = ex.id ?? ex.exam_id ?? null;
    const exName = ex.name ?? ex.examName ?? ex.title ?? null;
    if (exId != null && takenSet.has(String(exId))) return false;
    if (exName && takenSet.has(String(exName))) return false;
    // Also try matching by numeric/string variants
    const exIdStr = exId != null ? String(exId) : null;
    if (exIdStr && takenSet.has(exIdStr)) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Student Dashboard
          </h2>
          <p className="text-muted-foreground">
            Your academic profile, upcoming exams, and results
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Profile</CardTitle>
              <CardDescription>Your academic information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Student ID</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.studentId ?? profile?.id ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Name</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Batch</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.batch || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Class</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.class || "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Upcoming Exams</CardTitle>
                <CardDescription>Scheduled in the next 7 days</CardDescription>
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {visibleUpcoming.length === 0 ? (
                  <div className="text-muted-foreground text-center">
                    No upcoming exams
                  </div>
                ) : (
                  visibleUpcoming.map((exam: any) => (
                    <div
                      key={exam.id}
                      className="flex justify-between items-center p-3 border rounded-md bg-background"
                    >
                      <div>
                        <p className="font-medium">{exam.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {exam.start?.split("T")[0]} • {exam.duration} mins
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exam.course_name || exam.course_code || "Course"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Instructor: {exam.instructor_name}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => navigate('/student/exams')}>Enter Token</Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Overall Statistics</CardTitle>
              <CardDescription>Your academic performance summary</CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex items-stretch">
                {Array.isArray(recentResults) && recentResults.length > 0 ? (
                  (() => {
                    // Normalize results using same rules as Results.tsx processedResults
                    const normalized = (recentResults || []).map((result: any) => {
                      let raw_score = result.raw_score;
                      let raw_total = result.raw_total;
                      let totalPoints = result.totalPoints ?? result.total_points ?? result.total ?? 0;
                      let earnedPoints = result.earnedPoints ?? result.earned_points ?? result.earned ?? 0;

                      if (result.question_type === 'forensic' && result.answer && result.answer_key) {
                        try {
                          let parsedAnswer: any = [];
                          let parsedKey: any = [];
                          let columns: string[] = [];
                          if (result.answer) {
                            const rawAnswer = JSON.parse(result.answer);
                            parsedAnswer = rawAnswer.tableAnswers || rawAnswer || [];
                          }
                          if (result.answer_key) {
                            const rawKey = JSON.parse(result.answer_key);
                            if (rawKey.specimens && Array.isArray(rawKey.specimens)) parsedKey = rawKey.specimens;
                            else if (Array.isArray(rawKey)) parsedKey = rawKey;
                            else parsedKey = [];
                          }
                          if (!Array.isArray(parsedKey)) parsedKey = [];
                          columns = parsedKey.length > 0 ? Object.keys(parsedKey[0]).filter((k) => !['points','id','rowId'].includes(k)) : [];

                          raw_total = parsedKey.length * columns.length;
                          raw_score = 0;
                          totalPoints = 0;
                          earnedPoints = 0;

                          parsedKey.forEach((row: any, rowIdx: number) => {
                            const rowPoints = row.points !== undefined ? Number(row.points) : 1;
                            totalPoints += rowPoints;
                            let allCorrectForRow = true;
                            columns.forEach((col) => {
                              const studentAns = (parsedAnswer[rowIdx]?.[col] ?? "").toString();
                              const correctAns = (row[col] ?? "").toString();
                              if (studentAns.trim().toLowerCase() === correctAns.trim().toLowerCase()) {
                                raw_score++;
                              } else {
                                allCorrectForRow = false;
                              }
                            });
                            if (allCorrectForRow) earnedPoints += rowPoints;
                          });
                        } catch (e) {
                          raw_score = raw_score ?? 0;
                          raw_total = raw_total ?? 0;
                        }
                      }

                      // compute final score percent using same fallbacks
                      let score = result.score;
                      if (totalPoints > 0) {
                        score = Math.round((Number(earnedPoints) / Number(totalPoints)) * 100);
                      } else if (raw_score !== undefined && raw_total !== undefined) {
                        score = raw_total > 0 ? Math.round((Number(raw_score) / Number(raw_total)) * 100) : 0;
                      } else {
                        score = score !== undefined ? Number(score) : 0;
                      }

                      return {
                        ...result,
                        raw_score,
                        raw_total,
                        totalPoints,
                        earnedPoints,
                        score: Number.isNaN(Number(score)) ? 0 : Math.max(0, Math.min(100, Math.round(Number(score)))),
                      };
                    });

                    const totalExams = normalized.length;

                    const tableScores = normalized.map((r: any) => r.score).filter((s: number) => s > 0);

                    const getFindingsMaxPoints = (result: any) => {
                      try {
                        if (!result) return 20;
                        if (result.findings_points !== undefined && result.findings_points !== null) return Number(result.findings_points);
                        if (result.findingsPoints !== undefined && result.findingsPoints !== null) return Number(result.findingsPoints);
                        if (result.explanation_points !== undefined && result.explanation_points !== null) return Number(result.explanation_points);
                        if (result.explanationPoints !== undefined && result.explanationPoints !== null) return Number(result.explanationPoints);
                        return 20;
                      } catch (e) {
                        return 20;
                      }
                    };

                    const extractFindings = (r: any) => {
                      const sid = r.student_id ?? r.studentId ?? getTokenStudentId();
                      const eid = r.exam_id ?? r.examId ?? r.id;
                      const key = `${sid}_${eid}`;
                      // Prefer AI grade fetched from aiScores map when available
                      if (aiScores && Object.prototype.hasOwnProperty.call(aiScores, key)) {
                        const v = aiScores[key];
                        if (v === null || v === undefined) return 0;
                        const num = Number(v);
                        if (!Number.isNaN(num)) return Math.max(0, Math.min(100, Math.round(num)));
                        return 0;
                      }

                      const maxPts = getFindingsMaxPoints(r) || 20;
                      const candidates = [r.findings_score, r.ai_score, r.overall, r.ai_overall, r.findingsScore, r.findingsPoints];
                      for (const c of candidates) {
                        if (c === undefined || c === null) continue;
                        const num = Number(c);
                        if (Number.isNaN(num)) continue;
                        // If the value looks like points (less than or equal to maxPts), convert to percent
                        if (maxPts > 0 && num <= maxPts) {
                          return Math.max(0, Math.min(100, Math.round((num / maxPts) * 100)));
                        }
                        // Otherwise treat as percent
                        if (num >= 0 && num <= 100) return Math.max(0, Math.min(100, Math.round(num)));
                      }
                      return 0;
                    };

                    const findingsScores = normalized.map(extractFindings).filter((s: number) => s > 0);

                    const avgTableScore = tableScores.length > 0 ? Math.round(tableScores.reduce((a: number, b: number) => a + b, 0) / tableScores.length) : 0;
                    const avgFindingsScore = findingsScores.length > 0 ? Math.round(findingsScores.reduce((a: number, b: number) => a + b, 0) / findingsScores.length) : 0;
                    const passRate = tableScores.length > 0 ? Math.round((tableScores.filter((s: number) => s >= 60).length / tableScores.length) * 100) : 0;

                    return (
                      <div className="flex flex-col w-full h-full justify-between">
                        <div className="grid grid-cols-2 gap-6 items-center">
                        <div className="text-center py-3">
                          <p className="text-4xl font-extrabold text-blue-600">{avgTableScore}%</p>
                          <p className="text-sm text-muted-foreground mt-2">Table Avg</p>
                        </div>
                        <div className="text-center py-3">
                          <p className="text-4xl font-extrabold text-green-600">{avgFindingsScore}%</p>
                          <p className="text-sm text-muted-foreground mt-2">Findings Avg</p>
                        </div>
                      </div>
                        <div className="grid grid-cols-2 gap-6 border-t pt-4 mt-4">
                        <div className="text-center py-3">
                          <p className="text-2xl font-bold text-primary">{totalExams}</p>
                          <p className="text-sm text-muted-foreground mt-1">Exams Taken</p>
                        </div>
                        <div className="text-center py-3">
                          <p className="text-2xl font-bold text-primary">{passRate}%</p>
                          <p className="text-sm text-muted-foreground mt-1">Pass Rate</p>
                        </div>
                      </div>
                      <div className="pt-3 text-sm text-muted-foreground">
                        <p className="mb-1 font-medium">Pass Rate</p>
                        <p className="text-xs">% of recent exams with table score ≥ 60% (computed like Results).</p>
                      </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-center justify-center w-full py-12 text-center text-muted-foreground">
                    No exam results yet
                  </div>
                )}
              </CardContent>
          </Card>

          {/* Score Trend Chart */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Score Trend</CardTitle>
              <CardDescription>Performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(recentResults) && recentResults.length > 0 ? (
                (() => {
                  // Prepare chart data with table and findings scores
                  // Normalize results for chart (same rules as statistics)
                  const normalizedForChart = (recentResults || []).map((result: any) => {
                    let raw_score = result.raw_score;
                    let raw_total = result.raw_total;
                    let totalPoints = result.totalPoints ?? result.total_points ?? result.total ?? 0;
                    let earnedPoints = result.earnedPoints ?? result.earned_points ?? result.earned ?? 0;

                    if (result.question_type === 'forensic' && result.answer && result.answer_key) {
                      try {
                        let parsedAnswer: any = [];
                        let parsedKey: any = [];
                        let columns: string[] = [];
                        if (result.answer) {
                          const rawAnswer = JSON.parse(result.answer);
                          parsedAnswer = rawAnswer.tableAnswers || rawAnswer || [];
                        }
                        if (result.answer_key) {
                          const rawKey = JSON.parse(result.answer_key);
                          if (rawKey.specimens && Array.isArray(rawKey.specimens)) parsedKey = rawKey.specimens;
                          else if (Array.isArray(rawKey)) parsedKey = rawKey;
                          else parsedKey = [];
                        }
                        if (!Array.isArray(parsedKey)) parsedKey = [];
                        columns = parsedKey.length > 0 ? Object.keys(parsedKey[0]).filter((k) => !['points','id','rowId'].includes(k)) : [];

                        raw_total = parsedKey.length * columns.length;
                        raw_score = 0;
                        totalPoints = 0;
                        earnedPoints = 0;

                        parsedKey.forEach((row: any, rowIdx: number) => {
                          const rowPoints = row.points !== undefined ? Number(row.points) : 1;
                          totalPoints += rowPoints;
                          let allCorrectForRow = true;
                          columns.forEach((col) => {
                            const studentAns = (parsedAnswer[rowIdx]?.[col] ?? "").toString();
                            const correctAns = (row[col] ?? "").toString();
                            if (studentAns.trim().toLowerCase() === correctAns.trim().toLowerCase()) {
                              raw_score++;
                            } else {
                              allCorrectForRow = false;
                            }
                          });
                          if (allCorrectForRow) earnedPoints += rowPoints;
                        });
                      } catch (e) {
                        raw_score = raw_score ?? 0;
                        raw_total = raw_total ?? 0;
                      }
                    }

                    let score = result.score;
                    if (totalPoints > 0) {
                      score = Math.round((Number(earnedPoints) / Number(totalPoints)) * 100);
                    } else if (raw_score !== undefined && raw_total !== undefined) {
                      score = raw_total > 0 ? Math.round((Number(raw_score) / Number(raw_total)) * 100) : 0;
                    } else {
                      score = score !== undefined ? Number(score) : 0;
                    }

                    const normalizedScore = Number.isNaN(Number(score)) ? 0 : Math.max(0, Math.min(100, Math.round(Number(score))));

                    const getFindingsMaxPoints = (result: any) => {
                      try {
                        if (!result) return 20;
                        if (result.findings_points !== undefined && result.findings_points !== null) return Number(result.findings_points);
                        if (result.findingsPoints !== undefined && result.findingsPoints !== null) return Number(result.findingsPoints);
                        if (result.explanation_points !== undefined && result.explanation_points !== null) return Number(result.explanation_points);
                        if (result.explanationPoints !== undefined && result.explanationPoints !== null) return Number(result.explanationPoints);
                        return 20;
                      } catch (e) {
                        return 20;
                      }
                    };

                    const extractFindings = (r: any) => {
                      const sid = r.student_id ?? r.studentId ?? getTokenStudentId();
                      const eid = r.exam_id ?? r.examId ?? r.id;
                      const key = `${sid}_${eid}`;
                      // Prefer AI grade fetched from aiScores map when available
                      if (aiScores && Object.prototype.hasOwnProperty.call(aiScores, key)) {
                        const v = aiScores[key];
                        if (v === null || v === undefined) return 0;
                        const num = Number(v);
                        if (!Number.isNaN(num)) return Math.max(0, Math.min(100, Math.round(num)));
                        return 0;
                      }

                      const maxPts = getFindingsMaxPoints(r) || 20;
                      const candidates = [r.findings_score, r.ai_score, r.overall, r.ai_overall, r.findingsScore, r.findingsPoints];
                      for (const c of candidates) {
                        if (c === undefined || c === null) continue;
                        const num = Number(c);
                        if (Number.isNaN(num)) continue;
                        if (maxPts > 0 && num <= maxPts) {
                          return Math.max(0, Math.min(100, Math.round((num / maxPts) * 100)));
                        }
                        if (num >= 0 && num <= 100) return Math.max(0, Math.min(100, Math.round(num)));
                      }
                      return 0;
                    };

                    return {
                      ...result,
                      score: normalizedScore,
                      findings: extractFindings(result),
                    };
                  });

                  const chartData = normalizedForChart
                    .slice()
                    .reverse()
                    .map((r: any, idx: number) => ({
                      exam: `Exam ${idx + 1}`,
                      table: r.score || 0,
                      findings: r.findings || 0,
                    }));

                  return (
                    <ChartContainer config={{ table: { label: 'Table Score', color: '#3b82f6' }, findings: { label: 'Findings Score', color: '#10b981' } }}>
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="exam" />
                          <YAxis domain={[0, 100]} />
                          <RechartsTooltip content={<ChartTooltipContent />} />
                          <RechartsLegend />
                          <Line type="monotone" dataKey="table" stroke="var(--color-table)" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="findings" stroke="var(--color-findings)" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  );
                })()
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StudentDashboard;
