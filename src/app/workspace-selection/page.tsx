import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { BuildingIcon, ArrowRightIcon } from "@/components/icons";
import { getLandingDestination } from "@/lib/navigation/landing-destinations";
import { trackNav } from "@/lib/instrumentation/nav-tracker";
import { randomUUID } from "node:crypto";

export default async function WorkspaceSelectionPage() {
  const correlationId = `corr-${randomUUID().slice(0, 8)}`;
  const route = "/workspace-selection";
  const startTime = Date.now();

  let userId: string;
  try {
    const identity = await resolveUserIdentity();
    userId = identity.userId;
  } catch (error) {
    trackNav("nav.render.error", { correlationId, route, error: "Authentication failed" });
    return redirect("/login");
  }

  trackNav("nav.workspace.resolve.start", { correlationId, route, userId });

  const memberships = await prisma.workspaceMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    include: {
      workspace: true,
    },
  });

  if (memberships.length === 0) {
    return redirect("/onboarding");
  }

  if (memberships.length === 1) {
    const m = memberships[0];
    const targetPath = getLandingDestination(m.role);
    return redirect(`${targetPath}${targetPath.includes("?") ? "&" : "?"}workspaceId=${m.workspaceId}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-base p-6">
      <div className="mx-auto w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-primary shadow-lg shadow-accent-primary/20">
            <BuildingIcon className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Welcome back</h1>
          <p className="text-sm text-text-muted">Select a workspace to continue working.</p>
        </div>

        <div className="space-y-3">
          {memberships.map((m) => {
            const targetPath = getLandingDestination(m.role);
            const fullUrl = `${targetPath}${targetPath.includes("?") ? "&" : "?"}workspaceId=${m.workspaceId}`;
            console.log(`Workspace navigation: ${m.workspace.name} (${m.role}) -> ${fullUrl}`);
            return (
              <Link 
                key={m.workspaceId} 
                href={fullUrl}
                className="group block"
              >
                <Card className="transition-all hover:border-accent-primary hover:bg-surface-hover hover:shadow-md cursor-pointer">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-panel group-hover:bg-white transition-colors border border-surface-border">
                        <span className="text-xs font-bold text-text-secondary group-hover:text-accent-primary">
                          {m.workspace.name.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                          {m.workspace.name}
                        </p>
                        <p className="text-xs text-text-muted capitalize">Role: {m.role.toLowerCase()}</p>
                      </div>
                    </div>
                    <ArrowRightIcon className="h-4 w-4 text-text-muted group-hover:translate-x-1 group-hover:text-accent-primary transition-all" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="pt-4">
             <Link href="/onboarding?new=true" className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors">
               Create a new workspace
             </Link>
        </div>
      </div>
    </div>
  );
}
