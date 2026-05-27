import { Suspense } from "react";

export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted">Loading governance…</div>}>{children}</Suspense>
  );
}
