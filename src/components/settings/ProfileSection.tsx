"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditIcon, CheckIcon, CloseIcon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";

interface ProfileSectionProps {
  initialName: string | null;
  email: string;
}

export function ProfileSection({ initialName, email }: ProfileSectionProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName || "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(name);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(name);
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Failed to update name");
      setName(trimmed);
      setEditing(false);
      toast({ severity: "success", title: "Name updated" });
    } catch (err) {
      toast({ severity: "error", title: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Full Name</p>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="flex-1 rounded-md border border-accent-primary bg-surface-base px-3 py-1.5 text-base font-semibold text-text-primary outline-none focus:ring-1 focus:ring-accent-primary"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={saveEdit}
                  loading={saving}
                  title="Save"
                >
                  <CheckIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={cancelEdit}
                  disabled={saving}
                  title="Cancel"
                >
                  <CloseIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <p className="text-base font-semibold text-text-primary">{name || "Not set"}</p>
                <button
                  onClick={startEdit}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent-primary"
                  title="Edit name"
                >
                  <EditIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Email Address</p>
            <p className="text-base font-semibold text-text-primary">{email}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
