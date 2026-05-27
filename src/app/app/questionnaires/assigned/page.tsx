"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ClipboardIcon, UserIcon, CalendarIcon } from "@/components/icons";

interface AssignedQuestionnaire {
  id: string;
  title: string;
  sourceFileName?: string;
  assignedAt: string;
  dueDate?: string;
  status: string;
  assignedBy: {
    name: string;
    email: string;
  };
}

export default function AssignedQuestionnairesPage() {
  const [questionnaires, setQuestionnaires] = useState<AssignedQuestionnaire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssignedQuestionnaires() {
      try {
        // This would typically fetch from an API
        // For now, we'll show a placeholder
        setQuestionnaires([]);
      } catch (err) {
        console.error("Failed to load assigned questionnaires", err);
      } finally {
        setLoading(false);
      }
    }
    loadAssignedQuestionnaires();
  }, []);

  return (
    <div className="max-w-6xl pb-20 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Assigned Questionnaires</h1>
        <p className="text-text-muted mt-1">Questionnaires assigned to you for completion.</p>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover text-text-muted font-medium border-b border-surface-border">
              <tr>
                <th className="px-6 py-3">Questionnaire</th>
                <th className="px-6 py-3">Assigned By</th>
                <th className="px-6 py-3">Assigned Date</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-6 py-6">
                      <div className="h-4 bg-surface-hover rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : questionnaires.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center space-y-4">
                      <ClipboardIcon className="h-12 w-12 text-text-muted/50" />
                      <div>
                        <div className="text-lg font-medium mb-2">No assigned questionnaires</div>
                        <p className="text-sm">You haven't been assigned any questionnaires yet.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                questionnaires.map((questionnaire) => (
                  <tr key={questionnaire.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="font-medium text-text-primary">
                          {questionnaire.title}
                        </div>
                        {questionnaire.sourceFileName && (
                          <div className="text-xs text-text-muted">
                            {questionnaire.sourceFileName}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-text-muted" />
                        <div>
                          <div className="font-medium text-text-primary text-sm">
                            {questionnaire.assignedBy.name}
                          </div>
                          <div className="text-xs text-text-muted">
                            {questionnaire.assignedBy.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-text-muted" />
                        <span className="text-text-primary">
                          {format(new Date(questionnaire.assignedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        questionnaire.status === 'completed' 
                          ? 'bg-semantic-ok/10 text-semantic-ok'
                          : questionnaire.status === 'in_progress'
                          ? 'bg-accent-primary/10 text-accent-primary'
                          : 'bg-surface-border text-text-muted'
                      }`}>
                        {questionnaire.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
