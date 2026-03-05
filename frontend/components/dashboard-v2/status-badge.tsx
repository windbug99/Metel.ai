"use client";

type DecisionStatus = "allowed" | "policy_blocked" | "access_denied" | "failed";
type KeyStatus = "active" | "revoked";

type StatusBadgeProps =
  | {
      kind: "decision";
      value: DecisionStatus | string | null | undefined;
    }
  | {
      kind: "key";
      value: KeyStatus | string | null | undefined;
    };

function labelFor(kind: StatusBadgeProps["kind"], value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  if (kind === "decision") {
    return value;
  }
  if (value === "active") {
    return "active";
  }
  if (value === "revoked") {
    return "revoked";
  }
  return value;
}

function toneClass(kind: StatusBadgeProps["kind"], value: string | null | undefined): string {
  if (!value) {
    return "border-[var(--status-unknown)]/35 text-[var(--status-unknown)] bg-[color-mix(in_srgb,var(--status-unknown)_12%,transparent)]";
  }

  if (kind === "decision") {
    if (value === "allowed") {
      return "border-[var(--status-ok)]/35 text-[var(--status-ok)] bg-[color-mix(in_srgb,var(--status-ok)_12%,transparent)]";
    }
    if (value === "policy_blocked") {
      return "border-[var(--status-warn)]/35 text-[var(--status-warn)] bg-[color-mix(in_srgb,var(--status-warn)_12%,transparent)]";
    }
    if (value === "access_denied" || value === "failed") {
      return "border-[var(--status-critical)]/35 text-[var(--status-critical)] bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)]";
    }
    return "border-[var(--status-unknown)]/35 text-[var(--status-unknown)] bg-[color-mix(in_srgb,var(--status-unknown)_12%,transparent)]";
  }

  if (value === "active") {
    return "border-[var(--status-ok)]/35 text-[var(--status-ok)] bg-[color-mix(in_srgb,var(--status-ok)_12%,transparent)]";
  }
  if (value === "revoked") {
    return "border-[var(--status-critical)]/35 text-[var(--status-critical)] bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)]";
  }
  return "border-[var(--status-unknown)]/35 text-[var(--status-unknown)] bg-[color-mix(in_srgb,var(--status-unknown)_12%,transparent)]";
}

export default function StatusBadge(props: StatusBadgeProps) {
  const value = props.value ?? null;
  return <span className={`ds-badge ${toneClass(props.kind, value)}`}>{labelFor(props.kind, value)}</span>;
}
