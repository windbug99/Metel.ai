"use client";

import Link from "next/link";

import type { NavItem } from "./nav-model";

type NavListProps = {
  pathname: string;
  navItems: NavItem[];
  buildNavHref: (targetPath: string) => string;
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function DashboardNavList({ pathname, navItems, buildNavHref, mobile = false, onNavigate }: NavListProps) {
  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <>
      {visibleNavItems.map((item) => {
        const active = item.href ? pathname.startsWith(item.href) : false;
        const itemLabel = item.depth === 1 ? `- ${item.label}` : item.label;
        if (!item.href) {
          return (
            <p key={item.key} className="px-3 py-2 text-sm font-medium text-[var(--muted)]">
              {itemLabel}
            </p>
          );
        }
        return (
          <Link
            key={item.key}
            href={buildNavHref(item.href)}
            className={`block rounded-md px-3 ${mobile ? "py-3" : "py-2"} text-sm ${
              active
                ? "bg-[var(--brand-100)] text-[var(--brand-600)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            } ${item.depth === 1 ? (mobile ? "ml-3 text-xs" : "ml-4 text-xs") : ""}`}
            onClick={onNavigate}
          >
            {itemLabel}
          </Link>
        );
      })}
    </>
  );
}
