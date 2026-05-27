"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadZone } from "@/components/ui/upload-zone";
import { PageHeader } from "@/components/ui/page-header";
import { validateQuestionnaireFileClient, QUESTIONNAIRE_FRIENDLY_TYPES } from "@/lib/questionnaires/validate-questionnaire-upload";
import type { QuestionnaireImportPreview, ParseIssue } from "@/lib/questionnaires/types";
import { Button } from "@/components/ui/button";
import { ParserIssuesList } from "@/components/questionnaires/parser-issues-list";

interface QuestionnaireUploadStepProps {
  workspaceId: string | null;
  onScanComplete: (jobId: string, preview: QuestionnaireImportPreview, fileName: string) => void;
}

export function QuestionnaireUploadStep({ workspaceId, onScanComplete }: QuestionnaireUploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [failureType, setFailureType] = useState<"validation" | "parsing" | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setError(null);
    setIssues([]);
    setFailureType(null);
    if (!file) {
      setError("Choose a spreadsheet file first.");
      setFailureType("validation");
      return;
    }
    const v = validateQuestionnaireFileClient(file);
    if (!v.ok) {
      setError(v.message);
      setFailureType("validation");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const headers: Record<string, string> = {};
      if (workspaceId) headers["x-workspace-id"] = workspaceId;
      const res = await fetch("/api/questionnaires/upload", {
        method: "POST",
        headers,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailureType(res.status === 422 ? "parsing" : "validation");
        setIssues(data.issues || []);
        const msg =
          typeof data?.error?.message === "string"
            ? data.error.message
            : `Scan failed (${res.status})`;
        setError(msg);
        return;
      }
      if (data.jobId && data.preview) {
        onScanComplete(data.jobId as string, data.preview as QuestionnaireImportPreview, file.name);
      } else {
        setError("Unexpected response from server.");
        setFailureType("parsing");
      }
    } catch {
      setError("Network error. Try again.");
      setFailureType("validation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import questionnaire"
        description={`${QUESTIONNAIRE_FRIENDLY_TYPES} — one file at a time, up to 10 MiB.`}
      />

      <div className="rounded-lg border border-surface-border bg-surface-panel p-6">
        <UploadZone
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hint={`Drop ${QUESTIONNAIRE_FRIENDLY_TYPES} here or browse`}
          mode="dropzoneOnly"
          onFiles={(files) => {
            const f = files[0];
            setFile(f ?? null);
            setError(null);
          }}
        />
        {file ? (
          <p className="mt-3 text-sm text-text-secondary">
            Selected: <span className="font-medium text-text-primary">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        ) : null}

        {error ? (
          <div className="mt-4 space-y-4">
            <div className={`rounded-md border px-3 py-2.5 text-sm ${
              failureType === "parsing" 
                ? "border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning" 
                : "border-semantic-error-border bg-semantic-error-bg text-semantic-error"
            }`}>
              <p className="font-semibold uppercase tracking-widest text-[10px] opacity-70 mb-1">
                {failureType === "parsing" ? "Spreadsheet Parsing Failure" : "File Validation Error"}
              </p>
              <p>{error}</p>
            </div>
            
            {issues.length > 0 && (
              <div className="rounded-lg border border-surface-border bg-surface-base/50 p-4">
                <ParserIssuesList issues={issues} />
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button 
            disabled={!file} 
            isLoading={busy} 
            onClick={() => void scan()}
          >
            Upload and scan
          </Button>
          <Link href="/app/questionnaires" className="text-sm text-text-muted hover:text-text-secondary">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
