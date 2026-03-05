"use client";

import { supabase } from "./supabase";

export type DashboardApiResult<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

export function buildNextPath(pathname: string, search: string): string {
  return search ? `${pathname}${search}` : pathname;
}

export async function dashboardApiGet<T>(path: string): Promise<DashboardApiResult<T>> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) {
    return { ok: false, status: 0, error: "NEXT_PUBLIC_API_BASE_URL is not configured." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return { ok: false, status: 401, error: "No active login session was found." };
  }

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Request failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as T;
    return { ok: true, status: response.status, data: payload };
  } catch {
    return { ok: false, status: 0, error: "Network error while loading dashboard data." };
  }
}
