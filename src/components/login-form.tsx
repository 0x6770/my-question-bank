"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Update this route to redirect to an authenticated route. The user already has an active session.
      router.push("/");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
        <CardHeader className="gap-3 px-8 pb-4 pt-8">
          <CardTitle className="text-3xl font-semibold tracking-tight text-slate-800">
            Login
          </CardTitle>
          <CardDescription className="text-base text-slate-500">
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-2">
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label
                  className="text-sm font-semibold text-slate-600"
                  htmlFor="email"
                >
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-slate-200 bg-white/80 pl-11 text-base text-slate-700 shadow-sm focus-visible:ring-slate-300/40"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label
                  className="text-sm font-semibold text-slate-600"
                  htmlFor="password"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-slate-200 bg-white/80 px-4 text-base text-slate-700 shadow-sm focus-visible:ring-slate-300/40"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-base font-semibold text-white shadow-sm transition-shadow hover:shadow-md"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
