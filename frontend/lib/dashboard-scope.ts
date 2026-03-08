"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";

export type DashboardScope = "org" | "team" | "user";

export type ResolvedDashboardScope = {
  scope: DashboardScope;
  organizationId: number | null;
  teamId: number | null;
};

function toPositiveInt(value: string | null): number | null {
  const text = String(value ?? "").trim();
  if (!text || text === "all") {
    return null;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

export function resolveDashboardScope(searchParams: ReadonlyURLSearchParams): ResolvedDashboardScope {
  const rawScope = String(searchParams.get("scope") ?? "").trim().toLowerCase();
  const scope: DashboardScope = rawScope === "org" || rawScope === "team" || rawScope === "user" ? rawScope : "user";

  const organizationId = toPositiveInt(searchParams.get("org"));
  const teamId = toPositiveInt(searchParams.get("team"));

  if (scope === "org" && organizationId !== null) {
    return { scope, organizationId, teamId: null };
  }
  if (scope === "team" && organizationId !== null && teamId !== null) {
    return { scope, organizationId, teamId };
  }
  return { scope: "user", organizationId: null, teamId: null };
}
