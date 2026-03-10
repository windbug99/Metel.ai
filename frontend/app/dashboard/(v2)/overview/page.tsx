"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";

import { buildNextPath, dashboardApiGet } from "../../../../lib/dashboard-v2-client";
import { resolveDashboardScope } from "../../../../lib/dashboard-scope";
import PageTitleWithTooltip from "@/components/dashboard-v2/page-title-with-tooltip";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type OverviewPayload = {
  window_hours: number;
  kpis: {
    total_calls: number;
    success_rate: number;
    fail_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    retry_rate?: number;
    policy_block_rate?: number;
  };
  top?: {
    called_tools?: Array<{ tool_name: string; count: number }>;
    failed_tools?: Array<{ tool_name: string; count: number }>;
    blocked_tools?: Array<{ tool_name: string; count: number }>;
  };
  anomalies?: Array<{
    type: string;
    severity: string;
    message: string;
    context?: Record<string, unknown>;
  }>;
};

const CHART_COLORS = {
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
};

export default function DashboardOverviewPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scopeState = resolveDashboardScope(searchParams);
  const scopeLabel =
    scopeState.scope === "team"
      ? `Team Scope (org=${scopeState.organizationId ?? "-"}, team=${scopeState.teamId ?? "-"})`
      : scopeState.scope === "org"
      ? `Organization Scope (org=${scopeState.organizationId ?? "-"})`
      : "User Scope (me)";

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    const range = searchParams.get("range") === "7d" ? 168 : 24;
    const params = new URLSearchParams();
    params.set("hours", String(range));
    if (scopeState.organizationId !== null) {
      params.set("organization_id", String(scopeState.organizationId));
    }
    if (scopeState.teamId !== null) {
      params.set("team_id", String(scopeState.teamId));
    }

    const result = await dashboardApiGet<OverviewPayload>(`/api/tool-calls/overview?${params.toString()}`);
    if (result.status === 401) {
      const next = encodeURIComponent(buildNextPath(pathname, window.location.search));
      router.replace(`/?next=${next}`);
      setLoading(false);
      return;
    }
    if (result.status === 403) {
      setError("Access denied while loading overview.");
      setLoading(false);
      return;
    }
    if (!result.ok || !result.data) {
      setError(result.error ?? "Failed to load overview metrics.");
      setLoading(false);
      return;
    }

    setData(result.data);
    setLoading(false);
  }, [pathname, router, scopeState.organizationId, scopeState.teamId, searchParams]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === pathname) {
        void fetchOverview();
      }
    };
    window.addEventListener("dashboard:v2:refresh", handler as EventListener);
    return () => {
      window.removeEventListener("dashboard:v2:refresh", handler as EventListener);
    };
  }, [fetchOverview, pathname]);

  const successRate = Math.max(0, Math.min(100, (data?.kpis.success_rate ?? 0) * 100));
  const failRate = Math.max(0, Math.min(100, (data?.kpis.fail_rate ?? 0) * 100));
  const retryRate = Math.max(0, Math.min(100, (data?.kpis.retry_rate ?? 0) * 100));
  const policyBlockRate = Math.max(0, Math.min(100, (data?.kpis.policy_block_rate ?? 0) * 100));

  const topCalledChart = useMemo(
    () => (data?.top?.called_tools ?? []).slice(0, 5).map((item) => ({ name: item.tool_name, value: item.count })),
    [data?.top?.called_tools]
  );
  const topFailedChart = useMemo(
    () => (data?.top?.failed_tools ?? []).slice(0, 5).map((item) => ({ name: item.tool_name, value: item.count })),
    [data?.top?.failed_tools]
  );
  const topBlockedChart = useMemo(
    () => (data?.top?.blocked_tools ?? []).slice(0, 5).map((item) => ({ name: item.tool_name, value: item.count })),
    [data?.top?.blocked_tools]
  );
  const anomalyBySeverity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const anomaly of data?.anomalies ?? []) {
      const severity = (anomaly.severity || "unknown").toLowerCase();
      counts.set(severity, (counts.get(severity) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([severity, count]) => ({ severity, count }));
  }, [data?.anomalies]);

  if (loading) {
    return (
      <section className="space-y-4">
        <PageTitleWithTooltip title="Overview" tooltip="View scope-specific usage KPIs, top tools, and anomalies." />
        <p className="text-sm text-muted-foreground">{scopeLabel}</p>
        <div className="ds-card flex min-h-[220px] items-center justify-center p-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageTitleWithTooltip title="Overview" tooltip="View scope-specific usage KPIs, top tools, and anomalies." />
      <p className="text-sm text-muted-foreground">{scopeLabel}</p>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">Total Calls</p>
              <p className="mt-2 text-2xl font-semibold">{data.kpis.total_calls}</p>
              <ChartContainer
                className="mt-2 h-20 w-full"
                config={{ calls: { label: "Calls", color: CHART_COLORS.blue } }}
              >
                <BarChart data={[{ label: "calls", calls: data.kpis.total_calls }]}>
                  <Bar dataKey="calls" fill="var(--color-calls)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            </article>
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="mt-2 text-2xl font-semibold text-chart-2">{successRate.toFixed(1)}%</p>
              <ChartContainer
                className="mt-2 h-20 w-full"
                config={{ success: { label: "Success Rate", color: CHART_COLORS.green } }}
              >
                <RadialBarChart data={[{ name: "success", success: successRate }]} innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} dataKey="success" tick={false} />
                  <RadialBar dataKey="success" cornerRadius={10} fill="var(--color-success)" background />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </RadialBarChart>
              </ChartContainer>
            </article>
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">Fail Rate</p>
              <p className="mt-2 text-2xl font-semibold text-destructive">{failRate.toFixed(1)}%</p>
              <ChartContainer
                className="mt-2 h-20 w-full"
                config={{ fail: { label: "Fail Rate", color: CHART_COLORS.red } }}
              >
                <RadialBarChart data={[{ name: "fail", fail: failRate }]} innerRadius="62%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} dataKey="fail" tick={false} />
                  <RadialBar dataKey="fail" cornerRadius={10} fill="var(--color-fail)" background />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </RadialBarChart>
              </ChartContainer>
            </article>
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="mt-2 text-2xl font-semibold">{Math.round(data.kpis.avg_latency_ms)} ms</p>
            </article>
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">P95 Latency</p>
              <p className="mt-2 text-2xl font-semibold">{Math.round(data.kpis.p95_latency_ms)} ms</p>
            </article>
            <article className="ds-card p-4">
              <p className="text-xs text-muted-foreground">Retry / Policy Block</p>
              <p className="mt-2 text-lg font-semibold">
                {retryRate.toFixed(1)}% / {policyBlockRate.toFixed(1)}%
              </p>
              <ChartContainer
                className="mt-2 h-20 w-full"
                config={{
                  retry: { label: "Retry", color: CHART_COLORS.cyan },
                  blocked: { label: "Policy Block", color: CHART_COLORS.violet },
                }}
              >
                <BarChart data={[{ label: "rate", retry: retryRate, blocked: policyBlockRate }]}>
                  <Bar dataKey="retry" fill="var(--color-retry)" radius={4} />
                  <Bar dataKey="blocked" fill="var(--color-blocked)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
            </article>
          </div>

          <div className="ds-card p-4">
            <p className="text-sm font-semibold">Latency Compare</p>
            <ChartContainer
              className="mt-3 h-56 w-full"
              config={{
                avg: { label: "Avg Latency", color: CHART_COLORS.blue },
                p95: { label: "P95 Latency", color: CHART_COLORS.amber },
              }}
            >
              <BarChart
                data={[
                  { name: "latency", avg: Math.round(data.kpis.avg_latency_ms), p95: Math.round(data.kpis.p95_latency_ms) },
                ]}
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tick={false} />
                <YAxis />
                <Bar dataKey="avg" fill="var(--color-avg)" radius={4} />
                <Bar dataKey="p95" fill="var(--color-p95)" radius={4} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="ds-card p-4">
              <p className="text-sm font-semibold">Top Called Tools</p>
              <ChartContainer className="mt-2 h-52 w-full" config={{ value: { label: "Calls", color: CHART_COLORS.blue } }}>
                <BarChart data={topCalledChart} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={90} tickLine={false} axisLine={false} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
              {topCalledChart.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No data.</p> : null}
            </article>
            <article className="ds-card p-4">
              <p className="text-sm font-semibold">Top Failed Tools</p>
              <ChartContainer className="mt-2 h-52 w-full" config={{ value: { label: "Fails", color: CHART_COLORS.red } }}>
                <BarChart data={topFailedChart} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={90} tickLine={false} axisLine={false} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
              {topFailedChart.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No data.</p> : null}
            </article>
            <article className="ds-card p-4">
              <p className="text-sm font-semibold">Top Blocked Tools</p>
              <ChartContainer className="mt-2 h-52 w-full" config={{ value: { label: "Blocked", color: CHART_COLORS.violet } }}>
                <BarChart data={topBlockedChart} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={90} tickLine={false} axisLine={false} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
              {topBlockedChart.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No data.</p> : null}
            </article>
          </div>

          {(data.anomalies ?? []).length > 0 ? (
            <div className="rounded-md border border-chart-4/40 bg-chart-4/10 p-3">
              <p className="text-xs font-medium text-chart-4">Recent anomalies</p>
              <ChartContainer
                className="mt-2 h-44 w-full"
                config={{ count: { label: "Count", color: CHART_COLORS.violet } }}
              >
                <BarChart data={anomalyBySeverity} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="severity" />
                  <YAxis allowDecimals={false} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                </BarChart>
              </ChartContainer>
              <div className="mt-2 space-y-1">
                {(data.anomalies ?? []).slice(0, 8).map((anomaly, idx) => (
                  <p key={`${anomaly.type}-${idx}`} className="text-xs text-muted-foreground">
                    [{anomaly.severity}] {anomaly.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
