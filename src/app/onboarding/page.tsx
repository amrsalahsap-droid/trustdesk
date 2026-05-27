import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { OnboardingWorkspaceForm } from "./onboarding-workspace-form";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { ShieldCheckIcon, ClockIcon, DownloadIcon, SparklesIcon } from "@/components/icons";
import { trackNav } from "@/lib/instrumentation/nav-tracker";
import { randomUUID } from "node:crypto";
import { 
  AppHeroTitle, 
  AppBodySm, 
  AppMetadata, 
  AppSubSection, 
  AppIcon, 
  AppBadge, 
  AppCard 
} from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";

/** Shared shell: softer left rail, wider content column for review/profile steps */
const LEFT_PANEL_CLASS =
  "hidden lg:flex lg:w-[320px] lg:shrink-0 flex-col relative overflow-hidden bg-brand-navy border-r border-white/5";
const ORB_TOP_CLASS =
  "absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] bg-intelligence-blue/15 rounded-full blur-[140px] pointer-events-none animate-pulse duration-[10s]";
const ORB_BOTTOM_CLASS =
  "absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-intelligence-blue/5 rounded-full blur-[100px] pointer-events-none";
const RIGHT_INNER_CLASS = "mx-auto w-full max-w-5xl";

export default async function OnboardingPage(props: {
  searchParams: Promise<{ workspaceId?: string; resume?: string; new?: string }>;
}) {
  const correlationId = `corr-${randomUUID().slice(0, 8)}`;
  const route = "/onboarding";
  const startTime = Date.now();

  let userId: string;
  try {
    const identity = await resolveUserIdentity();
    userId = identity.userId;
  } catch (error) {
    trackNav("nav.render.error", { correlationId, route, error: "Authentication failed" });
    return redirect("/login");
  }

  const searchParams = await props.searchParams;

  trackNav("nav.workspace.resolve.start", { correlationId, route, userId });

  // Authoritative Membership Check
  const memberships = await prisma.workspaceMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: {
      id: true,
      workspaceId: true,
      workspace: {
        select: {
          name: true,
          website: true,
          industry: true,
          isDemo: true,
        },
      },
    },
  });

  // Scenario A: Multiple workspaces -> Selection (Standard hub behavior)
  // Bypass if explicitly creating a new one
  if (memberships.length > 1 && !searchParams.new) {
    return redirect("/workspace-selection");
  }

  // Scenario B: Single workspace exists (Resume Profile Setup)
  if (memberships.length === 1 && (!memberships[0].workspace.isDemo || searchParams.resume) && !searchParams.new) {
    const only = memberships[0];
    
    if (only.workspace.industry.length > 0 && !searchParams.resume && !searchParams.new) {
      return redirect("/app");
    }

    trackNav("nav.server.done", { correlationId, route, userId, workspaceId: only.workspaceId, duration: Date.now() - startTime });
    return (
      <div className="min-h-screen bg-surface-base">
        <OnboardingWorkspaceForm
          initialStep="PROFILE"
          initialWorkspaceId={only.workspaceId}
          initialValues={{
            name: only.workspace.name,
            website: only.workspace.website || "",
          }}
          userId={userId}
        />
      </div>
    );
  }

  trackNav("nav.server.done", { correlationId, route, userId, duration: Date.now() - startTime });
  return (
    <div className="min-h-screen bg-surface-base">
      <Suspense fallback={<div className="min-h-screen bg-surface-base" />}>
        <OnboardingWorkspaceForm userId={userId} />
      </Suspense>
    </div>
  );
}
