/**
 * Loading state for app shell.
 * Prevents blank screen while auth/workspace context resolves.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-page-fade">
      {/* Header Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-8 w-64 rounded-lg" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-4 w-full max-w-2xl rounded" />
      </div>

      {/* Metric Tiles Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      {/* Main Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <Skeleton className="h-[400px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl" />
        </div>
        <div className="lg:col-span-4 space-y-8">
          <Skeleton className="h-[500px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
