"use client";

type AlertBannerProps = {
  message: string;
  tone?: "warning" | "danger";
  dismissible?: boolean;
  onDismiss?: () => void;
};

export default function AlertBanner({ message, tone = "warning", dismissible = false, onDismiss }: AlertBannerProps) {
  const classes =
    tone === "danger"
      ? "border-[var(--danger-500)]/40 bg-[color-mix(in_srgb,var(--danger-500)_12%,white)] text-[var(--danger-500)]"
      : "border-[var(--warning-500)]/40 bg-[color-mix(in_srgb,var(--warning-500)_12%,white)] text-[var(--warning-500)]";

  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${classes}`}>
      <div className="flex items-center justify-between gap-2">
        <p>{message}</p>
        {dismissible ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-current px-2 py-1 text-xs"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
