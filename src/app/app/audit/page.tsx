import { AuditCenter } from "@/components/audit/AuditCenter";
import { PageHeader } from "@/components/ui/page-header";
import { headers } from "next/headers";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { guardPermission } from "@/lib/auth/guard";
import { redirect } from "next/navigation";

export default async function AuditCenterPage() {
  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const request = new Request("http://localhost/app/audit", {
    headers: cookie ? { cookie } : {},
  });

  let ctx;
  try {
    ctx = await buildAuthContext(request);
  } catch {
    redirect("/login");
  }

  // Guard: Audit Center requires VIEW_AUDIT permission
  guardPermission(ctx, Permission.VIEW_AUDIT);
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <PageHeader
        title="Audit Center"
        subtitle="Trust & Compliance"
        description="Operational history and immutable compliance trail for all workspace activities. Monitor governance changes, security events, and administrative overrides."
        variant="emphasized"
      />

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
        <AuditCenter />
      </div>
    </div>
  );
}
