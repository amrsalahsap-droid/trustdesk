"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnboardingStatus } from "@/lib/onboarding/workspace-setup";

export function useOnboardingStatus(pollMs = 10_000) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      const data = await res.json();
      if (data.status) setStatus(data.status as OnboardingStatus);
      else setStatus(null);
      setError(null);
    } catch {
      setError("Could not load workspace setup status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!status) return;
    const done =
      status.documentsUploaded && status.analysisCompleted && status.libraryReady && status.workspaceCreated;
    if (done) return;
    const t = setInterval(() => void refetch(), pollMs);
    return () => clearInterval(t);
  }, [status, pollMs, refetch]);

  return { status, loading, error, refetch };
}
