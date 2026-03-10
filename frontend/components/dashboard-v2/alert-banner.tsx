"use client";

import { Button } from "@/components/ui/button";
import { CircleAlert } from "lucide-react";
type AlertBannerProps = {
  message: string;
  tone?: "info" | "warning" | "danger";
  dismissible?: boolean;
  onDismiss?: () => void;
  showLeadingIcon?: boolean;
};

export default function AlertBanner({ message, tone = "warning", dismissible = false, onDismiss, showLeadingIcon = false }: AlertBannerProps) {
  const classes = tone === "danger"
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : tone === "info"
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-chart-4/40 bg-chart-4/10 text-chart-4";

  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${classes}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showLeadingIcon ? <CircleAlert className="h-4 w-4 shrink-0" /> : null}
          <p>{message}</p>
        </div>
        {dismissible ? (
          <Button
            type="button"
            onClick={onDismiss}
            className="rounded border border-current px-2 py-1 text-xs"
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
