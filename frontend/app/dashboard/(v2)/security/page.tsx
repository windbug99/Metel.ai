"use client";

export default function DashboardSecurityPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Security</h1>
      <p className="text-sm text-muted-foreground">
        Personal security settings (sessions/MFA/credentials) will be managed here.
      </p>

      <div className="ds-card p-4">
        <p className="text-sm">No configurable security items yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This page is prepared for user-scope security controls.
        </p>
      </div>
    </section>
  );
}
