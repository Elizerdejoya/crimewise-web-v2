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
  Activity,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [events, setEvents] = useState<any[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const { toast } = useToast();
  const currentUser = getCurrentUser();

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/events?limit=20`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      // Filter to show only exam and question creation
      const filtered = Array.isArray(data) ? data.filter((e: any) => 
        e.action === 'create_exam' || e.action === 'create_question'
      ) : [];
      setEvents(filtered);
    } catch (err) {
      console.error("Failed to fetch events:", err);
      toast({
        title: "Error",
        description: "Failed to fetch activity log.",
        variant: "destructive",
      });
    } finally {
      setLoadingEvents(false);
    }
  };

 

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'create_user': 'Created User',
      'delete_user': 'Deleted User',
      'create_student': 'Added Student',
      'delete_student': 'Removed Student',
      'create_question': 'Created Question',
      'delete_question': 'Deleted Question',
      'create_exam': 'Created Exam',
      'delete_exam': 'Deleted Exam',
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    if (action.startsWith('create')) return 'bg-green-100 text-green-800 border-l-green-500';
    if (action.startsWith('delete')) return 'bg-red-100 text-red-800 border-l-red-500';
    return 'bg-blue-100 text-blue-800 border-l-blue-500';
  };

  const handleRefresh = () => {
    fetchEvents();
  };

  useEffect(() => {
    authenticatedFetch(`${API_BASE_URL}/api/admin/overview-counts`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data) setCounts(data);
      })
      .catch((err) => {
        console.error("Failed to fetch overview counts:", err);
      })
      .finally(() => setLoadingCounts(false));
    fetchEvents();
  }, []);


  const user = currentUser;

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p>Please log in to access the dashboard.</p>
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

        {/* Stats Cards */}
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
                <div className="text-2xl font-bold">{counts[card.key] ?? (loadingCounts ? "..." : "-")}</div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Activity Feed - Exams & Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Activity Feed</CardTitle>
              <CardDescription>
                Recent exam and question creations by instructors
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={loadingEvents}
            >
              <RefreshCw className={`h-4 w-4 ${loadingEvents ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              {loadingEvents ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Loading activity...</p>
                </div>
              ) : events.length === 0 ? (
                <div className="text-center text-sm py-8 text-muted-foreground">
                  No recent activity
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event: any) => (
                    <div key={event.id} className={`border-l-4 p-3 rounded ${getActionColor(event.action)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {getActionLabel(event.action)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {event.actor_role === 'admin' ? '👨‍💼 Admin' : event.actor_role === 'instructor' ? '👨‍🏫 Instructor' : '👤 User'}{' '}
                            {event.actor_id}
                          </p>
                          {event.details && typeof event.details === 'object' && (
                            <div className="text-xs text-muted-foreground mt-2 bg-black/5 p-2 rounded">
                              {Object.entries(event.details)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(' • ')}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {new Date(event.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
