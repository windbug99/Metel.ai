"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { buildNextPath, dashboardApiGet } from "../../../../../lib/dashboard-v2-client";
import StatusBadge from "../../../../../components/dashboard-v2/status-badge";

type AuditEventItem = {
  id: number;
  request_id: string | null;
  timestamp: string;
  action?: { tool_name?: string | null };
  outcome?: { decision?: string | null; error_code?: string | null };
};

type PermissionSnapshot = {
  role: string;
};

export default function DashboardAuditEventsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const fetchAuditEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await dashboardApiGet<{ items?: AuditEventItem[] }>("/api/audit/events?limit=20&status=all");
    if (result.status === 401) {
      const next = encodeURIComponent(buildNextPath(pathname, window.location.search));
      router.replace(`/?next=${next}`);
      setLoading(false);
      return;
    }
    if (result.status === 403) {
      setError("Access denied while loading audit events.");
      setLoading(false);
      return;
    }
    if (!result.ok || !result.data) {
      setError(result.error ?? "Failed to load audit events.");
      setLoading(false);
      return;
    }
    setItems(Array.isArray(result.data.items) ? result.data.items : []);

    const permissionResult = await dashboardApiGet<PermissionSnapshot>("/api/me/permissions");
    if (permissionResult.ok && permissionResult.data) {
      setRole(permissionResult.data.role ?? null);
    }
    setLoading(false);
  }, [pathname, router]);

  useEffect(() => {
    void fetchAuditEvents();
  }, [fetchAuditEvents]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === pathname) {
        void fetchAuditEvents();
      }
    };
    window.addEventListener("dashboard:v2:refresh", handler as EventListener);
    return () => {
      window.removeEventListener("dashboard:v2:refresh", handler as EventListener);
    };
  }, [fetchAuditEvents, pathname]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Events</h1>
      <p className="text-sm text-[var(--text-secondary)]">Audit events are fetched and refreshed in page scope.</p>
      <div className="ds-card p-4">
        <button
          type="button"
          disabled={role !== "owner"}
          className="ds-btn h-11 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-xs"
        >
          Update Audit Settings (owner-only)
        </button>
        {role !== "owner" ? <p className="mt-2 text-xs text-[var(--muted)]">Owner role required.</p> : null}
      </div>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading audit events...</p> : null}
      {error ? (
        <div className="rounded-md border border-[var(--danger-500)]/40 bg-[color-mix(in_srgb,var(--danger-500)_12%,white)] px-3 py-2 text-sm text-[var(--danger-500)]">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="ds-card overflow-x-auto">
          <table className="min-w-[640px] text-sm">
            <thead className="bg-[var(--surface-subtle)] text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.action?.tool_name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="decision" value={item.outcome?.decision} />
                  </td>
                  <td className="px-4 py-3">{item.outcome?.error_code ?? "-"}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-[var(--muted)]" colSpan={4}>
                    No audit events found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
