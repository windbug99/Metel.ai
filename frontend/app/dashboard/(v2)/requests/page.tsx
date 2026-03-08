"use client";

export default function DashboardMyRequestsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">My Requests</h1>
      <p className="text-sm text-muted-foreground">
        Personal request history and submission flow will be managed here.
      </p>

      <div className="ds-card p-4">
        <p className="text-sm">No request items yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This page is prepared for user-scope request workflows.
        </p>
      </div>
    </section>
  );
}
