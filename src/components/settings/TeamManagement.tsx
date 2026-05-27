"use client";

import { useState, useEffect } from "react";
import { TeamTable } from "./TeamTable";
import { InviteUserSlideOver } from "./InviteUserSlideOver";
import { EditUserSlideOver } from "./EditUserSlideOver";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon, FilterIcon, ShieldCheckIcon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";

export function TeamManagement() {
  const { toast } = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRoleSummaryOpen, setIsRoleSummaryOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces/members");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
      } else {
        throw new Error(data.error?.message || "Failed to fetch members");
      }
    } catch (error) {
      toast({ severity: "error", title: "Failed to load team members" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  async function handleRemove(member: any) {
    const isInvitation = member.isInvitation;
    const actionLabel = isInvitation ? "revoke invitation for" : "remove";
    
    if (!confirm(`Are you sure you want to ${actionLabel} ${member.name || member.email}?`)) return;

    try {
      const endpoint = isInvitation 
        ? `/api/workspaces/invitations/${member.id}`
        : `/api/workspaces/members/${member.id}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      const body = await res.json();
      
      if (!res.ok) {
        throw new Error(body.error?.message || `Failed to ${isInvitation ? 'revoke' : 'remove'} member`);
      }
      toast({ severity: "success", title: isInvitation ? "Invitation revoked" : "Member removed from workspace" });
      fetchMembers();
    } catch (error) {
      toast({ severity: "error", title: error instanceof Error ? error.message : "Action failed" });
    }
  }

  function handleEdit(member: any) {
    setSelectedMember(member);
    setIsEditOpen(true);
  }

  async function handleResend(member: any) {
    try {
      const endpoint = `/api/workspaces/invitations/${member.id}/resend`;
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error?.message || "Failed to resend invitation");
      }
      toast({ severity: "success", title: `Invitation resent to ${member.email}` });
      fetchMembers();
    } catch (error) {
      toast({ severity: "error", title: error instanceof Error ? error.message : "Failed to resend invitation" });
    }
  }

  const filteredMembers = members.filter((m: any) => {
    const matchesSearch = 
      (m.name?.toLowerCase() || "").includes(search.toLowerCase()) || 
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Team & Access</h2>
          <p className="text-sm text-text-muted">Manage workspace members, roles, and invitation lifecycles.</p>
        </div>
        <PermissionGuard permission={Permission.MANAGE_MEMBERS}>
          <Button onClick={() => setIsInviteOpen(true)} variant="primary" size="sm" className="h-9 shadow-lg shadow-accent-primary/20">
            <PlusIcon className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex items-center gap-2 p-3 bg-accent-primary/[0.03] border border-accent-primary/10 rounded-lg">
        <ShieldCheckIcon className="h-4 w-4 text-accent-primary" />
        <span className="text-xs text-text-secondary">
          Roles define what members can see and do. 
          <button className="ml-1.5 font-bold text-accent-primary hover:underline" onClick={() => setIsRoleSummaryOpen(true)}>
            View role permission summary
          </button>
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-surface-panel p-3 rounded-lg border border-surface-border">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="w-full rounded-md border border-surface-border bg-surface-base py-1.5 pl-9 pr-3 text-sm outline-none focus:border-accent-primary transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <FilterIcon className="h-3.5 w-3.5 text-text-muted" />
          <select 
            className="rounded-md border border-surface-border bg-surface-base py-1.5 px-3 text-sm outline-none focus:border-accent-primary transition-colors cursor-pointer"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Admins</option>
            <option value="OPERATOR">Operators</option>
            <option value="APPROVER">Approvers</option>
            <option value="ANSWER_OWNER">Answer Owners</option>
            <option value="CONTRIBUTOR">Contributors</option>
            <option value="AUDITOR">Auditors</option>
          </select>
        </div>
      </div>

      <div className={`${loading && members.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
        <TeamTable 
          members={filteredMembers} 
          onEdit={handleEdit} 
          onRemove={handleRemove} 
          onResend={handleResend}
        />
      </div>

      {filteredMembers.length === 0 && !loading && (
        <div className="text-center py-12 bg-surface-panel rounded-lg border border-dashed border-surface-border">
          <p className="text-sm text-text-muted">No team members found matching your filters.</p>
        </div>
      )}

      <InviteUserSlideOver 
        isOpen={isInviteOpen} 
        onClose={() => setIsInviteOpen(false)} 
        onSuccess={fetchMembers} 
      />

      <EditUserSlideOver
        isOpen={isEditOpen || isRoleSummaryOpen}
        onClose={() => {
          setIsEditOpen(false);
          setIsRoleSummaryOpen(false);
          setSelectedMember(null);
        }}
        onSuccess={fetchMembers}
        member={selectedMember}
      />
    </div>
  );
}
