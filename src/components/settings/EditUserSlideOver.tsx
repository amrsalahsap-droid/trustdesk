"use client";

import { useState, useEffect } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { WorkspaceRole, WorkspaceMembershipStatus } from "@prisma/client";
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
  LockIcon,
  ActivityIcon,
  ClockIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

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

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active", description: "Full access to the workspace.", color: "text-semantic-success" },
  { value: "SUSPENDED", label: "Suspended", description: "Temporary loss of access. History preserved.", color: "text-semantic-warning" },
  { value: "DISABLED", label: "Disabled", description: "Account disabled for this workspace.", color: "text-semantic-error" },
];

interface Topic {
  id: string;
  name: string;
}

interface EditUserSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  member: any; // The member being edited
}

export function EditUserSlideOver({ isOpen, onClose, onSuccess, member }: EditUserSlideOverProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  
  // If member is null but slideover is open, we are in "Role Summary" mode
  const isSummaryMode = !member && isOpen;

  const [formData, setFormData] = useState({
    name: "",
    role: "CONTRIBUTOR" as WorkspaceRole,
    status: "ACTIVE" as WorkspaceMembershipStatus,
    ownedTopicIds: [] as string[],
    approvedTopicIds: [] as string[],
  });

  useEffect(() => {
    if (isOpen && member) {
      fetchMemberDetails();
      fetchTopics();
    }
  }, [isOpen, member]);

  async function fetchTopics() {
    try {
      const res = await fetch("/api/knowledge/topics");
      const data = await res.json();
      if (res.ok) {
        setTopics(data.topics || []);
      }
    } catch (error) {
      console.error("Failed to fetch topics", error);
    }
  }

  async function fetchMemberDetails() {
    if (!member) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/workspaces/members/${member.id}`);
      const data = await res.json();
      if (res.ok) {
        const m = data.member;
        setFormData({
          name: m.user.name || "",
          role: m.role,
          status: m.status,
          ownedTopicIds: m.user.ownedKnowledgeTopics.map((t: any) => t.id),
          approvedTopicIds: m.user.approvedKnowledgeTopics.map((t: any) => t.id),
        });
      }
    } catch (error) {
      toast({ severity: "error", title: "Failed to load member details" });
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSummaryMode) {
      onClose();
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`/api/workspaces/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error?.message || "Failed to update user");
      }

      toast({ severity: "success", title: `${formData.name || member.email} updated successfully` });
      onSuccess();
      onClose();
    } catch (error) {
      toast({ severity: "error", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  const toggleTopic = (topicId: string, type: "owned" | "approved") => {
    const field = type === "owned" ? "ownedTopicIds" : "approvedTopicIds";
    setFormData(prev => {
      const current = prev[field];
      if (current.includes(topicId)) {
        return { ...prev, [field]: current.filter(id => id !== topicId) };
      } else {
        return { ...prev, [field]: [...current, topicId] };
      }
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={isSummaryMode ? "Role Permission Summary" : "Edit Team Member"}
      description={isSummaryMode 
        ? "Overview of available workspace roles and their specific capabilities." 
        : `Update workspace attributes and governance for ${member?.email}`
      }
    >
      {fetching ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Loading details...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            {/* Identity Section - Hidden in Summary Mode */}
            {!isSummaryMode && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted px-1">Identity & Status</h3>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-text-primary px-1">Full Name</label>
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
                  <label className="text-sm font-semibold text-text-primary px-1 flex items-center gap-2">
                    Email Address
                    <span className="text-[10px] font-bold text-accent-primary uppercase flex items-center gap-1">
                      <LockIcon className="h-2.5 w-2.5" /> Read Only
                    </span>
                  </label>
                  <div className="relative opacity-70">
                    <EnvelopeIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                    <input
                      disabled
                      type="email"
                      className="w-full rounded-lg border border-surface-border bg-surface-panel py-2 pl-9 pr-3 text-sm outline-none cursor-not-allowed"
                      value={member?.email || ""}
                    />
                  </div>
                </div>

                {/* Status Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary px-1">Membership Status</label>
                  <div className="grid grid-cols-1 gap-2">
                    {STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:bg-surface-base ${
                          formData.status === opt.value 
                            ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary" 
                            : "border-surface-border bg-surface-panel/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          className="sr-only"
                          checked={formData.status === opt.value}
                          onChange={() => setFormData({ ...formData, status: opt.value as any })}
                        />
                        <div className={`h-2 w-2 rounded-full ${formData.status === opt.value ? "bg-accent-primary" : "bg-surface-border"}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-bold ${formData.status === opt.value ? "text-text-primary" : "text-text-secondary"}`}>
                              {opt.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted leading-tight mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="h-px bg-surface-border mx-1" />
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted px-1 flex items-center justify-between">
                {isSummaryMode ? "Available Roles" : "Workspace Role"}
                <ShieldCheckIcon className="h-3.5 w-3.5 text-accent-primary" />
              </h3>
              <div className={cn(
                "space-y-3 pr-2 custom-scrollbar",
                !isSummaryMode && "max-h-[400px] overflow-y-auto"
              )}>
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "relative flex flex-col gap-4 rounded-xl border p-4 transition-all",
                      isSummaryMode ? "border-surface-border bg-surface-panel/30" : (
                        formData.role === opt.value
                          ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary shadow-sm"
                          : "border-surface-border bg-surface-panel/50 hover:border-text-muted/30 cursor-pointer hover:bg-surface-base"
                      )
                    )}
                  >
                    {!isSummaryMode && (
                      <input
                        type="radio"
                        name="role"
                        className="sr-only"
                        checked={formData.role === opt.value}
                        onChange={() => setFormData({ ...formData, role: opt.value })}
                      />
                    )}
                    
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "mt-0.5 rounded-lg p-2",
                        !isSummaryMode && formData.role === opt.value ? "bg-accent-primary text-white" : "bg-surface-panel border border-surface-border text-text-muted"
                      )}>
                        <opt.icon className="h-5 w-5" />
                      </div>

                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className={cn(
                            "text-sm font-bold",
                            !isSummaryMode && formData.role === opt.value ? "text-accent-primary" : "text-text-primary"
                          )}>
                            {opt.label}
                          </p>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                          {opt.description}
                        </p>
                      </div>
                    </div>

                    <div className="bg-surface-base/50 rounded-lg p-3 space-y-2 border border-surface-border/50">
                       <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Capabilities</p>
                       <ul className="grid grid-cols-1 gap-1.5">
                          {opt.capabilities.map((cap, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px] text-text-secondary">
                               <CheckIcon className="h-3 w-3 text-semantic-success shrink-0" />
                               {cap}
                            </li>
                          ))}
                       </ul>
                    </div>

                    {!isSummaryMode && formData.role === opt.value && (
                      <div className="absolute right-4 top-4">
                        <div className="rounded-full bg-accent-primary p-0.5 shadow-lg shadow-accent-primary/20">
                          <CheckIcon className="h-3 w-3 text-white" />
                        </div>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Topic Governance - Hidden in Summary Mode */}
            {!isSummaryMode && (
              <>
                <div className="h-px bg-surface-border mx-1" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Governance Assignments</h3>
                    <span className="text-[10px] font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full border border-accent-primary/20">
                      {formData.ownedTopicIds.length + formData.approvedTopicIds.length} Assigned
                    </span>
                  </div>
                  
                  <div className="rounded-xl border border-surface-border bg-surface-panel/30 overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 p-3 bg-surface-panel/50 border-b border-surface-border text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      <div className="col-span-6">Topic Name</div>
                      <div className="col-span-3 text-center">Owner</div>
                      <div className="col-span-3 text-center">Approver</div>
                    </div>
                    
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                      {topics.length === 0 ? (
                        <div className="p-8 text-center text-xs text-text-muted italic">No topics available in this workspace.</div>
                      ) : (
                        topics.map((topic) => (
                          <div key={topic.id} className="grid grid-cols-12 gap-2 p-3 border-b border-surface-border/50 last:border-0 hover:bg-surface-base/50 transition-colors items-center">
                            <div className="col-span-6 text-sm font-medium text-text-primary truncate" title={topic.name}>
                              {topic.name}
                            </div>
                            <div className="col-span-3 flex justify-center">
                              <button
                                type="button"
                                onClick={() => toggleTopic(topic.id, "owned")}
                                className={`h-5 w-10 rounded-full border p-0.5 transition-all relative ${
                                  formData.ownedTopicIds.includes(topic.id) ? "bg-accent-primary border-accent-primary" : "bg-surface-panel border-surface-border"
                                }`}
                              >
                                <div className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all absolute top-0.5 ${
                                  formData.ownedTopicIds.includes(topic.id) ? "left-5.5" : "left-0.5"
                                }`} />
                              </button>
                            </div>
                            <div className="col-span-3 flex justify-center">
                              <button
                                type="button"
                                onClick={() => toggleTopic(topic.id, "approved")}
                                className={`h-5 w-10 rounded-full border p-0.5 transition-all relative ${
                                  formData.approvedTopicIds.includes(topic.id) ? "bg-accent-primary border-accent-primary" : "bg-surface-panel border-surface-border"
                                }`}
                              >
                                <div className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all absolute top-0.5 ${
                                  formData.approvedTopicIds.includes(topic.id) ? "left-5.5" : "left-0.5"
                                }`} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="pt-6 pb-2 flex items-center gap-3">
            <Button type="submit" variant={isSummaryMode ? "outline" : "primary"} className="flex-1 shadow-lg" loading={loading}>
              {isSummaryMode ? "Close" : "Save Changes"}
            </Button>
            {!isSummaryMode && (
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </SlideOver>
  );
}
