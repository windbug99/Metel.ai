"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GuideLanguage, ParsedGuide } from "@/lib/user-guide-parser";

type UserGuideClientProps = {
  guides: Record<GuideLanguage, ParsedGuide>;
  defaultLanguage?: GuideLanguage;
};

type SectionItem = {
  id: string;
  label: string;
};

function StepCard({
  labels,
  title,
  menuLabel,
  menuHref,
  what,
  values,
  why,
  done,
  caution,
}: {
  labels: ParsedGuide["labels"];
  title: string;
  menuLabel: string;
  menuHref: string;
  what: string;
  values: string;
  why: string;
  done: string;
  caution: string;
}) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {labels.menuFieldLabel}: {" "}
        <Link href={menuHref} className="underline underline-offset-2 hover:text-foreground">
          {menuLabel}
        </Link>
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <p><span className="font-medium">{labels.whatFieldLabel}:</span> {what}</p>
        <p><span className="font-medium">{labels.valuesFieldLabel}:</span> {values}</p>
        <p><span className="font-medium">{labels.whyFieldLabel}:</span> {why}</p>
        <p><span className="font-medium">{labels.doneFieldLabel}:</span> {done}</p>
        <p className="text-muted-foreground"><span className="font-medium">{labels.cautionFieldLabel}:</span> {caution}</p>
      </div>
    </article>
  );
}

export default function UserGuideClient({ guides, defaultLanguage = "en" }: UserGuideClientProps) {
  const [language, setLanguage] = useState<GuideLanguage>(defaultLanguage);
  const guide = guides[language] ?? guides.en;
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(
    Object.fromEntries((guide.menuReference ?? []).map((item) => [item.id, false]))
  );

  const sectionItems: SectionItem[] = useMemo(
    () => [
      { id: "quick-start", label: guide.labels.quickStartLabel },
      { id: "org-setup", label: guide.labels.orgSetupLabel },
      { id: "team-setup", label: guide.labels.teamSetupLabel },
      { id: "user-setup", label: guide.labels.userSetupLabel },
      { id: "menu-reference", label: guide.labels.menuReferenceLabel },
      { id: "ops-faq", label: guide.labels.faqLabel },
    ],
    [guide.labels.faqLabel, guide.labels.menuReferenceLabel, guide.labels.orgSetupLabel, guide.labels.quickStartLabel, guide.labels.teamSetupLabel, guide.labels.userSetupLabel]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{guide.labels.title}</h1>
          <p className="text-sm text-muted-foreground">{guide.labels.tooltip}</p>
        </div>
        <Select
          value={language}
          onChange={(event) => {
            const next = event.target.value as GuideLanguage;
            setLanguage(next);
            setOpenMenus(Object.fromEntries((guides[next].menuReference ?? []).map((item) => [item.id, false])));
          }}
          className="ds-input h-9 w-[120px] rounded-md px-3 text-sm"
        >
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </Select>
      </div>

      <div className="grid gap-4 lg:h-[calc(100svh-12rem)] lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="no-scrollbar space-y-4 lg:overflow-y-auto lg:pr-2">
          <div className="ds-card p-4" id="quick-start">
            <p className="text-sm font-semibold">{guide.labels.quickStartLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">{guide.labels.quickStartText}</p>
          </div>

          <div className="lg:hidden">
            <Select
              defaultValue="quick-start"
              onChange={(event) => {
                const target = document.getElementById(event.target.value);
                if (target) {
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="ds-input h-9 w-full rounded-md px-3 text-sm"
            >
              {sectionItems.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </Select>
          </div>

          <div id="org-setup" className="space-y-3">
            <p className="text-lg font-semibold">{guide.labels.orgSetupLabel}</p>
            {guide.sections.org.map((item) => (
              <StepCard key={item.id} labels={guide.labels} {...item} />
            ))}
          </div>

          <div id="team-setup" className="space-y-3">
            <p className="text-lg font-semibold">{guide.labels.teamSetupLabel}</p>
            {guide.sections.team.map((item) => (
              <StepCard key={item.id} labels={guide.labels} {...item} />
            ))}
          </div>

          <div id="user-setup" className="space-y-3">
            <p className="text-lg font-semibold">{guide.labels.userSetupLabel}</p>
            {guide.sections.user.map((item) => (
              <StepCard key={item.id} labels={guide.labels} {...item} />
            ))}
          </div>

          <div id="menu-reference" className="space-y-3">
            <p className="text-lg font-semibold">{guide.labels.menuReferenceLabel}</p>
            {guide.menuReference.map((item) => {
              const open = Boolean(openMenus[item.id]);
              return (
                <article key={item.id} className="rounded-md border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setOpenMenus((prev) => ({ ...prev, [item.id]: !open }))}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <Link href={item.menuHref} className="text-sm font-medium underline underline-offset-2 hover:text-foreground">
                      {item.menu}
                    </Link>
                    <span className="text-xs text-muted-foreground">{open ? guide.labels.hideLabel : guide.labels.showLabel}</span>
                  </button>
                  <div className={cn("border-t border-border px-4", open ? "block" : "hidden")}>
                    <div className="space-y-2 py-3 text-sm">
                      <p><span className="font-medium">{guide.labels.whatFieldLabel}:</span> {item.what}</p>
                      <p><span className="font-medium">{guide.labels.valuesFieldLabel}:</span> {item.values}</p>
                      <p><span className="font-medium">{guide.labels.whyFieldLabel}:</span> {item.why}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div id="ops-faq" className="space-y-3">
            <p className="text-lg font-semibold">{guide.labels.faqLabel}</p>
            {guide.faq.map((item) => (
              <article key={item.id} className="rounded-md border border-border bg-card p-4 text-sm">
                <p className="font-medium">Q. {item.q}</p>
                <p className="mt-1 text-muted-foreground">A. {item.a}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="hidden lg:block">
          <nav className="sticky top-4 rounded-md border border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{guide.labels.contentsLabel}</p>
            <div className="space-y-1">
              {sectionItems.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </section>
  );
}
