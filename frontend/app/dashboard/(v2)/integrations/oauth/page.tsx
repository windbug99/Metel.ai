"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buildNextPath, dashboardApiGet, dashboardApiRequest } from "../../../../../lib/dashboard-v2-client";
import { resolveDashboardScope } from "../../../../../lib/dashboard-scope";

type OAuthStatus = {
  connected: boolean;
  integration?: {
    workspace_name?: string | null;
    workspace_id?: string | null;
    updated_at?: string | null;
  } | null;
};

type OAuthStartPayload = {
  ok: boolean;
  auth_url: string;
};

type OrganizationOAuthPolicy = {
  allowed_providers?: string[];
  required_providers?: string[];
  blocked_providers?: string[];
};

type OrganizationOAuthPolicyPayload = {
  item?: {
    organization_id?: number | string;
    policy_json?: OrganizationOAuthPolicy;
    version?: number;
    updated_at?: string | null;
  };
};

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function ServiceRow({
  name,
  status,
  error,
  busy,
  onConnect,
  onDisconnect,
}: {
  name: string;
  status: OAuthStatus | null;
  error: string | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <article className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{status?.connected ? "Connected" : "Not connected"}</p>
        </div>

        {status?.connected ? (
          <Button
            type="button"
            onClick={onDisconnect}
            disabled={busy}
            className="ds-btn h-10 rounded-md px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="ds-btn h-10 rounded-md px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Connect
          </Button>
        )}
      </div>

      {status?.integration?.workspace_name ? (
        <p className="mt-2 text-xs text-muted-foreground">Workspace: {status.integration.workspace_name}</p>
      ) : null}
      {status?.integration?.updated_at ? (
        <p className="mt-1 text-xs text-muted-foreground">Updated: {formatDate(status.integration.updated_at)}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </article>
  );
}

export default function DashboardOAuthConnectionsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useMemo(() => resolveDashboardScope(searchParams), [searchParams]);

  const [notionStatus, setNotionStatus] = useState<OAuthStatus | null>(null);
  const [linearStatus, setLinearStatus] = useState<OAuthStatus | null>(null);

  const [notionError, setNotionError] = useState<string | null>(null);
  const [linearError, setLinearError] = useState<string | null>(null);

  const [notionBusy, setNotionBusy] = useState(false);
  const [linearBusy, setLinearBusy] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [oauthPolicy, setOauthPolicy] = useState<OrganizationOAuthPolicyPayload["item"] | null>(null);

  const handle401 = useCallback(() => {
    const next = encodeURIComponent(buildNextPath(pathname, window.location.search));
    router.replace(`/?next=${next}`);
  }, [pathname, router]);

  const fetchStatus = useCallback(async () => {
    if (scope.scope !== "user") {
      return;
    }
    const [notionRes, linearRes] = await Promise.all([
      dashboardApiGet<OAuthStatus>("/api/oauth/notion/status"),
      dashboardApiGet<OAuthStatus>("/api/oauth/linear/status"),
    ]);

    if (notionRes.status === 401 || linearRes.status === 401) {
      handle401();
      return;
    }

    if (notionRes.ok && notionRes.data) {
      setNotionStatus(notionRes.data);
      setNotionError(null);
    } else {
      setNotionError("Failed to load Notion status.");
    }

    if (linearRes.ok && linearRes.data) {
      setLinearStatus(linearRes.data);
      setLinearError(null);
    } else {
      setLinearError("Failed to load Linear status.");
    }
  }, [handle401, scope.scope]);

  const fetchOrgPolicy = useCallback(async () => {
    if (scope.scope === "user") {
      return;
    }
    if (scope.organizationId === null) {
      setOauthPolicy(null);
      setPolicyError("Organization scope is required to view OAuth governance.");
      return;
    }
    setPolicyLoading(true);
    setPolicyError(null);
    const res = await dashboardApiGet<OrganizationOAuthPolicyPayload>(`/api/organizations/${scope.organizationId}/oauth-policy`);
    if (res.status === 401) {
      handle401();
      setPolicyLoading(false);
      return;
    }
    if (!res.ok || !res.data?.item) {
      setOauthPolicy(null);
      setPolicyError(res.error ?? "Failed to load OAuth governance policy.");
      setPolicyLoading(false);
      return;
    }
    setOauthPolicy(res.data.item);
    setPolicyLoading(false);
  }, [handle401, scope.organizationId, scope.scope]);

  const handleConnect = useCallback(
    async (provider: "notion" | "linear") => {
      const setBusy = provider === "notion" ? setNotionBusy : setLinearBusy;
      const setErr = provider === "notion" ? setNotionError : setLinearError;
      setBusy(true);
      setErr(null);

      const res = await dashboardApiRequest<OAuthStartPayload>(`/api/oauth/${provider}/start`, {
        method: "POST",
      });
      if (res.status === 401) {
        handle401();
        setBusy(false);
        return;
      }
      if (!res.ok || !res.data?.auth_url) {
        setErr(`Failed to start ${provider} OAuth.`);
        setBusy(false);
        return;
      }

      window.location.href = res.data.auth_url;
    },
    [handle401]
  );

  const handleDisconnect = useCallback(
    async (provider: "notion" | "linear") => {
      const setBusy = provider === "notion" ? setNotionBusy : setLinearBusy;
      const setErr = provider === "notion" ? setNotionError : setLinearError;
      setBusy(true);
      setErr(null);

      const res = await dashboardApiRequest(`/api/oauth/${provider}/disconnect`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        handle401();
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setErr(`Failed to disconnect ${provider} OAuth.`);
        setBusy(false);
        return;
      }

      await fetchStatus();
      setBusy(false);
    },
    [fetchStatus, handle401]
  );

  useEffect(() => {
    if (scope.scope === "user") {
      setPolicyError(null);
      setOauthPolicy(null);
      void fetchStatus();
      return;
    }
    setNotionError(null);
    setLinearError(null);
    void fetchOrgPolicy();
  }, [fetchOrgPolicy, fetchStatus, scope.scope]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === pathname) {
        if (scope.scope === "user") {
          void fetchStatus();
        } else {
          void fetchOrgPolicy();
        }
      }
    };
    window.addEventListener("dashboard:v2:refresh", handler as EventListener);
    return () => {
      window.removeEventListener("dashboard:v2:refresh", handler as EventListener);
    };
  }, [fetchOrgPolicy, fetchStatus, pathname, scope.scope]);

  const policyJson = oauthPolicy?.policy_json ?? {};
  const allowedProviders = Array.isArray(policyJson.allowed_providers) ? policyJson.allowed_providers : [];
  const requiredProviders = Array.isArray(policyJson.required_providers) ? policyJson.required_providers : [];
  const blockedProviders = Array.isArray(policyJson.blocked_providers) ? policyJson.blocked_providers : [];

  if (scope.scope !== "user") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">OAuth Governance</h1>
        <p className="text-sm text-muted-foreground">
          {scope.scope === "team" ? "Team scope is read-only and follows organization OAuth governance." : "Organization-level OAuth policy and guardrails."}
        </p>

        {policyError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {policyError}
          </div>
        ) : null}

        <div className="ds-card space-y-3 p-4">
          {policyLoading ? <p className="text-sm text-muted-foreground">Loading OAuth policy...</p> : null}
          {!policyLoading ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium">Allowed Providers</p>
                  <p className="mt-1 text-sm">{allowedProviders.length > 0 ? allowedProviders.join(", ") : "None configured"}</p>
                </article>
                <article className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium">Required Providers</p>
                  <p className="mt-1 text-sm">{requiredProviders.length > 0 ? requiredProviders.join(", ") : "None required"}</p>
                </article>
                <article className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium">Blocked Providers</p>
                  <p className="mt-1 text-sm">{blockedProviders.length > 0 ? blockedProviders.join(", ") : "None blocked"}</p>
                </article>
              </div>
              <p className="text-xs text-muted-foreground">
                Version: {oauthPolicy?.version ?? 1} | Updated: {formatDate(oauthPolicy?.updated_at ?? null)}
              </p>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">OAuth Connections</h1>
      <p className="text-sm text-muted-foreground">Connect Notion and Linear to expose MCP tools.</p>

      <div className="ds-card space-y-3 p-4">
        <ServiceRow
          name="Notion"
          status={notionStatus}
          error={notionError}
          busy={notionBusy}
          onConnect={() => void handleConnect("notion")}
          onDisconnect={() => void handleDisconnect("notion")}
        />
        <ServiceRow
          name="Linear"
          status={linearStatus}
          error={linearError}
          busy={linearBusy}
          onConnect={() => void handleConnect("linear")}
          onDisconnect={() => void handleDisconnect("linear")}
        />
      </div>
    </section>
  );
}
