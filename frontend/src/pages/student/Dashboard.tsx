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
import Loading from "@/components/ui/Loading";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/auth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

const StudentDashboard = () => {
  const [profile, setProfile] = useState<any>(null);
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({});
  const [showMissed, setShowMissed] = useState(false); // toggle between available/upcoming and missed exams
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

    // Fetch upcoming exams including past ones so we can compute missed
    authenticatedFetch(`${API_BASE_URL}/api/exams/student/${studentId}/upcoming?includePast=true`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const allExams = Array.isArray(data) ? data : [];
        console.log('[Dashboard DEBUG] Fetched exams including past:', allExams);
        setUpcomingExams(allExams);
      })
      .catch((err) => {
        console.error('Error fetching exams:', err);
        toast({
          title: "Error",
          description: "Failed to fetch exams.",
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

  if (loading) return <Loading fullScreen message="Loading dashboard..." />;

  // Filter out exams that have been taken (in recentResults)
  const takenExamIds = new Set<number>();
  (recentResults || []).forEach((r: any) => {
    if (r.exam_id != null) {
      takenExamIds.add(Number(r.exam_id));
    }
  });

  // split upcomingExams (not taken) into available (next 7 days) and missed (past 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const untaken = (upcomingExams || []).filter((exam: any) => {
    const examId = exam.id != null ? Number(exam.id) : null;
    return examId != null && !takenExamIds.has(examId);
  });

  const availableExams = untaken.filter((exam: any) => {
    // Only show exams that start or end within the next 7 days (including today)
    const hasEnd = exam.end ? new Date(exam.end) : null;
    const hasStart = exam.start ? new Date(exam.start) : null;

    if (hasEnd) {
      // exam still open or will open within next week
      return hasEnd >= now && hasEnd <= sevenDaysAhead;
    }
    if (hasStart) {
      return hasStart >= now && hasStart <= sevenDaysAhead;
    }
    return false;
  });

  const missedExams = untaken
    .filter((exam: any) => {
      const hasEnd = exam.end ? new Date(exam.end) : null;
      const hasStart = exam.start ? new Date(exam.start) : null;
      // exams that ended within the past week
      if (hasEnd) {
        return hasEnd < now && hasEnd >= sevenDaysAgo;
      }
      if (hasStart) {
        // if no end date, consider start > a week ago and < now as missed
        return hasStart < now && hasStart >= sevenDaysAgo;
      }
      return false;
    })
    .sort((a: any, b: any) => {
      // Sort by start date descending (most recent first)
      const dateA = a.start ? new Date(a.start).getTime() : 0;
      const dateB = b.start ? new Date(b.start).getTime() : 0;
      return dateB - dateA;
    });
  const visibleUpcoming = showMissed ? missedExams : availableExams;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return d.toLocaleDateString('en-US', options);
    } catch (e) {
      try { return String(dateStr).split('T')[0]; } catch { return String(dateStr); }
    }
  };

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
      return d.toLocaleTimeString('en-US', options).toLowerCase();
    } catch (e) {
      return "";
    }
  };

  // helper to build a range element showing start date on first line,
  // then end date with time styled on second line
  const formatDateRange = (startStr?: string | null, endStr?: string | null): React.ReactNode => {
    const start = startStr ? formatDate(startStr) : "-";
    if (!endStr) return <>{start}</>;
    const endDay = formatDate(endStr);
    const endTime = formatTime(endStr);
    return (
      <>
        {start} -<br />
        {endDay}
        {endTime && (
          <> <span className="text-[10px] italic text-muted-foreground">{endTime}</span></>
        )}
      </>
    );
  };

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
                <CardTitle>{showMissed ? 'Missed Exams' : 'Available Exams'}</CardTitle>
                <CardDescription>
                  {showMissed
                    ? 'Exams whose access period has ended and weren\'t taken'
                    : 'Exams you can still access (not yet taken or still open)'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`text-xs px-2 py-1 rounded cursor-pointer
                    ${showMissed ? 'bg-green-500 text-white' : 'bg-green-600 text-white ring-2 ring-offset-1 ring-green-700'}`}
                  onClick={() => setShowMissed(false)}
                >Available</button>
                <button
                  className={`text-xs px-2 py-1 rounded cursor-pointer
                    ${showMissed ? 'bg-red-600 text-white ring-2 ring-offset-1 ring-red-700' : 'bg-red-500 text-white'}`}
                  onClick={() => setShowMissed(true)}
                >Missed</button>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {visibleUpcoming.length === 0 ? (
                  <div className="text-muted-foreground text-center">
                    {showMissed ? 'No missed exams' : 'No available exams'}
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
                          {formatDateRange(exam.start, exam.end)} • {exam.duration} mins
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exam.course_name || exam.course_code || "Course"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Instructor: {exam.instructor_name}
                        </p>
                      </div>
                      {showMissed ? (
                        <span className="text-sm font-semibold text-red-600">Missed</span>
                      ) : (
                        <Button size="sm" onClick={() => navigate('/student/exams')}>Enter Token</Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
              <CardDescription>Your exam performance overview</CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(recentResults) && recentResults.length > 0 ? (
                (() => {
                  // Calculate performance metrics for both table and findings scores
                  const tableScores = recentResults.map((result: any) => {
                    // Calculate percentage score using same logic as Results.tsx
                    let raw_score = result.raw_score;
                    let raw_total = result.raw_total;
                    let tableScore = result.score;
                    
                    // Try to extract score data from details field
                    if (result.details) {
                      try {
                        const detailsObj = typeof result.details === 'string' 
                          ? JSON.parse(result.details) 
                          : result.details;
                        
                        // Extract scoring information from details
                        if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
                          raw_score = parseInt(detailsObj.totalScore, 10);
                          raw_total = parseInt(detailsObj.totalPossiblePoints, 10);
                        }
                      } catch (e) {
                        // ignore
                      }
                    }
                    
                    // Calculate percentage score
                    if (raw_score !== undefined && raw_total !== undefined && raw_total > 0) {
                      tableScore = Math.round((raw_score / raw_total) * 100);
                    }
                    
                    return tableScore;
                  });

                  // Calculate findings scores
                  const findingsScores = recentResults.map((result: any) => {
                    const sid = result.student_id ?? result.studentId ?? getTokenStudentId();
                    const eid = result.exam_id ?? result.examId ?? result.id;
                    const key = `${sid}_${eid}`;
                    
                    let findingsScore = 0;
                    if (aiScores && Object.prototype.hasOwnProperty.call(aiScores, key)) {
                      const v = aiScores[key];
                      if (v !== null && v !== undefined) {
                        const num = Number(v);
                        if (!Number.isNaN(num)) findingsScore = Math.max(0, Math.min(100, Math.round(num)));
                      }
                    }
                    
                    return findingsScore;
                  });

                  // Table score metrics
                  const tableBestScore = Math.max(...tableScores);
                  const tableLowestScore = Math.min(...tableScores);
                  const tableAvgScore = Math.round(tableScores.reduce((a: number, b: number) => a + b, 0) / tableScores.length);
                  const tableFirstScore = tableScores[0];
                  const tableLatestScore = tableScores[tableScores.length - 1];
                  const tableImprovementTrend = tableLatestScore - tableFirstScore;
                  const tableImprovementPercent = tableFirstScore > 0 ? Math.round((tableImprovementTrend / tableFirstScore) * 100) : 0;

                  // Findings score metrics
                  const findingsBestScore = Math.max(...findingsScores);
                  const findingsLowestScore = Math.min(...findingsScores);
                  const findingsAvgScore = Math.round(findingsScores.reduce((a: number, b: number) => a + b, 0) / findingsScores.length);
                  const findingsFirstScore = findingsScores[0];
                  const findingsLatestScore = findingsScores[findingsScores.length - 1];
                  const findingsImprovementTrend = findingsLatestScore - findingsFirstScore;
                  const findingsImprovementPercent = findingsFirstScore > 0 ? Math.round((findingsImprovementTrend / findingsFirstScore) * 100) : 0;
                  
                  return (
                    <div className="space-y-4">
                      {/* Table Score Metrics */}
                      <div>
                        <h4 className="text-xs font-semibold text-blue-600 mb-2">Table Score</h4>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="border rounded p-2 bg-blue-50">
                            <p className="text-xs text-muted-foreground">Best</p>
                            <p className="text-xl font-bold text-blue-600">{tableBestScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-red-50">
                            <p className="text-xs text-muted-foreground">Lowest</p>
                            <p className="text-xl font-bold text-red-600">{tableLowestScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-purple-50">
                            <p className="text-xs text-muted-foreground">Avg</p>
                            <p className="text-xl font-bold text-purple-600">{tableAvgScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-green-50">
                            <p className="text-xs text-muted-foreground">Trend</p>
                            <p className="text-lg font-bold text-green-600">{tableImprovementTrend >= 0 ? '↑' : '↓'} {Math.abs(tableImprovementPercent)}%</p>
                          </div>
                        </div>
                      </div>

                      {/* Findings Score Metrics */}
                      <div>
                        <h4 className="text-xs font-semibold text-green-600 mb-2">Findings Score</h4>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="border rounded p-2 bg-green-50">
                            <p className="text-xs text-muted-foreground">Best</p>
                            <p className="text-xl font-bold text-green-600">{findingsBestScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-red-50">
                            <p className="text-xs text-muted-foreground">Lowest</p>
                            <p className="text-xl font-bold text-red-600">{findingsLowestScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-yellow-50">
                            <p className="text-xs text-muted-foreground">Avg</p>
                            <p className="text-xl font-bold text-yellow-600">{findingsAvgScore}%</p>
                          </div>
                          <div className="border rounded p-2 bg-blue-50">
                            <p className="text-xs text-muted-foreground">Trend</p>
                            <p className="text-lg font-bold text-blue-600">{findingsImprovementTrend >= 0 ? '↑' : '↓'} {Math.abs(findingsImprovementPercent)}%</p>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
                        <p className="font-medium">Trend: % change from first exam to most recent exam</p>
                        <p className="text-xs">Based on {recentResults.length} exam{recentResults.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-center py-12 text-center text-muted-foreground">
                  No exam results yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Score Trend</CardTitle>
              <CardDescription>Performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(recentResults) && recentResults.length > 0 ? (
                (() => {
                  const chartData = (recentResults || [])
                    .slice()
                    .reverse()
                    .map((result: any) => {
                      // Calculate percentage score using same logic as Results.tsx
                      let raw_score = result.raw_score;
                      let raw_total = result.raw_total;
                      let tableScore = result.score;
                      
                      // Try to extract score data from details field (same as Results.tsx)
                      if (result.details) {
                        try {
                          const detailsObj = typeof result.details === 'string' 
                            ? JSON.parse(result.details) 
                            : result.details;
                          
                          // Extract scoring information from details
                          if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
                            raw_score = parseInt(detailsObj.totalScore, 10);
                            raw_total = parseInt(detailsObj.totalPossiblePoints, 10);
                          }
                        } catch (e) {
                          // ignore
                        }
                      }
                      
                      // Calculate percentage score
                      if (raw_score !== undefined && raw_total !== undefined && raw_total > 0) {
                        tableScore = Math.round((raw_score / raw_total) * 100);
                      }
                      
                      // Get findings score
                      const sid = result.student_id ?? result.studentId ?? getTokenStudentId();
                      const eid = result.exam_id ?? result.examId ?? result.id;
                      const key = `${sid}_${eid}`;
                      
                      let findingsScore = 0;
                      if (aiScores && Object.prototype.hasOwnProperty.call(aiScores, key)) {
                        const v = aiScores[key];
                        if (v !== null && v !== undefined) {
                          const num = Number(v);
                          if (!Number.isNaN(num)) findingsScore = Math.max(0, Math.min(100, Math.round(num)));
                        }
                      }
                      
                      // Get exam name (same logic as Results.tsx)
                      const examName = result.examName || result.exam_name || result.name || `Exam ${result.exam_id || result.id}`;
                      
                      return {
                        exam: examName,
                        table: tableScore,
                        findings: findingsScore,
                      };
                    });

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
