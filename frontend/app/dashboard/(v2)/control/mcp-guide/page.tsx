"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import PageTitleWithTooltip from "@/components/dashboard-v2/page-title-with-tooltip";

function buildExamples(apiBaseUrl: string) {
  const base = apiBaseUrl || "$NEXT_PUBLIC_API_BASE_URL";
  return {
    listTools: `curl -sS "${base}/mcp" \\
  -H "Authorization: Bearer metel_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":"1","method":"list_tools","params":{}}'`,
    callTool: `curl -sS "${base}/mcp" \\
  -H "Authorization: Bearer metel_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":"2","method":"call_tool","params":{"name":"linear_list_issues","arguments":{"first":3}}}'`,
    customAgentNode: `// Example: scripts/custom-agent.mjs
const API_BASE = "${base}";
const API_KEY = process.env.METEL_API_KEY;

async function mcp(method, params = {}) {
  const res = await fetch(\`\${API_BASE}/mcp\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: String(Date.now()),
      method,
      params,
    }),
  });
  return res.json();
}

// 1) list tools
console.log(await mcp("list_tools", {}));

// 2) call tool
console.log(await mcp("call_tool", {
  name: "linear_list_issues",
  arguments: { first: 3 }
}));`,
    claudeDesktopConfig: `{
  "mcpServers": {
    "metel": {
      "command": "python",
      "args": ["/ABS/PATH/TO/metel/backend/scripts/mcp_stdio_bridge.py"],
      "env": {
        "API_BASE_URL": "${base}",
        "API_KEY": "metel_xxx",
        "BRIDGE_DEBUG": "1"
      }
    }
  }
}`,
    claudeDesktopCheck: `cd backend
API_BASE_URL="${base}" \\
API_KEY="metel_xxx" \\
python scripts/check_claude_bridge_tools.py`,
    n8nHttpNode: `// n8n HTTP Request node settings
// Method: POST
// URL: ${base}/mcp
// Auth: None (use header)
// Headers:
//   Authorization: Bearer metel_xxx
//   Content-Type: application/json
// Body (JSON):
{
  "jsonrpc": "2.0",
  "id": "n8n-1",
  "method": "list_tools",
  "params": {}
}`,
    n8nCallToolBody: `{
  "jsonrpc": "2.0",
  "id": "n8n-2",
  "method": "call_tool",
  "params": {
    "name": "linear_list_issues",
    "arguments": { "first": 3 }
  }
}`,
    canvaListDesigns: `curl -sS "${base}/mcp" \\
  -H "Authorization: Bearer metel_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":"3","method":"call_tool","params":{"name":"canva_design_list","arguments":{"limit":5,"sort_by":"modified_descending"}}}'`,
    canvaCreateDesign: `curl -sS "${base}/mcp" \\
  -H "Authorization: Bearer metel_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":"4","method":"call_tool","params":{"name":"canva_design_create","arguments":{"title":"Launch Poster","design_type":{"type":"poster","name":"Poster"}}}}'`,
    canvaExportDesign: `curl -sS "${base}/mcp" \\
  -H "Authorization: Bearer metel_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":"5","method":"call_tool","params":{"name":"canva_export_create","arguments":{"design_title":"Launch Poster","format":{"type":"pdf"}}}}'`,
  };
}

export default function DashboardMcpGuidePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const examples = useMemo(() => buildExamples(apiBaseUrl), [apiBaseUrl]);

  const [copyState, setCopyState] = useState<
    "" | "list_tools" | "call_tool" | "custom_agent_node" | "claude_config" | "claude_check" | "n8n_http" | "n8n_call" | "canva_list" | "canva_create" | "canva_export"
  >("");

  const copyText = async (
    kind: "list_tools" | "call_tool" | "custom_agent_node" | "claude_config" | "claude_check" | "n8n_http" | "n8n_call" | "canva_list" | "canva_create" | "canva_export"
  ) => {
    const text =
      kind === "list_tools"
        ? examples.listTools
        : kind === "call_tool"
          ? examples.callTool
          : kind === "custom_agent_node"
            ? examples.customAgentNode
            : kind === "claude_config"
              ? examples.claudeDesktopConfig
              : kind === "claude_check"
                ? examples.claudeDesktopCheck
                : kind === "n8n_http"
                  ? examples.n8nHttpNode
                  : kind === "n8n_call"
                    ? examples.n8nCallToolBody
                    : kind === "canva_list"
                      ? examples.canvaListDesigns
                      : kind === "canva_create"
                        ? examples.canvaCreateDesign
                        : examples.canvaExportDesign;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(kind);
      window.setTimeout(() => setCopyState(""), 1200);
    } catch {
      setCopyState("");
    }
  };

  return (
    <section className="space-y-4">
      <PageTitleWithTooltip
        title="Agent Guide"
        tooltip="Connect metel with custom agents, Claude Desktop, or n8n, then run MCP list_tools and call_tool."
      />
      <p className="text-sm text-muted-foreground">Choose one method: `Custom Agent`, `Claude Desktop`, or `n8n`.</p>

      <Tabs defaultValue="custom-agent" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-2 p-1">
          <TabsTrigger value="custom-agent" className="h-9 rounded-md px-3 text-sm">
            Custom Agent
          </TabsTrigger>
          <TabsTrigger value="claude-desktop" className="h-9 rounded-md px-3 text-sm">
            Claude Desktop
          </TabsTrigger>
          <TabsTrigger value="n8n" className="h-9 rounded-md px-3 text-sm">
            n8n
          </TabsTrigger>
        </TabsList>

        <TabsContent value="custom-agent">
          <article className="ds-card p-4">
            <p className="mb-2 text-sm font-medium">Method A) Custom Agent integration</p>
            <p className="text-xs text-muted-foreground">
              Add MCP HTTP calls in your own agent runtime code (for example `scripts/custom-agent.mjs`, `agent/runner.py`,
              `server/tools.ts`). Do not add `list_tools`/`call_tool` calls inside dashboard UI files.
            </p>
            <div className="mt-3 mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Node.js sample (where to place list_tools / call_tool)</p>
              <Button
                type="button"
                onClick={() => void copyText("custom_agent_node")}
                className="ds-btn h-8 rounded-md px-3 text-xs"
              >
                {copyState === "custom_agent_node" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.customAgentNode}</pre>
          </article>
        </TabsContent>

        <TabsContent value="claude-desktop">
          <article className="ds-card p-4">
            <p className="mb-2 text-sm font-medium">Method B) Claude Desktop integration</p>
            <p className="text-xs text-muted-foreground">
              Claude Desktop requires an MCP stdio process. Use `backend/scripts/mcp_stdio_bridge.py` and register it in Claude config.
            </p>
            <div className="mt-3 mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">claude_desktop_config.json snippet</p>
              <Button
                type="button"
                onClick={() => void copyText("claude_config")}
                className="ds-btn h-8 rounded-md px-3 text-xs"
              >
                {copyState === "claude_config" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.claudeDesktopConfig}</pre>

            <div className="mt-3 mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Bridge quick check command</p>
              <Button
                type="button"
                onClick={() => void copyText("claude_check")}
                className="ds-btn h-8 rounded-md px-3 text-xs"
              >
                {copyState === "claude_check" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.claudeDesktopCheck}</pre>
          </article>
        </TabsContent>

        <TabsContent value="n8n">
          <article className="ds-card p-4">
            <p className="mb-2 text-sm font-medium">Method C) n8n workflow integration</p>
            <p className="text-xs text-muted-foreground">
              Use n8n `HTTP Request` node to call metel MCP endpoint. This is recommended for no-code scheduled automation and alert flows.
            </p>
            <div className="mt-3 mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">n8n HTTP Request node (list_tools)</p>
              <Button
                type="button"
                onClick={() => void copyText("n8n_http")}
                className="ds-btn h-8 rounded-md px-3 text-xs"
              >
                {copyState === "n8n_http" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.n8nHttpNode}</pre>

            <div className="mt-3 mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">n8n body example (call_tool)</p>
              <Button
                type="button"
                onClick={() => void copyText("n8n_call")}
                className="ds-btn h-8 rounded-md px-3 text-xs"
              >
                {copyState === "n8n_call" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.n8nCallToolBody}</pre>
          </article>
        </TabsContent>
      </Tabs>

      <article className="ds-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Common MCP call: 1) list_tools</p>
          <Button
            type="button"
            onClick={() => void copyText("list_tools")}
            className="ds-btn h-9 rounded-md px-3 text-xs"
          >
            {copyState === "list_tools" ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.listTools}</pre>
      </article>

      <article className="ds-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Common MCP call: 2) call_tool</p>
          <Button
            type="button"
            onClick={() => void copyText("call_tool")}
            className="ds-btn h-9 rounded-md px-3 text-xs"
          >
            {copyState === "call_tool" ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.callTool}</pre>
      </article>

      <article className="ds-card space-y-4 p-4">
        <p className="text-sm font-medium">Canva MCP examples</p>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">List recent Canva designs</p>
            <Button type="button" onClick={() => void copyText("canva_list")} className="ds-btn h-8 rounded-md px-3 text-xs">
              {copyState === "canva_list" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.canvaListDesigns}</pre>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Create Canva design</p>
            <Button type="button" onClick={() => void copyText("canva_create")} className="ds-btn h-8 rounded-md px-3 text-xs">
              {copyState === "canva_create" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.canvaCreateDesign}</pre>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Export Canva design by title</p>
            <Button type="button" onClick={() => void copyText("canva_export")} className="ds-btn h-8 rounded-md px-3 text-xs">
              {copyState === "canva_export" ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded bg-muted/60 p-3 text-[11px] text-muted-foreground">{examples.canvaExportDesign}</pre>
        </div>
      </article>

      <article className="ds-card p-4">
        <p className="text-xs text-muted-foreground">
          Tip: replace `metel_xxx` with your API key and adjust `tool_name`/`arguments` per connector schema.
          If no tools appear, verify OAuth connections and API key `allowed_tools`.
        </p>
      </article>
    </section>
  );
}
