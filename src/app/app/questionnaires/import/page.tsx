"use client";

import { useEffect, useState } from "react";
import { QuestionnaireImportWizard } from "@/components/questionnaires/questionnaire-import-wizard";

export default function QuestionnaireImportPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/context", { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        if (data.workspaceId) setWorkspaceId(data.workspaceId);
        else if (data.workspaceIds?.[0]) setWorkspaceId(data.workspaceIds[0]);
      } catch {
        /* ignore */
      }
    }
    void load();
  }, []);

  return <QuestionnaireImportWizard workspaceId={workspaceId} />;
}
