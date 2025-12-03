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
import { Book, Calendar, FileText } from "lucide-react";
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium">Assigned Courses</CardTitle>
                <CardDescription>Courses you're teaching</CardDescription>
              </div>
              <Book className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courses.length}</div>
              <p className="text-xs text-muted-foreground">
                {courses.map((c: any) => c.course).join(", ") || "No courses assigned"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium">Upcoming Exams</CardTitle>
                <CardDescription>Scheduled in the next 7 days</CardDescription>
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{exams.length}</div>
              <p className="text-xs text-muted-foreground">
                {exams.slice(0, 2).map((e: any) => e.name || "Untitled Exam").join(", ") || "No upcoming exams"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium">Question Bank</CardTitle>
                <CardDescription>Questions you've created</CardDescription>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{questions.length}</div>
              <p className="text-xs text-muted-foreground">
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

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Exams</CardTitle>
              <CardDescription>Quick access to your most recent exams</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm border-b">
                    <th className="pb-2">Exam Name</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Class</th>
                    <th className="pb-2">Participants</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentExams.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4">No recent exams</td></tr>
                  ) : recentExams.map((exam: any) => {
                    return (
                      <tr key={exam.id} className="border-b">
                        <td className="py-3">{exam.name || "Untitled Exam"}</td>
                        <td className="py-3">{exam.end ? `${formatDate(exam.start || exam.date)} - ${formatDate(exam.end)}` : formatDate(exam.start || exam.date)}</td>
                        <td className="py-3">{exam.class_id || exam.class || "-"}</td>
                        <td className="py-3">{exam.participants || 0}</td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => window.open(`${window.location.origin}/instructor/results?examId=${exam.id}`, '_blank')}
                            className="text-primary hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InstructorDashboard;
