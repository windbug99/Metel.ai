"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buildNextPath, dashboardApiGet } from "../../../../lib/dashboard-v2-client";

type OverviewPayload = {
  window_hours: number;
  kpis: {
    total_calls: number;
    success_rate: number;
    fail_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
};

export default function DashboardOverviewPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    const range = searchParams.get("range") === "7d" ? 168 : 24;
    const result = await dashboardApiGet<OverviewPayload>(`/api/tool-calls/overview?window_hours=${range}`);
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
  }, [pathname, router, searchParams]);

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

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-sm text-[var(--text-secondary)]">KPI summary is loaded per page route and refreshed in page scope.</p>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading overview...</p> : null}
      {error ? (
        <div className="rounded-md border border-[var(--danger-500)]/40 bg-[color-mix(in_srgb,var(--danger-500)_12%,white)] px-3 py-2 text-sm text-[var(--danger-500)]">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="ds-card p-4">
            <p className="text-xs text-[var(--muted)]">Total Calls</p>
            <p className="mt-2 text-2xl font-semibold">{data.kpis.total_calls}</p>
          </article>
          <article className="ds-card p-4">
            <p className="text-xs text-[var(--muted)]">Success Rate</p>
            <p className="mt-2 text-2xl font-semibold">{(data.kpis.success_rate * 100).toFixed(1)}%</p>
          </article>
          <article className="ds-card p-4">
            <p className="text-xs text-[var(--muted)]">Fail Rate</p>
            <p className="mt-2 text-2xl font-semibold">{(data.kpis.fail_rate * 100).toFixed(1)}%</p>
          </article>
          <article className="ds-card p-4">
            <p className="text-xs text-[var(--muted)]">P95 Latency</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(data.kpis.p95_latency_ms)} ms</p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
