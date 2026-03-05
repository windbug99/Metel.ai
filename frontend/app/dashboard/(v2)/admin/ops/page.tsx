"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../../../lib/supabase";

type PermissionSnapshot = {
  role: string;
};

export default function DashboardAdminOpsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (!apiBaseUrl) {
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/me/permissions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as PermissionSnapshot;
      setRole(payload.role ?? null);
      setLoading(false);
    };
    void run();
  }, []);

  const ownerOnlyDisabled = role !== "owner";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin / Ops</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Admin / Ops route is ready. Feature modules (diagnostics, health, incident controls) will be migrated next.
      </p>
      <div className="ds-card p-4 text-sm text-[var(--text-secondary)]">
        <p className="mb-3">role: {loading ? "loading" : role ?? "unknown"}</p>
        <button
          type="button"
          disabled={ownerOnlyDisabled}
          className="ds-btn h-11 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-xs"
        >
          Save Incident Banner (owner-only)
        </button>
        {ownerOnlyDisabled ? <p className="mt-2 text-xs text-[var(--muted)]">Owner role required.</p> : null}
      </div>
    </section>
  );
}
