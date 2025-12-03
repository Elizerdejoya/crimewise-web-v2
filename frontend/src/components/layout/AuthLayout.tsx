
import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-crimewise-navy">CrimeWiseSystem</h1>
          <p className="text-sm text-muted-foreground">Criminology Examination Platform</p>
        </div>
        <Card>
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthLayout;
