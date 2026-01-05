"use client";

import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";

interface QuotaConfig {
  id: number;
  free_answer_quota: number;
  free_answer_period_days: number;
  free_paper_quota: number;
  free_paper_period_days: number;
  basic_answer_quota: number;
  basic_answer_period_days: number;
  basic_paper_quota: number;
  basic_paper_period_days: number;
  premium_answer_quota: number;
  premium_answer_period_days: number;
  premium_paper_quota: number;
  premium_paper_period_days: number;
  updated_at: string;
}

export default function PermissionsPage() {
  const [config, setConfig] = useState<QuotaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/permissions");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load configuration");
      }

      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Error loading configuration:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load configuration",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save configuration");
      }

      const result = await response.json();
      setConfig(result.data);
      toast.success("Configuration saved successfully");
    } catch (error) {
      console.error("Error saving configuration:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  const renderTierConfig = (
    tier: "free" | "basic" | "premium",
    label: string,
    description: string,
  ) => {
    if (!config) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle>{label} Tier</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${tier}-answer-quota`}>Answer Views Quota</Label>
            <Input
              id={`${tier}-answer-quota`}
              type="number"
              min="0"
              value={config[`${tier}_answer_quota`]}
              onChange={(e) =>
                setConfig({
                  ...config,
                  [`${tier}_answer_quota`]: parseInt(e.target.value, 10) || 0,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Max answers viewable per period
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${tier}-answer-period`}>
              Answer Period (Days)
            </Label>
            <Input
              id={`${tier}-answer-period`}
              type="number"
              min="1"
              value={config[`${tier}_answer_period_days`]}
              onChange={(e) =>
                setConfig({
                  ...config,
                  [`${tier}_answer_period_days`]:
                    parseInt(e.target.value, 10) || 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Days before quota resets
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${tier}-paper-quota`}>
              Paper Generation Quota
            </Label>
            <Input
              id={`${tier}-paper-quota`}
              type="number"
              min="0"
              value={config[`${tier}_paper_quota`]}
              onChange={(e) =>
                setConfig({
                  ...config,
                  [`${tier}_paper_quota`]: parseInt(e.target.value, 10) || 0,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Max papers generable per period
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${tier}-paper-period`}>Paper Period (Days)</Label>
            <Input
              id={`${tier}-paper-period`}
              type="number"
              min="1"
              value={config[`${tier}_paper_period_days`]}
              onChange={(e) =>
                setConfig({
                  ...config,
                  [`${tier}_paper_period_days`]:
                    parseInt(e.target.value, 10) || 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Days before quota resets
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl p-8">
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="space-y-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container mx-auto max-w-6xl p-8">
        <p>Failed to load configuration.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quota Configuration</h1>
          <p className="mt-2 text-muted-foreground">
            Manage global quota settings for each membership tier
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <div className="space-y-6">
        {renderTierConfig("basic", "Basic", "Default tier for all users")}
        {renderTierConfig("premium", "Premium", "Premium membership tier")}
      </div>

      <div className="mt-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-800">Important Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-700">
            <p>
              • Changes apply immediately to all users in the respective tier
            </p>
            <p>
              • Existing quota usage is not affected - only new periods use
              updated values
            </p>
            <p>• Admin and whitelisted users bypass all quota restrictions</p>
            <p>• Set quota to 0 to disable a feature for a tier</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
