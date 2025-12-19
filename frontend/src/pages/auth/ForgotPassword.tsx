import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import AuthLayout from "@/components/layout/AuthLayout";
import { API_BASE_URL } from "@/lib/config";
import logoImage from "@/assets/logo.png";
import { ArrowLeft, Mail } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setIsLoading(false);

      if (res.ok) {
        setIsSubmitted(true);
        toast({
          title: "Success",
          description: "Check your email for password reset instructions.",
        });
      } else {
        toast({
          title: "Error",
          description:
            data.error || "Failed to process request. Please try again.",
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

  if (isSubmitted) {
    return (
      <AuthLayout>
        <div className="relative mb-6">
          <div className="absolute -left-24 -top-24 w-64 h-64 rounded-full bg-gradient-to-r from-primary/40 to-indigo-300 blur-3xl opacity-60 animate-pulse pointer-events-none"></div>
          <div className="absolute -right-20 -bottom-20 w-56 h-56 rounded-full bg-gradient-to-r from-rose-300 to-yellow-200 blur-3xl opacity-60 animate-pulse pointer-events-none"></div>
          <div className="flex flex-col items-center z-10 relative">
            <div className="w-24 h-24 mb-3 rounded-full p-2 bg-white/60 shadow-md flex items-center justify-center">
              <Mail className="w-12 h-12 text-primary animate-bounce" />
            </div>
            <h1 className="text-2xl font-extrabold text-center">
              Check Your Email
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              Password reset instructions sent
            </p>
          </div>
        </div>

        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            We've sent a password reset link to <span className="font-semibold text-foreground">{email}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Check your spam folder if you don't see the email within a few minutes.
          </p>

          <Button
            onClick={() => navigate("/login")}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:scale-[1.01] active:scale-95 transition-transform duration-150"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Login</span>
          </Button>
        </div>
      </AuthLayout>
    );
  }

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
            Reset Password
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Enter your email to receive reset instructions
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
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
            <Mail className="h-4 w-4" />
          )}
          <span>{isLoading ? "Sending..." : "Send Reset Link"}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full flex items-center justify-center gap-2 transition-colors duration-200"
          onClick={() => navigate("/login")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Login</span>
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
