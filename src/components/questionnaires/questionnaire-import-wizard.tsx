"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QuestionnaireUploadStep } from "@/components/questionnaires/questionnaire-upload-step";
import { QuestionnaireParseConfirmPanel } from "@/components/questionnaires/questionnaire-parse-confirm-panel";
import type { QuestionnaireImportPreview } from "@/lib/questionnaires/types";

interface QuestionnaireImportWizardProps {
  /** When set, sent as `x-workspace-id` on scan/confirm; APIs still resolve workspace from session if omitted. */
  workspaceId: string | null;
}

export function QuestionnaireImportWizard({ workspaceId }: QuestionnaireImportWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const [jobId, setJobId] = useState<string | null>(searchParams.get("jobId"));
  const [preview, setPreview] = useState<QuestionnaireImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(!!searchParams.get("jobId"));

  useEffect(() => {
    const jid = searchParams.get("jobId");
    if (!jid || preview) return;

    async function restore() {
      try {
        const res = await fetch(`/api/questionnaires/import/${jid}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.preview && data.job) {
          setJobId(data.job.id);
          setPreview(data.preview);
          setFileName(data.job.originalName || "Questionnaire");
          setStep("confirm");
        }
      } catch (err) {
        console.error("Failed to restore questionnaire job", err);
      } finally {
        setLoading(false);
      }
    }
    void restore();
  }, [searchParams, preview]);

  if (loading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <div className="flex flex-col items-center gap-2">
           <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
           <p className="text-sm text-text-muted">Resuming import session...</p>
         </div>
       </div>
     );
  }

  if (step === "confirm" && jobId && preview) {
    return (
      <QuestionnaireParseConfirmPanel
        jobId={jobId}
        workspaceId={workspaceId}
        fileName={fileName}
        initialPreview={preview}
        onBack={() => {
          setStep("upload");
          setJobId(null);
          setPreview(null);
          setFileName("");
        }}
      />
    );
  }

  return (
    <QuestionnaireUploadStep
      workspaceId={workspaceId}
      onScanComplete={(id, pv, name) => {
        setJobId(id);
        setPreview(pv);
        setFileName(name);
        setStep("confirm");
        // Update URL to support refresh recovery
        const params = new URLSearchParams(window.location.search);
        params.set("jobId", id);
        router.replace(`${window.location.pathname}?${params.toString()}`);
      }}
    />
  );
}
