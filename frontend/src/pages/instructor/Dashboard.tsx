import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { JwtTokenPayload } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from "recharts";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Link } from "react-router-dom";
import { Book, Calendar, FileText, TrendingUp, Users, Award } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// Helper function to create auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// (reverted: table/findings point-accuracy helpers removed)

const InstructorDashboard = () => {
  const [courses, setCourses] = useState([]);
  const [exams, setExams] = useState([]);
  const [allExams, setAllExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [recentExams, setRecentExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [examResults, setExamResults] = useState<any>({});
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [studentChartMode, setStudentChartMode] = useState<'class' | 'course'>('class');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [examChartMode, setExamChartMode] = useState<'all' | 'last10' | 'last20'>('all');
  
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const decoded: JwtTokenPayload = jwtDecode(token);
    const instructorId = decoded.id;

    // Fetch assigned courses (relations) and then fetch course details (including student counts)
    fetch(`${API_BASE_URL}/api/relations/instructor-course`, {
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
      .then(async (data) => {
        try {
          const assigned = Array.isArray(data) ? data.filter((c: any) => c.instructor_id === instructorId) : [];
          // Fetch full course objects (these include the `students` count from the backend)
          const coursesResp = await fetch(`${API_BASE_URL}/api/courses`, { headers: getAuthHeaders() });
          const allCourses = coursesResp.ok ? await coursesResp.json() : [];

          // Merge relation entries with full course details so charts have student counts
          const merged = assigned.map((rel: any) => {
            const courseDetail = (allCourses || []).find((c: any) => Number(c.id) === Number(rel.course_id) || Number(c.id) === Number(rel.course_id) );
            // If courseDetail exists, use it; otherwise fall back to relation's shallow info
            return courseDetail ? { ...courseDetail, course: rel.course, course_id: rel.course_id } : { id: rel.course_id, name: rel.course, course: rel.course, students: 0 };
          });

          setCourses(merged);
        } catch (err) {
          console.error('Error merging course details:', err);
          setCourses([]);
        }
      })
      .catch(err => console.error('Error fetching courses relations:', err));

    // Fetch question bank (backend now filters by instructor automatically)
    fetch(`${API_BASE_URL}/api/questions`, {
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
      .then(data => setQuestions(data))
      .catch(err => console.error('Error fetching questions:', err));

    // Fetch exams with details for dashboard
    fetch(`${API_BASE_URL}/api/exams?instructorId=${instructorId}&includeDetails=true`, {
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
        // keep full list of exams for charts (participants per exam)
        setAllExams(Array.isArray(data) ? data : []);
        const now = new Date();
        // Filter upcoming exams (future exams)
        const upcoming = data.filter((e: any) => {
          const examDate = new Date(e.start || e.date);
          return examDate > now;
        });
        
        // Filter recent exams (past exams, limited to last 10)
        const recent = data
          .filter((e: any) => {
            const examDate = new Date(e.start || e.date);
            return examDate <= now;
          })
          .sort((a: any, b: any) => {
            const dateA = new Date(a.start || a.date);
            const dateB = new Date(b.start || b.date);
            return dateB.getTime() - dateA.getTime(); // Most recent first
          })
          .slice(0, 10); // Limit to 10 most recent
        
        setExams(upcoming);
        setRecentExams(recent);
      })
      .catch(err => {
        console.error('Error fetching exams:', err);
        // Fallback to basic exam fetch if detailed fetch fails
        fetch(`${API_BASE_URL}/api/exams?instructorId=${instructorId}`, {
          headers: getAuthHeaders(),
        })
          .then(res => res.json())
          .then(data => {
            const now = new Date();
            const upcoming = data.filter((e: any) => {
              const examDate = new Date(e.start || e.date);
              return examDate > now;
            });
            const recent = data
              .filter((e: any) => {
                const examDate = new Date(e.start || e.date);
                return examDate <= now;
              })
              .sort((a: any, b: any) => {
                const dateA = new Date(a.start || a.date);
                const dateB = new Date(b.start || b.date);
                return dateB.getTime() - dateA.getTime();
              })
              .slice(0, 10);
            setExams(upcoming);
            setRecentExams(recent);
          })
          .catch(fallbackErr => console.error('Fallback fetch also failed:', fallbackErr));
      })
      .finally(() => setLoading(false));

    // Fetch classes so we can show student counts per class
    fetch(`${API_BASE_URL}/api/classes`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setClasses(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error fetching classes:', err));
  }, []);

  // Fetch exam results for analytics (for each recent exam)
  useEffect(() => {
    if (recentExams.length === 0) return;

    const fetchResults = async () => {
      const results: Record<string, any[]> = {};
      for (const exam of recentExams) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/exams/results/${exam.id}`, {
            headers: getAuthHeaders(),
          });
          if (res.ok) {
            const data = await res.json();
            results[exam.id] = Array.isArray(data) ? data : (data.results || []);
          }
        } catch (err) {
          console.error(`Error fetching results for exam ${exam.id}:`, err);
        }
      }
      setExamResults(results);
      
      // Fetch AI grades for all results
      const allResults = Object.values(results).flat();
      if (allResults.length > 0) {
        try {
          await fetchAiGradesForResults(allResults);
        } catch (e) {
          console.error('Error fetching AI grades:', e);
        }
      }
    };

    fetchResults();
  }, [recentExams]);

  // Fetch AI grades for an array of results (skip ones already fetched)
  const fetchAiGradesForResults = async (resultsArr: any[]) => {
    if (!Array.isArray(resultsArr) || resultsArr.length === 0) return;
    const token = localStorage.getItem('token');
    const fetchPromises = resultsArr.map(async (r): Promise<[string, number | null] | null> => {
      const sid = r.student_id ?? r.studentId ?? r.student;
      const eid = r.exam_id ?? r.examId ?? r.exam_id;
      if (!sid || !eid) return null;
      const key = `${sid}_${eid}`;
      // if already present in state, skip
      if (aiScores[key] !== undefined) return null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai-grader/result/${sid}/${eid}`, { 
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } 
        });
        if (!res.ok) return null;
        const data = await res.json();
        const score = data.score !== undefined ? Number(data.score) : NaN;
        return [key, Number.isNaN(score) ? null : Math.round(score)];
      } catch (e) {
        return null;
      }
    });

    const settled = await Promise.all(fetchPromises);
    const resultMap: Record<string, number | null> = {};
    settled.forEach((item) => {
      if (item && Array.isArray(item) && typeof item[0] === 'string') {
        const [k, v] = item as [string, number | null];
        resultMap[k] = v;
      }
    });

    if (Object.keys(resultMap).length > 0) {
      setAiScores(prev => ({ ...prev, ...resultMap }));
    }
  };

  // Helper to extract student count robustly
  function getStudentCount(obj: any) {
    if (!obj) return 0;
    if (Array.isArray(obj.students)) return obj.students.length;
    if (typeof obj.students === 'number') return obj.students;
    if (typeof obj.students === 'string' && obj.students.trim() !== '') return Number(obj.students);
    if (typeof obj.student_count === 'number') return obj.student_count;
    if (typeof obj.count === 'number') return obj.count;
    if (typeof obj.size === 'number') return obj.size;
    if (typeof obj.total_students === 'number') return obj.total_students;
    if (typeof obj.num_students === 'number') return obj.num_students;
    return 0;
  }

  // Calculate exam performance metrics (both table and findings scores)
  // Uses exact same getFindingsPercent logic as ExamResults.tsx
  const getExamPerformance = (examId: number) => {
    const results = examResults[examId] || [];
    if (results.length === 0) {
      return { 
        tableAvgScore: 0, tablePassRate: 0,
        findingsAvgScore: 0, findingsPassRate: 0,
        completionRate: 0, participants: 0 
      };
    }

    // Helper: exact same logic as ExamResults.tsx getFindingsPercent
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
            const str = typeof res[k] === 'string' ? res[k].replace('%', '').trim() : res[k];
            const n = Number(str);
            if (!Number.isNaN(n)) return Math.round(n);
          }
        }
        
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
        
        if (res.ai && typeof res.ai === 'object') {
          const overall = Number(res.ai.score ?? res.ai.overall ?? NaN);
          if (!Number.isNaN(overall)) return Math.round(overall);
        }
        
        return null;
      } catch (e) {
        return null;
      }
    };

    // Extract table scores
    const tableScores = results
      .map((r: any) => {
        let score = r.score;
        
        // Try to extract score from details like in Results.tsx
        if (r.details) {
          try {
            const detailsObj = typeof r.details === 'string' 
              ? JSON.parse(r.details) 
              : r.details;
            
            if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
              const raw_score = parseInt(detailsObj.totalScore, 10);
              const raw_total = parseInt(detailsObj.totalPossiblePoints, 10);
              if (raw_total > 0) {
                score = Math.round((raw_score / raw_total) * 100);
              }
            }
          } catch (e) {
            // Fallback to original score
          }
        }
        
        if (typeof score === 'string') return parseFloat(score);
        if (typeof score === 'number') return score;
        return 0;
      })
      .filter((s: number) => !isNaN(s) && s !== null && s !== undefined);

    // Extract findings scores using aiScores first (from API), then fallback to extraction from result
    const findingsScores = results
      .map((r: any) => {
        // Prefer aiScores from the API
        const sid = r.student_id ?? r.studentId ?? r.student;
        const eid = r.exam_id ?? r.examId ?? r.exam_id;
        const key = `${sid}_${eid}`;
        if (aiScores[key] !== undefined && aiScores[key] !== null) {
          return aiScores[key];
        }
        // Fallback to extraction from result object
        return getFindingsPercent(r);
      })
      .filter((s: number) => s !== null && s !== undefined);

    const tableAvgScore = tableScores.length > 0 ? Math.round(tableScores.reduce((a, b) => a + b, 0) / tableScores.length) : 0;
    const tablePassCount = tableScores.filter((s: number) => s >= 60).length;
    const tablePassRate = tableScores.length > 0 ? Math.round((tablePassCount / tableScores.length) * 100) : 0;

    const findingsAvgScore = findingsScores.length > 0 ? Math.round(findingsScores.reduce((a, b) => a + b, 0) / findingsScores.length) : 0;
    const findingsPassCount = findingsScores.filter((s: number) => s >= 60).length;
    const findingsPassRate = findingsScores.length > 0 ? Math.round((findingsPassCount / findingsScores.length) * 100) : 0;

    return {
      tableAvgScore,
      tablePassRate,
      findingsAvgScore,
      findingsPassRate,
      completionRate: 100,
      participants: results.length,
    };
  };

  // Get top performing students across all exams (both scores combined)
  const getTopPerformers = () => {
    // Helper function to extract findings percent (same as in getExamPerformance)
    const getFindingsPercent = (res: any) => {
      try {
        if (res.details) {
          try {
            const detailsObj = typeof res.details === 'string' 
              ? JSON.parse(res.details) 
              : res.details;
            
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
            // Fall through
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    };

    const studentScores: Record<string, { name: string; tableScores: number[]; findingsScores: number[]; examCount: number }> = {};

    Object.values(examResults).forEach((results: any[]) => {
      (results || []).forEach((result: any) => {
        const studentId = result.student_id;
        const studentName = result.student_name || `Student ${studentId}`;
        
        // Extract table score
        let tableScore = result.score;
        if (result.details) {
          try {
            const detailsObj = typeof result.details === 'string' 
              ? JSON.parse(result.details) 
              : result.details;
            
            if (detailsObj.totalScore !== undefined && detailsObj.totalPossiblePoints !== undefined) {
              const raw_score = parseInt(detailsObj.totalScore, 10);
              const raw_total = parseInt(detailsObj.totalPossiblePoints, 10);
              if (raw_total > 0) {
                tableScore = Math.round((raw_score / raw_total) * 100);
              }
            }
          } catch (e) {
            // Fallback to original score
          }
        }
        tableScore = typeof tableScore === 'string' ? parseFloat(tableScore) : (typeof tableScore === 'number' ? tableScore : 0);

        // Extract findings score using aiScores first, then fallback to helper
        let findingsScore = null;
        const sid = result.student_id ?? result.studentId;
        const eid = result.exam_id ?? result.examId;
        if (sid && eid) {
          const key = `${sid}_${eid}`;
          if (aiScores[key] !== undefined && aiScores[key] !== null) {
            findingsScore = aiScores[key];
          }
        }
        if (findingsScore === null) {
          findingsScore = getFindingsPercent(result);
        }

        if (!studentScores[studentId]) {
          studentScores[studentId] = { name: studentName, tableScores: [], findingsScores: [], examCount: 0 };
        }
        if (!isNaN(tableScore) && tableScore !== null && tableScore !== undefined) {
          studentScores[studentId].tableScores.push(tableScore);
        }
        // Only add findings score if it exists (not null)
        if (findingsScore !== null && !isNaN(findingsScore) && findingsScore !== undefined) {
          studentScores[studentId].findingsScores.push(findingsScore);
        }
        studentScores[studentId].examCount += 1;
      });
    });

    return Object.entries(studentScores)
      .map(([, data]) => {
        const tableAvg = data.tableScores.length > 0 ? Math.round(data.tableScores.reduce((a, b) => a + b, 0) / data.tableScores.length) : 0;
        const findingsAvg = data.findingsScores.length > 0 ? Math.round(data.findingsScores.reduce((a, b) => a + b, 0) / data.findingsScores.length) : 0;
        const combinedAvg = data.findingsScores.length > 0 ? Math.round((tableAvg + findingsAvg) / 2) : tableAvg;
        return {
          name: data.name,
          tableAvg,
          findingsAvg,
          avgScore: combinedAvg,
          examsCompleted: data.examCount,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);
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

  // (reverted: per-exam background score fetching removed)

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Instructor Dashboard</h2>
          <p className="text-muted-foreground">
            Manage your courses, exams, and view student performance.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold">Assigned Courses</CardTitle>
                <CardDescription className="text-xs">Courses you're teaching</CardDescription>
              </div>
              <Book className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{courses.length}</div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {courses.map((c: any) => c.course).join(", ") || "No courses assigned"}
              </p>
            </CardContent>
          </Card>
          <Card className="border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold">Upcoming Exams</CardTitle>
                <CardDescription className="text-xs">Scheduled in the next 7 days</CardDescription>
              </div>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{exams.length}</div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {exams.slice(0, 2).map((e: any) => e.name || "Untitled Exam").join(", ") || "No upcoming exams"}
              </p>
            </CardContent>
          </Card>
          <Card className="border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold">Question Bank</CardTitle>
                <CardDescription className="text-xs">Questions you've created</CardDescription>
              </div>
              <FileText className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{questions.length}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {questions.filter((q: any) => q.type === "forensic").length} forensic document questions
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Students per class/course chart */}
          <Card>
            <CardHeader>
              <CardTitle>Students per {studentChartMode === 'class' ? 'Class' : 'Course'}</CardTitle>
              <CardDescription>Number of students in each {studentChartMode === 'class' ? 'class' : 'course'} you're teaching</CardDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                <Select value={studentChartMode} onValueChange={v => setStudentChartMode(v as 'class' | 'course')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class">Class</SelectItem>
                    <SelectItem value="course">Course</SelectItem>
                  </SelectContent>
                </Select>
                {studentChartMode === 'course' ? (
                  <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select Course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Courses</SelectItem>
                      {courses.map((course: any) => (
                        <SelectItem key={course.id} value={String(course.id)}>
                          {course.course || course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((cls: any) => (
                        <SelectItem key={cls.id} value={String(cls.id)}>
                          {cls.name || cls.class || String(cls.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {studentChartMode === 'class' ? (
                classes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No class data available</div>
                ) : (
                  <ChartContainer config={{ students: { label: 'Students', color: '#3b82f6' } }}>
                    {(
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={classes
                            .filter((c: any) => selectedClassId === 'all' || String(c.id) === selectedClassId)
                            .map((c: any) => {
                              const count = getStudentCount(c);
                              return {
                                name: c.name || c.class || String(c.id),
                                students: count,
                                debug: count === 0 ? JSON.stringify(c) : undefined
                              };
                            })}
                          margin={{ top: 28 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <RechartsTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="students" fill="var(--color-students)" onClick={(d:any) => { const v = d?.value ?? d?.payload?.students; toast({ title: 'Students', description: String(v) }); }}>
                            <LabelList dataKey="students" position="top" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartContainer>
                )
              ) : (
                courses.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No course data available</div>
                ) : (
                  <ChartContainer config={{ students: { label: 'Students', color: '#3b82f6' } }}>
                    {(
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={courses
                            .filter((c: any) => selectedCourseId === 'all' || String(c.id) === selectedCourseId)
                            .map((c: any) => {
                              const count = getStudentCount(c);
                              return {
                                name: c.course || c.name || String(c.id),
                                students: count,
                                debug: count === 0 ? JSON.stringify(c) : undefined
                              };
                            })}
                          margin={{ top: 28 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <RechartsTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="students" fill="var(--color-students)" onClick={(d:any) => { const v = d?.value ?? d?.payload?.students; toast({ title: 'Students', description: String(v) }); }}>
                            <LabelList dataKey="students" position="top" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartContainer>
                )
              )}
            </CardContent>
          </Card>

          {/* Participants per exam chart */}
          <Card>
            <CardHeader>
              <CardTitle>Participants per Exam</CardTitle>
              <CardDescription>How many participants attended each exam you created</CardDescription>
              <div className="mt-2">
                <Select value={examChartMode} onValueChange={v => setExamChartMode(v as 'all' | 'last10' | 'last20')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Exams</SelectItem>
                    <SelectItem value="last10">Last 10 Exams</SelectItem>
                    <SelectItem value="last20">Last 20 Exams</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {allExams.length === 0 ? (
                <div className="text-sm text-muted-foreground">No exam data available</div>
              ) : (
                <ChartContainer config={{ participants: { label: 'Participants', color: '#06b6d4' } }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={(() => {
                        let data = allExams.map((e: any) => ({
                          name: e.name || `Exam ${e.id}`,
                          date: e.start ? e.start.split('T')[0] : (e.date ? e.date.split('T')[0] : ''),
                          participants: e.participants || 0
                        }));
                        if (examChartMode === 'last10') data = data.slice(-10);
                        if (examChartMode === 'last20') data = data.slice(-20);
                        return data;
                      })()}
                      margin={{ top: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="participants" fill="var(--color-participants)" onClick={(d:any) => { const v = d?.value ?? d?.payload?.participants; toast({ title: 'Participants', description: String(v) }); }}>
                        <LabelList dataKey="participants" position="top" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 space-y-6">
          {/* Top Performers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Performers
              </CardTitle>
              <CardDescription className="text-xs mt-2">
                Students with highest average exam scores across all your exams
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getTopPerformers().length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">No student data available yet</div>
              ) : (
                <div className="space-y-2">
                  {getTopPerformers().map((student, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-transparent rounded-lg border border-yellow-200 hover:border-yellow-300 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500 text-white font-bold text-sm flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.examsCompleted} exams completed</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Table</p>
                          <p className="text-lg font-bold text-blue-600">{student.tableAvg}%</p>
                        </div>
                        <div className="mt-1">
                          <p className="text-xs text-muted-foreground">Findings</p>
                          <p className="text-lg font-bold text-green-600">{student.findingsAvg}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Exam Performance Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Exam Performance Summary
              </CardTitle>
              <CardDescription className="text-xs mt-2">
                Average scores, pass rates, and completion metrics for your 5 most recent exams
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentExams.slice(0, 5).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">No recent exams</div>
              ) : (
                <div className="space-y-3">
                  {recentExams.slice(0, 5).map((exam: any) => {
                    const perf = getExamPerformance(exam.id);
                    return (
                      <div key={exam.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-base truncate">{exam.name || "Untitled Exam"}</h4>
                            <p className="text-xs text-muted-foreground">
                              {exam.end ? `${formatDate(exam.start || exam.date)} - ${formatDate(exam.end)}` : formatDate(exam.start || exam.date)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => window.open(`${window.location.origin}/instructor/results?examId=${exam.id}`, '_blank')}
                            className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                          >
                            View Results
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-blue-50 rounded p-2 border border-blue-200">
                            <p className="text-xs text-muted-foreground font-semibold">Table Avg</p>
                            <p className="text-xl font-bold text-blue-600">{perf.tableAvgScore}%</p>
                          </div>
                          <div className="bg-blue-50 rounded p-2 border border-blue-200">
                            <p className="text-xs text-muted-foreground font-semibold">Table Pass</p>
                            <p className="text-xl font-bold text-blue-600">{perf.tablePassRate}%</p>
                          </div>
                          <div className="bg-green-50 rounded p-2 border border-green-200">
                            <p className="text-xs text-muted-foreground font-semibold">Findings Avg</p>
                            <p className="text-xl font-bold text-green-600">{perf.findingsAvgScore}%</p>
                          </div>
                          <div className="bg-green-50 rounded p-2 border border-green-200">
                            <p className="text-xs text-muted-foreground font-semibold">Findings Pass</p>
                            <p className="text-xl font-bold text-green-600">{perf.findingsPassRate}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-500" />
                Quick Actions
              </CardTitle>
              <CardDescription className="text-xs mt-2">
                Manage your exams, questions, and results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <Link
                  to="/instructor/create-exam"
                  className="flex flex-col items-center justify-center p-4 sm:p-6 border-2 border-dashed border-primary rounded-lg hover:bg-primary/5 transition-colors text-center"
                >
                  <Calendar className="h-7 w-7 sm:h-8 sm:w-8 text-primary mb-2" />
                  <p className="font-semibold text-sm">Create Exam</p>
                  <p className="text-xs text-muted-foreground mt-1">Set up a new exam</p>
                </Link>
                <Link
                  to="/instructor/results"
                  className="flex flex-col items-center justify-center p-4 sm:p-6 border-2 border-dashed border-blue-500 rounded-lg hover:bg-blue-500/5 transition-colors text-center"
                >
                  <TrendingUp className="h-7 w-7 sm:h-8 sm:w-8 text-blue-500 mb-2" />
                  <p className="font-semibold text-sm">View Results</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyze performance</p>
                </Link>
                <Link
                  to="/instructor/questions"
                  className="flex flex-col items-center justify-center p-4 sm:p-6 border-2 border-dashed border-purple-500 rounded-lg hover:bg-purple-500/5 transition-colors text-center"
                >
                  <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-purple-500 mb-2" />
                  <p className="font-semibold text-sm">Question Bank</p>
                  <p className="text-xs text-muted-foreground mt-1">Manage questions</p>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InstructorDashboard;
