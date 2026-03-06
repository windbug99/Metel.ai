"use client";

import Link from "next/link";

import type { NavItem } from "./nav-model";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

type NavListProps = {
  pathname: string;
  navItems: NavItem[];
  buildNavHref: (targetPath: string) => string;
};

export default function DashboardNavList({ pathname, navItems, buildNavHref }: NavListProps) {
  const visibleNavItems = navItems.filter((item) => item.visible);
  const groups: Array<{ parent: NavItem; children: NavItem[] }> = [];

  for (let i = 0; i < visibleNavItems.length; i += 1) {
    const item = visibleNavItems[i];
    if (item.depth === 1) {
      continue;
    }
    const children: NavItem[] = [];
    let j = i + 1;
    while (j < visibleNavItems.length && visibleNavItems[j].depth === 1) {
      children.push(visibleNavItems[j]);
      j += 1;
    }
    groups.push({ parent: item, children });
  }

  return groups.map(({ parent, children }) => {
    const parentActive = Boolean(parent.href && pathname.startsWith(parent.href));

    return (
      <SidebarGroup key={parent.key} className="p-0">
        {!parent.href ? <SidebarGroupLabel className="px-2">{parent.label}</SidebarGroupLabel> : null}
        <SidebarGroupContent>
          <SidebarMenu>
            {parent.href ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={parentActive}>
                  <Link href={buildNavHref(parent.href)}>{parent.label}</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            {children.length > 0 ? (
              <SidebarMenuSub>
                {children.map((child) => {
                  if (!child.href) {
                    return null;
                  }
                  return (
                    <SidebarMenuSubItem key={child.key}>
                      <SidebarMenuSubButton asChild isActive={pathname.startsWith(child.href)}>
                        <Link href={buildNavHref(child.href)}>{child.label}</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  });
}
