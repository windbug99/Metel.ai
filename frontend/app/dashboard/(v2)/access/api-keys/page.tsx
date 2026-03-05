"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { buildNextPath, dashboardApiGet } from "../../../../../lib/dashboard-v2-client";
import StatusBadge from "../../../../../components/dashboard-v2/status-badge";

type ApiKeyItem = {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
};

export default function DashboardApiKeysPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await dashboardApiGet<{ items?: ApiKeyItem[] }>("/api/api-keys");
    if (result.status === 401) {
      const next = encodeURIComponent(buildNextPath(pathname, window.location.search));
      router.replace(`/?next=${next}`);
      setLoading(false);
      return;
    }
    if (result.status === 403) {
      setError("Access denied while loading API keys.");
      setLoading(false);
      return;
    }
    if (!result.ok || !result.data) {
      setError(result.error ?? "Failed to load API keys.");
      setLoading(false);
      return;
    }
    setItems(Array.isArray(result.data.items) ? result.data.items : []);
    setLoading(false);
  }, [pathname, router]);

  useEffect(() => {
    void fetchApiKeys();
  }, [fetchApiKeys]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === pathname) {
        void fetchApiKeys();
      }
    };
    window.addEventListener("dashboard:v2:refresh", handler as EventListener);
    return () => {
      window.removeEventListener("dashboard:v2:refresh", handler as EventListener);
    };
  }, [fetchApiKeys, pathname]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">API Keys</h1>
      <p className="text-sm text-[var(--text-secondary)]">API Keys list is now fetched in page scope.</p>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading API keys...</p> : null}
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
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.key_prefix}</td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="key" value={item.is_active ? "active" : "revoked"} />
                  </td>
                  <td className="px-4 py-3">{item.last_used_at ? new Date(item.last_used_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-[var(--muted)]" colSpan={4}>
                    No API keys found.
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
