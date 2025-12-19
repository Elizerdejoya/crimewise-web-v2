import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/lib/auth";
import AuthLayout from "@/components/layout/AuthLayout";
import { API_BASE_URL } from "@/lib/config";
import logoImage from "@/assets/logo.png";
import { Eye, EyeOff } from "lucide-react";
import { LogIn } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // On mount, check if user is already logged in and redirect, or load remembered email
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      // User is already logged in, redirect to appropriate dashboard
      if (user.role === 'admin' || user.role === 'super_admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'instructor') {
        navigate('/instructor', { replace: true });
      } else if (user.role === 'student') {
        navigate('/student', { replace: true });
      }
    }
    // Load remembered email if it exists
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setIsLoading(false);

      if (res.ok) {
        localStorage.setItem("token", data.token);
        // Save email if remember me is checked
        if (rememberMe) {
          localStorage.setItem("rememberedEmail", email);
        } else {
          localStorage.removeItem("rememberedEmail");
        }
        // Redirect based on role from server response
        if (data.role === "super_admin") navigate("/admin/organizations");
        else if (data.role === "admin") navigate("/admin");
        else if (data.role === "instructor") navigate("/instructor");
        else if (data.role === "student") navigate("/student");
        else navigate("/");
      } else {
        toast({
          title: "Invalid credentials",
          description:
            data.error || "Please check your email and password.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Server error. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <AuthLayout>
      <div className="relative mb-6">
        <div className="absolute -left-24 -top-24 w-64 h-64 rounded-full bg-gradient-to-r from-primary/40 to-indigo-300 blur-3xl opacity-60 animate-pulse pointer-events-none"></div>
        <div className="absolute -right-20 -bottom-20 w-56 h-56 rounded-full bg-gradient-to-r from-rose-300 to-yellow-200 blur-3xl opacity-60 animate-pulse pointer-events-none"></div>
        <div className="flex flex-col items-center z-10 relative">
          <img
            src={logoImage}
            alt="Logo"
            className="w-24 h-24 mb-3 rounded-full p-2 bg-white/60 shadow-md transition-transform duration-300 hover:scale-105"
          />
          <h1 className="text-2xl font-extrabold text-center">
            Online Forensic Examination
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            LSPU - CCJE Department
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="transition-shadow duration-200 focus:shadow-lg focus:shadow-primary/30"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password">Password</Label>
            <a href="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors duration-200">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10 transition-shadow duration-200 focus:shadow-lg focus:shadow-primary/30"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="sr-only">
                {showPassword ? "Hide password" : "Show password"}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            className="transition-all duration-200"
          />
          <label
            htmlFor="remember"
            className="text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors duration-200"
          >
            Remember me
          </label>
        </div>

        <Button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-primary hover:scale-[1.01] active:scale-95 transition-transform duration-150"
          disabled={isLoading}
        >
          {isLoading ? (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              ></path>
            </svg>
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          <span>{isLoading ? "Signing in..." : "Sign in"}</span>
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
