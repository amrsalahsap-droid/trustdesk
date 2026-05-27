"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { WorkspaceRole } from "@prisma/client";
import { useToast } from "@/components/ui/toast";
import { 
  UserIcon, 
  ShieldCheckIcon, 
  EnvelopeIcon,
  MagicIcon,
  BookIcon,
  CheckIcon,
  PlusIcon,
  EyeIcon,
  LinkIcon,
  CopyIcon
} from "@/components/icons";

interface RoleOption {
  value: WorkspaceRole;
  label: string;
  description: string;
  capabilities: string[];
  icon: any;
  isRecommended?: boolean;
}

const ROLE_OPTIONS: RoleOption[] = [
  { 
    value: "OPERATOR", 
    label: "Response Manager", 
    description: "Coordinates the questionnaire process and drives AI operations.",
    capabilities: ["Import & match questionnaires", "Assign owners", "Export final data"],
    icon: MagicIcon,
    isRecommended: true
  },
  { 
    value: "ANSWER_OWNER", 
    label: "Answer Owner", 
    description: "Subject matter expert responsible for maintaining library content.",
    capabilities: ["Edit assigned answers", "Update evidence", "Submit for approval"],
    icon: BookIcon,
    isRecommended: true
  },
  { 
    value: "APPROVER", 
    label: "Approver", 
    description: "Final quality gate for compliance and library integrity.",
    capabilities: ["Approve/Reject answers", "Enforce revisions", "Library oversight"],
    icon: CheckIcon,
    isRecommended: true
  },
  { 
    value: "CONTRIBUTOR", 
    label: "Contributor / SME", 
    description: "Internal expert who provides specific technical or policy input.",
    capabilities: ["Comment on answers", "Upload evidence", "Suggest edits"],
    icon: PlusIcon,
    isRecommended: true
  },
  { 
    value: "AUDITOR", 
    label: "Auditor", 
    description: "External or internal reviewer with read-only oversight.",
    capabilities: ["View all answers", "Access audit history", "Review evidence"],
    icon: EyeIcon,
    isRecommended: true
  },
  { 
    value: "ADMIN", 
    label: "Workspace Admin", 
    description: "Full administrative access to settings and team management.",
    capabilities: ["Manage users & roles", "Workspace settings", "Audit all operations"],
    icon: ShieldCheckIcon,
  },
];

interface InviteUserSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteUserSlideOver({ isOpen, onClose, onSuccess }: InviteUserSlideOverProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "CONTRIBUTOR" as WorkspaceRole,
  });
  const [successData, setSuccessData] = useState<{ email: string; inviteUrl: string; mailSent: boolean; mailError?: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/workspaces/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error?.message || "Failed to invite user");
      }

      const inviteUrl = `${window.location.origin}/auth/invite/${body.rawToken}`;
      const mailSent = body.mailSent;
      const mailError = body.mailError;

      setSuccessData({ email: formData.email, inviteUrl, mailSent, mailError });
      
      if (mailSent) {
        toast({ severity: "success", title: `Invitation sent to ${formData.email}` });
      } else {
        toast({ severity: "warning", title: "Invite created, but email failed to send" });
      }

      setFormData({ name: "", email: "", role: "CONTRIBUTOR" });
      onSuccess();
    } catch (error) {
      toast({ severity: "error", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  function handleCloseSuccess() {
    setSuccessData(null);
    onClose();
  }

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Team Member"
      description="Add a new member to your workspace and assign their governance role."
    >
      {successData ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center space-y-4">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${successData.mailSent ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-warning/10 text-semantic-warning'}`}>
              {successData.mailSent ? <CheckIcon className="h-8 w-8" /> : <LinkIcon className="h-8 w-8" />}
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-text-primary">
                {successData.mailSent ? 'Invitation Sent!' : 'Member Added'}
              </h3>
              <p className="text-sm text-text-muted">
                {successData.mailSent ? (
                  <>An invitation email has been sent to <strong>{successData.email}</strong>.</>
                ) : (
                  <>
                    Member added, but <span className="text-semantic-error font-medium">email delivery failed</span>. 
                    {successData.mailError && (
                      <div className="mt-2 space-y-2">
                        <span className="block text-[10px] opacity-70">Error: {successData.mailError}</span>
                        {successData.mailError.includes("testing emails") && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-700 dark:text-amber-400">
                            <p className="font-bold mb-1">Testing Restriction Active</p>
                            <p>You are using the Resend testing address (onboarding@resend.dev). To invite other users, you must verify your domain at <a href="https://resend.com/domains" target="_blank" className="underline">resend.com</a> and update your MAIL_FROM in settings.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider">
              <LinkIcon className="h-3.5 w-3.5" />
              Direct Invite Link
            </div>
            <p className="text-[11px] text-text-muted italic">
              If the user doesn't receive the email, you can share this link directly:
            </p>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-base border border-surface-border">
              <code className="flex-1 text-[11px] truncate text-accent-primary font-mono">{successData.inviteUrl}</code>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 w-8 p-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(successData.inviteUrl);
                  toast({ severity: "success", title: "Copied to clipboard" });
                }}
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <Button onClick={() => setSuccessData(null)} variant="primary" className="w-full">
              Invite Another Member
            </Button>
            <Button onClick={handleCloseSuccess} variant="ghost" className="w-full">
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ... existing form content ... */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-text-primary">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                <input
                  required
                  type="text"
                  placeholder="e.g. Jane Cooper"
                  className="w-full rounded-lg border border-surface-border bg-surface-base py-2 pl-9 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-text-primary">Email Address</label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                <input
                  required
                  type="email"
                  placeholder="jane@company.com"
                  className="w-full rounded-lg border border-surface-border bg-surface-base py-2 pl-9 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <ShieldCheckIcon className="h-4 w-4 text-accent-primary" />
                Assign Role
              </label>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`relative flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all hover:bg-surface-base ${
                      formData.role === opt.value
                        ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary shadow-sm"
                        : "border-surface-border bg-surface-panel/50 hover:border-text-muted/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      className="sr-only"
                      checked={formData.role === opt.value}
                      onChange={() => setFormData({ ...formData, role: opt.value })}
                    />
                    
                    <div className={`mt-0.5 rounded-lg p-2 ${formData.role === opt.value ? "bg-accent-primary text-white" : "bg-surface-panel border border-surface-border text-text-muted"}`}>
                      <opt.icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold ${formData.role === opt.value ? "text-accent-primary" : "text-text-primary"}`}>
                          {opt.label}
                        </p>
                        {opt.isRecommended && (
                          <span className="text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                            Recommended
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-text-muted leading-relaxed">
                        {opt.description}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                        {opt.capabilities.map((cap, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px] font-medium text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-accent-primary/40" />
                            {cap}
                          </div>
                        ))}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <Button type="submit" variant="primary" className="flex-1 h-11" loading={loading}>
              Send Invitation
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SlideOver>
  );
}
