"use client";

import { CheckCircle2, Clock, Crown, Shield, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface UsageData {
  membership: {
    tier: string;
    expiresAt: string | null;
    isWhitelisted: boolean;
    role: string;
  };
  answers: {
    used: number;
    total: number;
    resetAt: string;
    percentage: number;
  };
  papers: {
    used: number;
    total: number;
    resetAt: string;
    percentage: number;
  };
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/usage");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch usage data");
      }

      const data = await response.json();
      setUsage(data);
    } catch (err) {
      console.error("Failed to fetch usage:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMembershipBadge = () => {
    if (!usage) return null;

    if (
      usage.membership.role === "admin" ||
      usage.membership.role === "super_admin"
    ) {
      return (
        <Badge className="bg-purple-600 hover:bg-purple-700">
          <Shield className="mr-1 h-3 w-3" />
          {usage.membership.role === "super_admin" ? "SUPER ADMIN" : "ADMIN"}
        </Badge>
      );
    }

    if (usage.membership.isWhitelisted) {
      return (
        <Badge className="bg-purple-500 hover:bg-purple-600">
          <Crown className="mr-1 h-3 w-3" />
          WHITELIST
        </Badge>
      );
    }

    const tierColors = {
      basic: "bg-blue-500 hover:bg-blue-600",
      premium: "bg-amber-500 hover:bg-amber-600",
    };

    const tierColor =
      tierColors[usage.membership.tier as keyof typeof tierColors] ||
      "bg-blue-500";

    return (
      <Badge className={tierColor}>{usage.membership.tier.toUpperCase()}</Badge>
    );
  };

  const isMembershipActive =
    usage?.membership.expiresAt &&
    new Date(usage.membership.expiresAt) > new Date();

  const isUnlimited =
    usage?.membership.isWhitelisted ||
    usage?.membership.role === "admin" ||
    usage?.membership.role === "super_admin";

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Skeleton className="mb-6 h-10 w-48" />
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">
              Error Loading Usage Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
            <button
              onClick={fetchUsage}
              className="mt-4 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <p>No usage data available.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-3xl font-bold">My Usage</h1>

      {/* Membership Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Membership Status</span>
            {getMembershipBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isUnlimited ? (
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-purple-600" />
              <p className="font-medium text-purple-600">
                Unlimited access
                {usage.membership.role === "admin" ||
                usage.membership.role === "super_admin"
                  ? " (Administrator)"
                  : " (Whitelist user)"}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                {isMembershipActive ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                )}
                <span className="font-medium">
                  {usage.membership.tier.charAt(0).toUpperCase() +
                    usage.membership.tier.slice(1)}{" "}
                  Membership
                </span>
              </div>
              {usage.membership.expiresAt && (
                <p className="text-sm text-muted-foreground">
                  {isMembershipActive ? "Expires" : "Expired"} on:{" "}
                  {formatDate(usage.membership.expiresAt)}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Answer Views Quota Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Answer Views</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium">
                  {isUnlimited
                    ? "Unlimited"
                    : `${usage.answers.used} / ${usage.answers.total} answers viewed`}
                </span>
                {!isUnlimited && (
                  <span className="text-sm text-muted-foreground">
                    {usage.answers.percentage}%
                  </span>
                )}
              </div>
              {!isUnlimited && (
                <Progress
                  value={usage.answers.percentage}
                  className={
                    usage.answers.percentage >= 90
                      ? "[&>div]:bg-red-500"
                      : usage.answers.percentage >= 70
                        ? "[&>div]:bg-yellow-500"
                        : "[&>div]:bg-green-500"
                  }
                />
              )}
            </div>
            {!isUnlimited && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Resets on: {formatDate(usage.answers.resetAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Paper Generation Quota Card */}
      <Card>
        <CardHeader>
          <CardTitle>Paper Generation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium">
                  {isUnlimited
                    ? "Unlimited"
                    : `${usage.papers.used} / ${usage.papers.total} papers generated`}
                </span>
                {!isUnlimited && (
                  <span className="text-sm text-muted-foreground">
                    {usage.papers.percentage}%
                  </span>
                )}
              </div>
              {!isUnlimited && (
                <Progress
                  value={usage.papers.percentage}
                  className={
                    usage.papers.percentage >= 90
                      ? "[&>div]:bg-red-500"
                      : usage.papers.percentage >= 70
                        ? "[&>div]:bg-yellow-500"
                        : "[&>div]:bg-green-500"
                  }
                />
              )}
            </div>
            {!isUnlimited && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Resets on: {formatDate(usage.papers.resetAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
