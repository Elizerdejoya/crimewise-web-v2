import { ReactNode, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Menu, UserCircle } from "lucide-react";
import Sidebar from "./Sidebar";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { getCurrentUser, isTokenExpired, clearAuthAndRedirect, authenticatedFetch } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hasSidebarPreference, setHasSidebarPreference] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  // Detect user role from JWT token and check for expiration
  useEffect(() => {
    // Check if token is expired
    if (isTokenExpired()) {
      console.log("[DashboardLayout] Token expired, redirecting to login");
      clearAuthAndRedirect();
      return;
    }

    const user = getCurrentUser();
    if (user) {
      setUserRole(user.role || "");
      
      // Check subscription status for admin users
      if (user.role === "admin") {
        checkSubscriptionStatus();
      }
    }
  }, []);

  // Check subscription status for admin users
  const checkSubscriptionStatus = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/subscriptions/my-status`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionExpired(data.isExpired || !data.hasActiveSubscription);
      }
    } catch (error) {
      console.error("Failed to check subscription status:", error);
      // Don't block navigation if we can't check subscription status
    }
  };

  // Refresh subscription status (can be called externally)
  const refreshSubscriptionStatus = () => {
    if (userRole === "admin") {
      checkSubscriptionStatus();
    }
  };

  // Expose refresh function globally for other components to use
  useEffect(() => {
    (window as any).refreshSubscriptionStatus = refreshSubscriptionStatus;
    return () => {
      delete (window as any).refreshSubscriptionStatus;
    };
  }, [userRole]);

  // Only set initial sidebar state based on screen size, but don't override user preference
  useEffect(() => {
    const handleResize = () => {
      // Only apply the automatic sizing if the user hasn't made a choice yet
      if (!hasSidebarPreference) {
        setSidebarOpen(window.innerWidth >= 768);
      }
    };

    // Initial check
    handleResize();

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Clean up
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [hasSidebarPreference]);

  const handleLogout = () => {
    clearAuthAndRedirect();
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
    setHasSidebarPreference(true); // User has made a choice, remember it
  };

  const handleProfileClick = () => {
    // Allow profile access even if subscription is expired
    // if (userRole) {
    //   navigate(`/${userRole}/profile`);
    // }
      if (userRole) {
      // super_admin shares the admin profile view — route to /admin/profile
      if (userRole === "super_admin") {
        navigate(`/admin/profile`);
      } else {
        navigate(`/${userRole}/profile`);
      }
    }
    
  };

  const handleSidebarNavigation = (path: string) => {
    // Block navigation if subscription is expired (except for profile)
    if (subscriptionExpired && userRole === "admin" && !path.includes("/profile")) {
      return;
    }
    navigate(path);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Overlay to close sidebar when clicked outside on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => {
            setSidebarOpen(false);
            setHasSidebarPreference(true);
          }}
        />
      )}

      {/* Sidebar with proper display handling */}
      <div
        className={`${sidebarOpen ? "block" : "hidden"} md:${
          sidebarOpen ? "block" : "hidden"
        } z-40`}
      >
        <Sidebar 
          subscriptionExpired={subscriptionExpired}
          onNavigation={handleSidebarNavigation}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1">
        <header className="sticky top-0 z-20 bg-background border-b border-border h-16 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">CrimeWiseSystem</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleProfileClick}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Main content area with padding */}
        <main className="flex-1 p-6">
          {/* Show subscription banner only for admin users - positioned prominently at top */}
          {userRole === "admin" && (
            <div className="sticky top-0 z-10 -mt-6 mb-6 mx-4 mt-4">
              <SubscriptionBanner />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
