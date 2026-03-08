"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const HASH_TO_ROUTE: Record<string, string> = {
  "#overview": "/dashboard/overview",
  "#api-keys": "/dashboard/access/api-keys",
  "#audit-events": "/dashboard/control/audit-events",
};

export default function DashboardRootPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash || "";
    const mapped = HASH_TO_ROUTE[hash] ?? "/dashboard/overview";
    const params = new URLSearchParams(window.location.search);
    if (!params.get("scope")) {
      params.set("scope", "user");
    }
    const query = params.toString();
    router.replace(query ? `${mapped}?${query}` : mapped);
  }, [router]);

  return <p className="p-6 text-sm text-slate-500">Redirecting dashboard...</p>;
}
