"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { buildNextPath, dashboardApiGet, dashboardApiRequest } from "../../../../../lib/dashboard-v2-client";
import { resolveDashboardScope } from "../../../../../lib/dashboard-scope";
import PageTitleWithTooltip from "@/components/dashboard-v2/page-title-with-tooltip";

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

type CanvaDesign = {
  id?: string;
  title?: string | null;
  edit_url?: string | null;
  view_url?: string | null;
  thumbnail_url?: string | null;
  updated_at?: string | null;
};

type CanvaDesignListPayload = {
  ok: boolean;
  count: number;
  designs?: CanvaDesign[];
  continuation?: string | null;
};

type CanvaCreateDesignPayload = {
  ok: boolean;
  design?: CanvaDesign;
};

type CanvaExportJob = {
  id?: string;
  status?: string | null;
  urls?: string[] | null;
};

type CanvaExportPayload = {
  ok: boolean;
  job?: CanvaExportJob;
};

type CanvaExportFormatOption = {
  type?: string | null;
  label?: string | null;
};

type CanvaExportFormatsPayload = {
  ok: boolean;
  count: number;
  formats?: CanvaExportFormatOption[];
};

type CanvaDesignDetailPayload = {
  ok: boolean;
  design?: CanvaDesign & Record<string, unknown>;
};

type ConnectorJobRun = {
  id?: number;
  provider?: string;
  job_type?: string;
  external_job_id?: string | null;
  resource_id?: string | null;
  resource_title?: string | null;
  status?: string | null;
  result_payload?: Record<string, unknown> | null;
  download_urls?: string[] | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ConnectorJobRunsPayload = {
  items?: ConnectorJobRun[];
  count?: number;
};

type OrganizationOAuthPolicy = {
  allowed_providers?: string[];
  required_providers?: string[];
  blocked_providers?: string[];
  approval_workflow?: Record<string, unknown> | null;
};

type PermissionSnapshot = {
  permissions?: {
    can_manage_integrations?: boolean;
  };
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

function formatProviderLabel(provider: string): string {
  const value = String(provider ?? "").trim().toLowerCase();
  if (!value) {
    return "-";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function providerLogoSrc(provider: string): string | null {
  const value = String(provider ?? "").trim().toLowerCase();
  if (value === "canva") {
    return null;
  }
  if (value === "linear") {
    return "/logos/linear.svg";
  }
  if (value === "notion") {
    return "/logos/notion.svg";
  }
  if (value === "github") {
    return "/logos/github.svg";
  }
  return null;
}

type OAuthProvider = "notion" | "linear" | "github" | "canva";

function normalizeProviders(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => String(item ?? "").trim().toLowerCase()).filter((item) => item.length > 0))).sort();
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
  const [githubStatus, setGithubStatus] = useState<OAuthStatus | null>(null);
  const [canvaStatus, setCanvaStatus] = useState<OAuthStatus | null>(null);

  const [notionError, setNotionError] = useState<string | null>(null);
  const [linearError, setLinearError] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [canvaError, setCanvaError] = useState<string | null>(null);

  const [statusLoading, setStatusLoading] = useState(true);
  const [notionBusy, setNotionBusy] = useState(false);
  const [linearBusy, setLinearBusy] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [canvaBusy, setCanvaBusy] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [oauthPolicy, setOauthPolicy] = useState<OrganizationOAuthPolicyPayload["item"] | null>(null);
  const [canManagePolicy, setCanManagePolicy] = useState(false);
  const [allowedDraft, setAllowedDraft] = useState<string[]>([]);
  const [requiredDraft, setRequiredDraft] = useState<string[]>([]);
  const [blockedDraft, setBlockedDraft] = useState<string[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policySaveMessage, setPolicySaveMessage] = useState<string | null>(null);
  const [canvaDesigns, setCanvaDesigns] = useState<CanvaDesign[]>([]);
  const [canvaDesignsLoading, setCanvaDesignsLoading] = useState(false);
  const [canvaDesignsError, setCanvaDesignsError] = useState<string | null>(null);
  const [canvaCreateTitle, setCanvaCreateTitle] = useState("");
  const [canvaCreateType, setCanvaCreateType] = useState("poster");
  const [canvaCreateBusy, setCanvaCreateBusy] = useState(false);
  const [canvaCreateMessage, setCanvaCreateMessage] = useState<string | null>(null);
  const [canvaCreatedDesignHref, setCanvaCreatedDesignHref] = useState<string | null>(null);
  const [canvaExportBusyId, setCanvaExportBusyId] = useState<string | null>(null);
  const [canvaExportStatus, setCanvaExportStatus] = useState<Record<string, CanvaExportJob>>({});
  const [canvaExportFormat, setCanvaExportFormat] = useState<Record<string, string>>({});
  const [canvaExportFormats, setCanvaExportFormats] = useState<Record<string, CanvaExportFormatOption[]>>({});
  const [selectedCanvaDesignId, setSelectedCanvaDesignId] = useState<string | null>(null);
  const [selectedCanvaDesign, setSelectedCanvaDesign] = useState<(CanvaDesign & Record<string, unknown>) | null>(null);
  const [selectedCanvaDesignLoading, setSelectedCanvaDesignLoading] = useState(false);
  const [selectedCanvaDesignError, setSelectedCanvaDesignError] = useState<string | null>(null);
  const [canvaExportHistory, setCanvaExportHistory] = useState<Record<string, CanvaExportJob[]>>({});
  const [canvaServerJobRuns, setCanvaServerJobRuns] = useState<ConnectorJobRun[]>([]);

  const handle401 = useCallback(() => {
    const next = encodeURIComponent(buildNextPath(pathname, window.location.search));
    router.replace(`/?next=${next}`);
  }, [pathname, router]);

  const fetchStatus = useCallback(async () => {
    if (scope.scope !== "user") {
      setStatusLoading(false);
      return;
    }
    setStatusLoading(true);
    const [notionRes, linearRes, githubRes, canvaRes] = await Promise.all([
      dashboardApiGet<OAuthStatus>("/api/oauth/notion/status"),
      dashboardApiGet<OAuthStatus>("/api/oauth/linear/status"),
      dashboardApiGet<OAuthStatus>("/api/oauth/github/status"),
      dashboardApiGet<OAuthStatus>("/api/oauth/canva/status"),
    ]);

    if (notionRes.status === 401 || linearRes.status === 401 || githubRes.status === 401 || canvaRes.status === 401) {
      handle401();
      setStatusLoading(false);
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

    if (githubRes.ok && githubRes.data) {
      setGithubStatus(githubRes.data);
      setGithubError(null);
    } else {
      setGithubError("Failed to load GitHub status.");
    }

    if (canvaRes.ok && canvaRes.data) {
      setCanvaStatus(canvaRes.data);
      setCanvaError(null);
    } else {
      setCanvaError("Failed to load Canva status.");
    }
    setStatusLoading(false);
  }, [handle401, scope.scope]);

  const fetchOrgPolicy = useCallback(async () => {
    if (scope.scope === "user") {
      setPolicyLoading(false);
      return;
    }
    if (scope.organizationId === null) {
      setOauthPolicy(null);
      setPolicyError("Organization scope is required to view OAuth governance.");
      setPolicyLoading(false);
      return;
    }
    setPolicyLoading(true);
    setPolicyError(null);
    const [meRes, res] = await Promise.all([
      dashboardApiGet<PermissionSnapshot>("/api/me/permissions"),
      dashboardApiGet<OrganizationOAuthPolicyPayload>(`/api/organizations/${scope.organizationId}/oauth-policy`),
    ]);
    if (meRes.status === 401 || res.status === 401) {
      handle401();
      setPolicyLoading(false);
      return;
    }
    setCanManagePolicy(Boolean(meRes.data?.permissions?.can_manage_integrations));
    if (!res.ok || !res.data?.item) {
      setOauthPolicy(null);
      setPolicyError(res.error ?? "Failed to load OAuth governance policy.");
      setPolicyLoading(false);
      return;
    }
    setOauthPolicy(res.data.item);
    const policy = res.data.item.policy_json ?? {};
    setAllowedDraft(normalizeProviders(Array.isArray(policy.allowed_providers) ? policy.allowed_providers : []));
    setRequiredDraft(normalizeProviders(Array.isArray(policy.required_providers) ? policy.required_providers : []));
    setBlockedDraft(normalizeProviders(Array.isArray(policy.blocked_providers) ? policy.blocked_providers : []));
    setPolicySaveMessage(null);
    setPolicyLoading(false);
  }, [handle401, scope.organizationId, scope.scope]);

  const fetchCanvaDesigns = useCallback(async () => {
    if (scope.scope !== "user" || !canvaStatus?.connected) {
      setCanvaDesigns([]);
      setCanvaDesignsError(null);
      return;
    }
    setCanvaDesignsLoading(true);
    setCanvaDesignsError(null);
    const res = await dashboardApiGet<CanvaDesignListPayload>("/api/oauth/canva/designs?limit=5&sort_by=modified_descending");
    if (res.status === 401) {
      handle401();
      setCanvaDesignsLoading(false);
      return;
    }
    if (!res.ok || !res.data) {
      setCanvaDesigns([]);
      setCanvaDesignsError(res.error ?? "Failed to load Canva designs.");
      setCanvaDesignsLoading(false);
      return;
    }
    setCanvaDesigns(Array.isArray(res.data.designs) ? res.data.designs : []);
    setCanvaDesignsLoading(false);
  }, [canvaStatus?.connected, handle401, scope.scope]);

  const fetchCanvaExportFormats = useCallback(
    async (designId: string) => {
      const normalizedId = String(designId || "").trim();
      if (!normalizedId) {
        return;
      }
      const res = await dashboardApiGet<CanvaExportFormatsPayload>(`/api/oauth/canva/designs/${normalizedId}/export-formats`);
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok || !Array.isArray(res.data?.formats)) {
        return;
      }
      const nextFormats = res.data.formats.filter((item) => String(item?.type || "").trim().length > 0);
      if (nextFormats.length === 0) {
        return;
      }
      setCanvaExportFormats((current) => ({
        ...current,
        [normalizedId]: nextFormats,
      }));
      setCanvaExportFormat((current) => ({
        ...current,
        [normalizedId]: current[normalizedId] || String(nextFormats[0]?.type || "pdf"),
      }));
    },
    [handle401]
  );

  const fetchCanvaDesignDetail = useCallback(
    async (designId: string) => {
      const normalizedId = String(designId || "").trim();
      if (!normalizedId) {
        setSelectedCanvaDesign(null);
        setSelectedCanvaDesignId(null);
        return;
      }
      setSelectedCanvaDesignId(normalizedId);
      setSelectedCanvaDesignLoading(true);
      setSelectedCanvaDesignError(null);
      const res = await dashboardApiGet<CanvaDesignDetailPayload>(`/api/oauth/canva/designs/${normalizedId}`);
      if (res.status === 401) {
        handle401();
        setSelectedCanvaDesignLoading(false);
        return;
      }
      if (!res.ok || !res.data?.design) {
        setSelectedCanvaDesign(null);
        setSelectedCanvaDesignError(res.error ?? "Failed to load Canva design details.");
        setSelectedCanvaDesignLoading(false);
        return;
      }
      setSelectedCanvaDesign(res.data.design);
      setSelectedCanvaDesignLoading(false);
    },
    [handle401]
  );

  const fetchCanvaJobRuns = useCallback(async () => {
    if (scope.scope !== "user" || !canvaStatus?.connected) {
      setCanvaServerJobRuns([]);
      return;
    }
    const res = await dashboardApiGet<ConnectorJobRunsPayload>("/api/connector-jobs?provider=canva&limit=50");
    if (res.status === 401) {
      handle401();
      return;
    }
    if (!res.ok || !Array.isArray(res.data?.items)) {
      return;
    }
    const rows = res.data.items;
    setCanvaServerJobRuns(rows);
    const grouped: Record<string, CanvaExportJob[]> = {};
    rows
      .filter((item) => item.job_type === "export_create" && String(item.resource_id || "").trim().length > 0)
      .forEach((item) => {
        const resourceId = String(item.resource_id || "").trim();
        const job: CanvaExportJob = {
          id: item.external_job_id || undefined,
          status: item.status || undefined,
          urls: Array.isArray(item.download_urls) ? item.download_urls : undefined,
        };
        grouped[resourceId] = [...(grouped[resourceId] || []), job].slice(0, 5);
      });
    setCanvaExportHistory(grouped);
  }, [canvaStatus?.connected, handle401, scope.scope]);

  const handleCreateCanvaDesign = useCallback(async () => {
    if (!canvaStatus?.connected) {
      return;
    }
    setCanvaCreateBusy(true);
    setCanvaCreateMessage(null);
    const designTypeMap: Record<string, { type: string; name: string }> = {
      poster: { type: "poster", name: "Poster" },
      presentation: { type: "presentation", name: "Presentation" },
      instagram_post: { type: "instagram-post", name: "Instagram Post" },
    };
    const selectedType = designTypeMap[canvaCreateType] ?? designTypeMap.poster;
    const res = await dashboardApiRequest<CanvaCreateDesignPayload>("/api/oauth/canva/designs", {
      method: "POST",
      body: {
        title: canvaCreateTitle.trim() || undefined,
        design_type: selectedType,
      },
    });
    if (res.status === 401) {
      handle401();
      setCanvaCreateBusy(false);
      return;
    }
    if (!res.ok) {
      setCanvaCreateMessage(res.error ?? "Failed to create Canva design.");
      setCanvaCreatedDesignHref(null);
      setCanvaCreateBusy(false);
      return;
    }
    setCanvaCreateMessage("Canva design created.");
    setCanvaCreatedDesignHref(res.data?.design?.edit_url || res.data?.design?.view_url || null);
    setCanvaCreateTitle("");
    await fetchCanvaDesigns();
    await fetchCanvaJobRuns();
    setCanvaCreateBusy(false);
  }, [canvaCreateTitle, canvaCreateType, canvaStatus?.connected, fetchCanvaDesigns, fetchCanvaJobRuns, handle401]);

  const handleCreateCanvaExport = useCallback(
    async (designId: string) => {
      const format = canvaExportFormat[designId] || "pdf";
      setCanvaExportBusyId(designId);
      const res = await dashboardApiRequest<CanvaExportPayload>("/api/oauth/canva/exports", {
        method: "POST",
        body: {
          design_id: designId,
          format: { type: format },
        },
      });
      if (res.status === 401) {
        handle401();
        setCanvaExportBusyId(null);
        return;
      }
      if (!res.ok || !res.data?.job?.id) {
        setCanvaExportStatus((current) => ({
          ...current,
          [designId]: { status: res.error ?? "export_failed" },
        }));
        setCanvaExportBusyId(null);
        return;
      }
      const jobId = res.data.job.id;
      setCanvaExportStatus((current) => ({
        ...current,
        [designId]: res.data?.job ?? { id: jobId, status: "in_progress" },
      }));
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusRes = await dashboardApiGet<CanvaExportPayload>(`/api/oauth/canva/exports/${jobId}`);
        if (statusRes.status === 401) {
          handle401();
          break;
        }
        const nextJob = statusRes.data?.job;
        if (!statusRes.ok || !nextJob) {
          setCanvaExportStatus((current) => ({
            ...current,
            [designId]: { id: jobId, status: statusRes.error ?? "export_status_failed" },
          }));
          break;
        }
        setCanvaExportStatus((current) => ({
          ...current,
          [designId]: nextJob,
        }));
        if (nextJob.status && nextJob.status !== "in_progress") {
          break;
        }
      }
      await fetchCanvaJobRuns();
      setCanvaExportBusyId(null);
    },
    [canvaExportFormat, fetchCanvaJobRuns, handle401]
  );

  const setProviderPolicyState = useCallback((provider: string, nextState: "allowed" | "required" | "blocked" | "off") => {
    const normalized = String(provider ?? "").trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const nextAllowed = new Set(allowedDraft);
    const nextRequired = new Set(requiredDraft);
    const nextBlocked = new Set(blockedDraft);

    nextAllowed.delete(normalized);
    nextRequired.delete(normalized);
    nextBlocked.delete(normalized);

    if (nextState === "allowed") {
      nextAllowed.add(normalized);
    } else if (nextState === "required") {
      nextAllowed.add(normalized);
      nextRequired.add(normalized);
    } else if (nextState === "blocked") {
      nextBlocked.add(normalized);
    }

    setAllowedDraft(normalizeProviders(Array.from(nextAllowed)));
    setRequiredDraft(normalizeProviders(Array.from(nextRequired)));
    setBlockedDraft(normalizeProviders(Array.from(nextBlocked)));
    setPolicySaveMessage(null);
  }, [allowedDraft, blockedDraft, requiredDraft]);

  const saveOrgPolicy = useCallback(async () => {
    if (scope.scope !== "org" || scope.organizationId === null || !canManagePolicy) {
      return;
    }
    setSavingPolicy(true);
    setPolicyError(null);
    setPolicySaveMessage(null);

    const normalizedAllowed = normalizeProviders(allowedDraft);
    const normalizedRequired = normalizeProviders(requiredDraft);
    const normalizedBlocked = normalizeProviders(blockedDraft);
    const allowedSet = new Set(normalizedAllowed);
    const requiredSet = new Set(normalizedRequired);
    const blockedSet = new Set(normalizedBlocked);

    const requiredOutsideAllowed = normalizedRequired.filter((provider) => !allowedSet.has(provider));
    if (requiredOutsideAllowed.length > 0) {
      setPolicyError("Invalid policy: required providers must be included in allowed providers.");
      setSavingPolicy(false);
      return;
    }
    const blockedAndRequired = normalizedBlocked.filter((provider) => requiredSet.has(provider));
    if (blockedAndRequired.length > 0 || [...requiredSet].some((provider) => blockedSet.has(provider))) {
      setPolicyError("Invalid policy: blocked providers cannot overlap with required providers.");
      setSavingPolicy(false);
      return;
    }

    const currentPolicy = oauthPolicy?.policy_json ?? {};
    const response = await dashboardApiRequest<OrganizationOAuthPolicyPayload>(`/api/organizations/${scope.organizationId}/oauth-policy`, {
      method: "PATCH",
      body: {
        allowed_providers: normalizedAllowed,
        required_providers: normalizedRequired,
        blocked_providers: normalizedBlocked,
        approval_workflow:
          currentPolicy && typeof currentPolicy.approval_workflow === "object"
            ? currentPolicy.approval_workflow
            : null,
      },
    });
    if (response.status === 401) {
      handle401();
      setSavingPolicy(false);
      return;
    }
    if (response.status === 403) {
      setPolicyError("Admin role required to update OAuth governance policy.");
      setSavingPolicy(false);
      return;
    }
    if (!response.ok || !response.data?.item) {
      const rawError = response.error ?? "Failed to update OAuth governance policy.";
      if (rawError.includes("invalid_oauth_policy:required_not_subset_of_allowed")) {
        setPolicyError("Invalid policy: required providers must be included in allowed providers.");
      } else if (rawError.includes("invalid_oauth_policy:blocked_conflicts_required")) {
        setPolicyError("Invalid policy: blocked providers cannot overlap with required providers.");
      } else {
        setPolicyError(rawError);
      }
      setSavingPolicy(false);
      return;
    }
    setOauthPolicy(response.data.item);
    setPolicySaveMessage("OAuth governance policy updated.");
    setSavingPolicy(false);
  }, [allowedDraft, blockedDraft, canManagePolicy, handle401, oauthPolicy?.policy_json, requiredDraft, scope.organizationId, scope.scope]);

  const handleConnect = useCallback(
    async (provider: OAuthProvider) => {
      const setBusy = provider === "notion" ? setNotionBusy : provider === "linear" ? setLinearBusy : provider === "github" ? setGithubBusy : setCanvaBusy;
      const setErr = provider === "notion" ? setNotionError : provider === "linear" ? setLinearError : provider === "github" ? setGithubError : setCanvaError;
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
    async (provider: OAuthProvider) => {
      const setBusy = provider === "notion" ? setNotionBusy : provider === "linear" ? setLinearBusy : provider === "github" ? setGithubBusy : setCanvaBusy;
      const setErr = provider === "notion" ? setNotionError : provider === "linear" ? setLinearError : provider === "github" ? setGithubError : setCanvaError;
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
    setGithubError(null);
    setCanvaError(null);
    void fetchOrgPolicy();
  }, [fetchOrgPolicy, fetchStatus, scope.scope]);

  useEffect(() => {
    if (scope.scope !== "user") {
      return;
    }
    if (!canvaStatus?.connected) {
      setCanvaDesigns([]);
      setCanvaDesignsError(null);
      setCanvaExportFormats({});
      setCanvaServerJobRuns([]);
      return;
    }
    void fetchCanvaDesigns();
    void fetchCanvaJobRuns();
  }, [canvaStatus?.connected, fetchCanvaDesigns, fetchCanvaJobRuns, scope.scope]);

  useEffect(() => {
    if (scope.scope !== "user" || !canvaStatus?.connected || canvaDesigns.length === 0) {
      return;
    }
    canvaDesigns.slice(0, 5).forEach((design) => {
      const designId = String(design.id || "").trim();
      if (!designId || canvaExportFormats[designId]) {
        return;
      }
      void fetchCanvaExportFormats(designId);
    });
  }, [canvaDesigns, canvaExportFormats, canvaStatus?.connected, fetchCanvaExportFormats, scope.scope]);

  useEffect(() => {
    if (scope.scope !== "user" || !canvaStatus?.connected || canvaDesigns.length === 0) {
      return;
    }
    if (selectedCanvaDesignId) {
      return;
    }
    const firstId = String(canvaDesigns[0]?.id || "").trim();
    if (firstId) {
      void fetchCanvaDesignDetail(firstId);
    }
  }, [canvaDesigns, canvaStatus?.connected, fetchCanvaDesignDetail, scope.scope, selectedCanvaDesignId]);

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

  const providerCatalog = useMemo(() => {
    return Array.from(new Set(["notion", "linear", "github", "canva", ...allowedDraft, ...requiredDraft, ...blockedDraft])).sort();
  }, [allowedDraft, blockedDraft, requiredDraft]);

  const providerStateSummary = useMemo(() => {
    return {
      allowed: allowedDraft.length,
      required: requiredDraft.length,
      blocked: blockedDraft.length,
    };
  }, [allowedDraft.length, blockedDraft.length, requiredDraft.length]);

  if (scope.scope !== "user") {
    return (
      <section className="space-y-4">
        <PageTitleWithTooltip
          title="OAuth Governance"
          tooltip="Manage organization OAuth provider governance policies."
        />
        <p className="text-sm text-muted-foreground">
          {scope.scope === "team" ? "Team scope is read-only and follows organization OAuth governance." : "Organization-level OAuth policy and guardrails."}
        </p>

        {policyError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {policyError}
          </div>
        ) : null}

        <div className="ds-card space-y-3 p-4">
          {policyLoading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {!policyLoading ? (
            <>
              <p className="text-xs text-muted-foreground">
                Version: {oauthPolicy?.version ?? 1} | Updated: {formatDate(oauthPolicy?.updated_at ?? null)}
              </p>
              {scope.scope === "org" ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Policy Editor</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-1">Allowed {providerStateSummary.allowed}</span>
                    <span className="rounded-full border border-border px-2 py-1">Required {providerStateSummary.required}</span>
                    <span className="rounded-full border border-border px-2 py-1">Blocked {providerStateSummary.blocked}</span>
                  </div>

                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      Set each provider policy directly. Required providers are auto-included in Allowed.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {providerCatalog.map((provider) => {
                        const currentState = requiredDraft.includes(provider)
                          ? "required"
                          : blockedDraft.includes(provider)
                            ? "blocked"
                            : allowedDraft.includes(provider)
                              ? "allowed"
                              : "off";
                        const logoSrc = providerLogoSrc(provider);
                        return (
                          <article key={provider} className="space-y-2 rounded-md border border-border px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                {logoSrc ? (
                                  <Image src={logoSrc} alt={`${formatProviderLabel(provider)} logo`} width={16} height={16} className="h-4 w-4 shrink-0" />
                                ) : (
                                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border text-[10px]">
                                    {formatProviderLabel(provider).slice(0, 1)}
                                  </span>
                                )}
                                <span>{formatProviderLabel(provider)}</span>
                              </span>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                                {currentState}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { key: "allowed" as const, label: "Allow" },
                                { key: "required" as const, label: "Require" },
                                { key: "blocked" as const, label: "Block" },
                                { key: "off" as const, label: "Off" },
                              ].map((option) => (
                                <button
                                  key={`${provider}-${option.key}`}
                                  type="button"
                                  onClick={() => setProviderPolicyState(provider, option.key)}
                                  disabled={!canManagePolicy || savingPolicy}
                                  className={`h-8 rounded-md border px-2 text-[11px] ${
                                    currentState === option.key
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:bg-accent"
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className="ds-btn h-10 rounded-md px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void saveOrgPolicy()}
                      disabled={!canManagePolicy || savingPolicy}
                    >
                      {savingPolicy ? "Saving..." : "Save Policy"}
                    </Button>
                    {!canManagePolicy ? (
                      <p className="text-xs text-muted-foreground">You do not have permission to modify this policy.</p>
                    ) : null}
                    {policySaveMessage ? <p className="text-xs text-emerald-500">{policySaveMessage}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Team scope is read-only. Update policy in organization scope.</p>
              )}
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageTitleWithTooltip
        title="OAuth Connections"
        tooltip="Connect or disconnect personal Notion, Linear, GitHub, and Canva accounts."
      />
      <p className="text-sm text-muted-foreground">Connect Notion, Linear, GitHub, and Canva to expose MCP tools.</p>

      <div className="ds-card space-y-3 p-4">
        {statusLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
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
            <ServiceRow
              name="GitHub"
              status={githubStatus}
              error={githubError}
              busy={githubBusy}
              onConnect={() => void handleConnect("github")}
              onDisconnect={() => void handleDisconnect("github")}
            />
            <ServiceRow
              name="Canva"
              status={canvaStatus}
              error={canvaError}
              busy={canvaBusy}
              onConnect={() => void handleConnect("canva")}
              onDisconnect={() => void handleDisconnect("canva")}
            />
          </>
        )}
      </div>

      <div className="ds-card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Recent Canva Designs</p>
            <p className="text-xs text-muted-foreground">Loads the most recently updated Canva designs from your connected account.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchCanvaDesigns()}
            disabled={!canvaStatus?.connected || canvaDesignsLoading}
          >
            {canvaDesignsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="rounded-md border border-border p-3">
          <p className="text-sm font-medium">Create Design</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a new Canva design directly from metel.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
            <input
              type="text"
              value={canvaCreateTitle}
              onChange={(event) => setCanvaCreateTitle(event.target.value)}
              placeholder="Optional title"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-0"
            />
            <select
              value={canvaCreateType}
              onChange={(event) => setCanvaCreateType(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-0"
            >
              <option value="poster">Poster</option>
              <option value="presentation">Presentation</option>
              <option value="instagram_post">Instagram Post</option>
            </select>
            <Button
              type="button"
              onClick={() => void handleCreateCanvaDesign()}
              disabled={!canvaStatus?.connected || canvaCreateBusy}
            >
              {canvaCreateBusy ? "Creating..." : "Create"}
            </Button>
          </div>
          {canvaCreateMessage ? <p className="mt-2 text-xs text-muted-foreground">{canvaCreateMessage}</p> : null}
          {canvaCreatedDesignHref ? (
            <a
              href={canvaCreatedDesignHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open new design
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {!canvaStatus?.connected ? (
          <p className="text-sm text-muted-foreground">Connect Canva first to load recent designs.</p>
        ) : null}

        {canvaDesignsError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {canvaDesignsError}
          </div>
        ) : null}

        {canvaStatus?.connected && canvaDesignsLoading ? (
          <div className="flex min-h-[96px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {canvaStatus?.connected && !canvaDesignsLoading && !canvaDesignsError && canvaDesigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Canva designs found yet.</p>
        ) : null}

        {canvaStatus?.connected && canvaDesigns.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-2">
            {canvaDesigns.map((design, index) => {
              const href = design.edit_url || design.view_url || null;
              const designId = String(design.id || "").trim();
              const formatOptions = canvaExportFormats[designId] || [
                { type: "pdf", label: "PDF" },
                { type: "png", label: "PNG" },
                { type: "jpg", label: "JPG" },
              ];
              return (
                <article key={design.id || href || `canva-design-${index}`} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{design.title || "Untitled design"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">ID: {design.id || "-"}</p>
                      {design.updated_at ? (
                        <p className="mt-1 text-xs text-muted-foreground">Updated: {formatDate(design.updated_at)}</p>
                      ) : null}
                    </div>
                    {href ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => (design.id ? void fetchCanvaDesignDetail(design.id) : undefined)}
                          disabled={!design.id}
                        >
                          Details
                        </Button>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={canvaExportFormat[designId] || String(formatOptions[0]?.type || "pdf")}
                      onChange={(event) =>
                        setCanvaExportFormat((current) => ({
                          ...current,
                          [designId]: event.target.value,
                        }))
                      }
                      disabled={!design.id || canvaExportBusyId === design.id}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none ring-0"
                    >
                      {formatOptions.map((option) => {
                        const optionType = String(option.type || "").trim();
                        if (!optionType) {
                          return null;
                        }
                        return (
                          <option key={`${designId}-${optionType}`} value={optionType}>
                            {option.label || optionType.toUpperCase()}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => (design.id ? void handleCreateCanvaExport(design.id) : undefined)}
                      disabled={!design.id || canvaExportBusyId === design.id}
                    >
                      {canvaExportBusyId === design.id ? "Exporting..." : "Export"}
                    </Button>
                    {design.id && canvaExportStatus[design.id]?.status ? (
                      <span className="text-xs text-muted-foreground">Export: {canvaExportStatus[design.id]?.status}</span>
                    ) : null}
                    {design.id && canvaExportStatus[design.id]?.urls?.[0] ? (
                      <a
                        href={canvaExportStatus[design.id]?.urls?.[0] || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Download
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
            </div>

            <aside className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">Design Detail</p>
              {selectedCanvaDesignLoading ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              {selectedCanvaDesignError ? <p className="mt-2 text-xs text-destructive">{selectedCanvaDesignError}</p> : null}
              {!selectedCanvaDesignLoading && !selectedCanvaDesignError && selectedCanvaDesign ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-medium">{String(selectedCanvaDesign.title || "Untitled design")}</p>
                  <p className="text-xs text-muted-foreground">ID: {String(selectedCanvaDesign.id || "-")}</p>
                  {"updated_at" in selectedCanvaDesign ? (
                    <p className="text-xs text-muted-foreground">Updated: {formatDate(String(selectedCanvaDesign.updated_at || ""))}</p>
                  ) : null}
                  {"thumbnail_url" in selectedCanvaDesign && typeof selectedCanvaDesign.thumbnail_url === "string" && selectedCanvaDesign.thumbnail_url ? (
                    <a href={selectedCanvaDesign.thumbnail_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Open thumbnail
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {selectedCanvaDesignId && canvaExportHistory[selectedCanvaDesignId]?.length ? (
                    <div className="pt-2">
                      <p className="text-xs font-medium">Recent exports</p>
                      <div className="mt-2 space-y-2">
                        {canvaExportHistory[selectedCanvaDesignId].map((job, idx) => (
                          <div key={job.id || `job-${idx}`} className="rounded-md border border-border px-2 py-2 text-xs">
                            <p>Status: {job.status || "-"}</p>
                            {job.urls?.[0] ? (
                              <a href={job.urls[0]} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                                Download export
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {canvaServerJobRuns.length > 0 ? (
                    <div className="pt-2">
                      <p className="text-xs font-medium">Recent connector jobs</p>
                      <div className="mt-2 space-y-2">
                        {canvaServerJobRuns.slice(0, 5).map((job, idx) => (
                          <div key={job.id || `connector-job-${idx}`} className="rounded-md border border-border px-2 py-2 text-xs">
                            <p>
                              {job.job_type || "job"} / {job.status || "-"}
                            </p>
                            <p className="mt-1 text-muted-foreground">{formatDate(job.updated_at || job.created_at || null)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!selectedCanvaDesignLoading && !selectedCanvaDesignError && !selectedCanvaDesign ? (
                <p className="mt-2 text-sm text-muted-foreground">Choose a design to inspect details and recent exports.</p>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
