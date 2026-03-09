import { readFile } from "node:fs/promises";
import path from "node:path";

import UserGuideClient from "@/components/dashboard-v2/user-guide-client";
import { parseGuideMarkdown } from "@/lib/user-guide-parser";

const GUIDE_DOC_NAME = "user-guide-initial-setup-and-menu-settings-20260309.md";
export const dynamic = "force-dynamic";

async function loadGuideMarkdown(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "..", "docs", GUIDE_DOC_NAME),
    path.join(process.cwd(), "docs", GUIDE_DOC_NAME),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf-8");
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Guide markdown not found: ${GUIDE_DOC_NAME}`);
}

export default async function DashboardUserGuidePage() {
  const markdown = await loadGuideMarkdown();
  const guides = parseGuideMarkdown(markdown);

  return <UserGuideClient guides={guides} defaultLanguage="en" />;
}
