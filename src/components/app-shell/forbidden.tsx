import Link from "next/link";
import { ShieldCheckIcon, ArrowLeftIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { getLandingDestination } from "@/lib/navigation/landing-destinations";

export function Forbidden({ role }: { role?: string }) {
  const fallbackUrl = getLandingDestination(role);
  const isLibrary = fallbackUrl.includes("/library");
  const fallbackLabel = isLibrary ? "Go to Library" : "Back to Dashboard";

  return (
    <div className="flex h-[70vh] flex-col items-center justify-center text-center animate-page-fade">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-semantic-error-bg text-semantic-error shadow-sm">
        <ShieldCheckIcon className="h-8 w-8" />
      </div>
      
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-text-primary">
        Access Restricted
      </h1>
      <p className="mb-8 max-w-sm text-sm text-text-muted">
        You don't have the necessary permissions to access this area. 
        Please contact your workspace administrator if you believe this is an error.
      </p>

      <div className="flex items-center justify-center gap-4">
        <Link href={fallbackUrl}>
          <Button variant="outline" leftIcon={<ArrowLeftIcon className="h-4 w-4" />}>
            {fallbackLabel}
          </Button>
        </Link>
        <Link href="/app/governance">
          <Button variant="ghost">
            View Posture
          </Button>
        </Link>
      </div>
    </div>
  );
}
