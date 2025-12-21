
import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-56 -top-56 w-96 h-96 rounded-full bg-primary/10 blur-3xl opacity-60"></div>
        <div className="absolute -right-56 -bottom-56 w-96 h-96 rounded-full bg-rose-200/10 blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-lg p-6 z-10">
        <Card className="rounded-2xl shadow-2xl border border-white/10 bg-white/60 backdrop-blur-md">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold text-crimewise-navy">CrimeWiseSystem</h1>
              <p className="text-sm text-muted-foreground">Criminology Examination Platform</p>
            </div>
            <div className="px-4 py-2">
              {children}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthLayout;
