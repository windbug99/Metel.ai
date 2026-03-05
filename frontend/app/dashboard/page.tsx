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
    const query = window.location.search || "";
    router.replace(`${mapped}${query}`);
  }, [router]);

  return <p className="p-6 text-sm text-slate-500">Redirecting dashboard...</p>;
}
