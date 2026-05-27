import { AppTypography, AppIcon } from "@/components/ui/app-design-system/primitives";
import { SparklesIcon } from "@/components/icons";

/**
 * Loading state for onboarding page.
 * Prevents blank screen while server components resolve.
 */
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <div className="flex flex-col items-center gap-6 animate-pulse">
        <div className="relative">
          <div className="h-16 w-16 rounded-[2rem] bg-accent-primary/10 flex items-center justify-center shadow-premium-sm border border-accent-primary/20">
            <AppIcon icon={SparklesIcon} variant="brand" size="sm" className="animate-pulse" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-[2rem] border-2 border-accent-primary border-t-transparent animate-spin duration-[1.5s]" />
        </div>
        <div className="space-y-1 text-center">
          <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.4em] !text-[9px]">Initializing</AppTypography.Metadata>
          <AppTypography.SubSection className="!text-sm opacity-60">Preparing your workspace...</AppTypography.SubSection>
        </div>
      </div>
    </div>
  );
}
