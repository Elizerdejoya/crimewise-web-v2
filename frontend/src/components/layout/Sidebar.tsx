import { useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Book,
  CalendarClock,
  FileText,
  Home,
  Layers,
  LayoutDashboard,
  Users,
  UserCheck,
  BookOpen,
  User,
  Link as LinkIcon,
  FileSearch,
  Building2,
  CreditCard,
  Bot,
  Tags,
  Lock,
  Mail,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";

interface SidebarProps {
  subscriptionExpired?: boolean;
  onNavigation?: (path: string) => void;
}

interface NavItem {
  name: string;
  href: string | null;
  icon: any;
  isModal?: boolean;
}

const studentNavSections = [
  {
    heading: "Dashboard",
    items: [{ name: "Dashboard", href: "/student", icon: LayoutDashboard }],
  },
  {
    heading: "Exams",
    items: [
      { name: "Enter Exam", href: "/student/exams", icon: CalendarClock },
      { name: "Results", href: "/student/results", icon: FileText },
    ],
  },
];

const getUserRole = () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "admin";
    const decoded = JSON.parse(atob(token.split(".")[1]));
    return decoded.role || "admin";
  } catch {
    return "admin";
  }
};

const instructorNavSections = [
  {
    heading: "Dashboard",
    items: [{ name: "Dashboard", href: "/instructor", icon: LayoutDashboard }],
  },
  {
    heading: "AI Tools",
    items: [
      { name: "AI Assistant", href: "/instructor/ai-assistant", icon: Bot },
    ],
  },
  {
    heading: "Exam Management",
    items: [
      {
        name: "Create Exam",
        href: "/instructor/create-exam",
        icon: CalendarClock,
      },
      { name: "Exam Results", href: "/instructor/results", icon: FileSearch },
    ],
  },
  {
    heading: "Question Bank",
    items: [
      { name: "Question Bank", href: "/instructor/questions", icon: FileText },
      { name: "Keyword Pools", href: "/admin/keyword-pools", icon: Tags },
    ],
  },
];

// Messages Modal Component
const MessagesModal = () => {
  const handleGmailRedirect = () => {
    window.open("https://mail.google.com", "_blank");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex items-center px-3 py-2 text-sm rounded-md transition-colors cursor-pointer text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground">
          <Mail className="mr-3 h-4 w-4" />
          Messages
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-black">View Messages</DialogTitle>
          <DialogDescription className="text-gray-600">
            Access all messages in Gmail
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <p className="text-sm text-gray-700 mb-2">
              <strong>Super Admin Email:</strong> message.crimewise@gmail.com
            </p>
            <p className="text-xs text-gray-500">
              This email address is used for receiving all system messages and notifications.
            </p>
          </div>
          <Button 
            onClick={handleGmailRedirect}
            className="w-full bg-black hover:bg-gray-800 text-white"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Gmail
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const superAdminNavSections = [
  {
    heading: "Multi-Tenant Management",
    items: [
      { name: "Organizations", href: "/admin/organizations", icon: Building2 },
      { name: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
    ],
  },
  {
    heading: "Communication",
    items: [
      { name: "Messages", href: null, icon: Mail, isModal: true },
    ],
  },
];

const adminNavSections = [
  {
    heading: "Dashboard",
    items: [{ name: "Overview", href: "/admin", icon: LayoutDashboard }],
  },
  {
    heading: "AI Tools",
    items: [{ name: "AI Assistant", href: "/admin/ai-assistant", icon: Bot }],
  },
  {
    heading: "Manage Data",
    items: [
      { name: "Batches", href: "/admin/batches", icon: Layers },
      { name: "Classes", href: "/admin/classes", icon: BookOpen },
      { name: "Courses", href: "/admin/courses", icon: Book },
      { name: "Instructors", href: "/admin/instructors", icon: UserCheck },
      { name: "Students", href: "/admin/students", icon: Users },
    ],
  },
  {
    heading: "Manage Relations",
    items: [
      { name: "Assign Relations", href: "/admin/relations", icon: LinkIcon },
      // { name: "Assign Class-Instructor", href: "/admin/relations?type=class-instructor", icon: LinkIcon },
      // { name: "Assign Batch-Course", href: "/admin/relations?type=batch-course", icon: LinkIcon },
      // { name: "Assign Instructor-Course", href: "/admin/relations?type=instructor-course", icon: LinkIcon },
    ],
  },
  {
    heading: "Master Question Bank",
    items: [
      { name: "Question Bank", href: "/admin/questions", icon: FileText },
      { name: "Keyword Pools", href: "/admin/keyword-pools", icon: Tags },
    ],
  },
  // {
  //   heading: "Exam Results",
  //   items: [
  //     { name: "View All Results", href: "/admin/results", icon: CalendarClock },
  //   ],
  // },
  {
    heading: "User Management",
    items: [{ name: "Manage Users", href: "/admin/users", icon: User }],
  },
];

const Sidebar = ({ subscriptionExpired = false, onNavigation }: SidebarProps) => {
  const location = useLocation();
  const [role, setRole] = useState("admin");
  
  useEffect(() => {
    setRole(getUserRole());
  }, []);

  const handleItemClick = (item: any) => {
    // Allow profile access even if subscription is expired
    if (subscriptionExpired && role === "admin" && !item.href.includes("/profile")) {
      return;
    }
    
    if (onNavigation) {
      onNavigation(item.href);
    }
  };

  const isItemDisabled = (item: any) => {
    return subscriptionExpired && role === "admin" && !item.href.includes("/profile");
  };

  let navSections = adminNavSections;
  if (role === "super_admin") navSections = superAdminNavSections;
  if (role === "instructor") navSections = instructorNavSections;
  if (role === "student") navSections = studentNavSections;
  return (
    <div className="w-64 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border overflow-y-auto fixed md:sticky top-0 left-0 z-40">
      <div className="p-6 border-b border-sidebar-border/20">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">CW</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              CrimeWise
            </h2>
            <p className="text-xs text-sidebar-foreground/70 font-medium">Exam System</p>
          </div>
        </div>
      </div>
      <div className="px-3 py-2">
        {navSections.map((section) => (
          <div key={section.heading} className="mb-4">
            <div className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {section.heading}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const disabled = isItemDisabled(item);
                
                // Handle modal items
                if (item.isModal && item.name === "Messages") {
                  return <MessagesModal key={item.name} />;
                }
                
                return (
                  <div
                    key={item.name}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "flex items-center px-3 py-2 text-sm rounded-md transition-colors cursor-pointer",
                      disabled
                        ? "text-sidebar-foreground/30 cursor-not-allowed opacity-50"
                        : location.pathname === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {disabled ? (
                      <Lock className="mr-3 h-4 w-4" />
                    ) : (
                      <item.icon className="mr-3 h-4 w-4" />
                    )}
                    {item.name}
                    {disabled && <span className="ml-auto text-xs">🔒</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
