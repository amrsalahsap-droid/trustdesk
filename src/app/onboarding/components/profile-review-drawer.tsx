"use client";

import React, { useEffect, useState } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import {
  AppBadge,
  AppButton,
  AppInput,
  AppLabel,
  AppTypography,
} from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import type { OperationalProfileView, OperationalProperty } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

export interface ProfileReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile: OperationalProfileView | null;
  onSaveProfileReview: (updatedProfile: OperationalProfileView) => Promise<void>;
}

export function ProfileReviewDrawer({
  isOpen,
  onClose,
  initialProfile,
  onSaveProfileReview,
}: ProfileReviewDrawerProps) {
  const [editedProfile, setEditedProfile] = useState<OperationalProfileView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track which field is currently being edited
  const [editingField, setEditingField] = useState<keyof OperationalProfileView | null>(null);
  
  // Temporary inputs for the currently edited field
  const [tempValue, setTempValue] = useState("");
  const [tempNote, setTempNote] = useState("");

  useEffect(() => {
    if (isOpen && initialProfile) {
      setEditedProfile(initialProfile);
      setEditingField(null);
      setError(null);
    }
  }, [isOpen, initialProfile]);

  if (!editedProfile || !initialProfile) return null;

  // Determine if there are unsaved changes relative to initialProfile
  const isDirty = JSON.stringify(initialProfile) !== JSON.stringify(editedProfile);

  const handleClose = () => {
    if (isDirty) {
      if (confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSaveProfileReview(editedProfile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (key: keyof OperationalProfileView, currentVal: string) => {
    setEditingField(key);
    setTempValue(currentVal);
    setTempNote("");
  };

  const saveFieldEdit = (key: keyof OperationalProfileView, newStatus: "confirmed" | "inferred" | "unconfirmed" | "not_observed") => {
    setEditedProfile(prev => {
      if (!prev) return prev;
      const currentProp = prev[key];
      
      if (typeof currentProp === 'string') {
         // Simple string fields (businessDomain, productType, marketCategory, deployment)
         return {
           ...prev,
           [key]: tempValue
         };
      }
      
      // Complex OperationalProperty fields
      return {
        ...prev,
        [key]: {
          ...(currentProp as OperationalProperty),
          value: tempValue,
          status: newStatus === "not_observed" ? "unconfirmed" : newStatus, // map 'not_observed' to 'unconfirmed' with empty value for now
          // We can append the note to evidence or just leave it for now
          evidence: tempNote ? `[User Note: ${tempNote}] ${(currentProp as OperationalProperty).evidence}` : (currentProp as OperationalProperty).evidence
        }
      };
    });
    setEditingField(null);
  };

  const renderStringField = (key: keyof OperationalProfileView, label: string) => {
    const value = editedProfile[key] as string;
    const isEditing = editingField === key;
    
    return (
      <div className="rounded-xl border border-surface-border/50 bg-surface-subtle/20 p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">{label}</div>
          {!isEditing && (
            <button onClick={() => startEditing(key, value)} className="text-[10px] uppercase font-bold text-intelligence-blue hover:text-intelligence-blue-hover transition-colors">
              Edit
            </button>
          )}
        </div>
        
        {isEditing ? (
          <div className="space-y-3 pt-2">
            <AppInput value={tempValue} onChange={(e) => setTempValue(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <AppButton variant="outline" size="sm" onClick={() => setEditingField(null)}>Cancel</AppButton>
              <AppButton size="sm" onClick={() => saveFieldEdit(key, "confirmed")}>Save</AppButton>
            </div>
          </div>
        ) : (
          <div className="text-sm font-bold text-text-primary">{value}</div>
        )}
      </div>
    );
  };

  const renderPropertyField = (key: keyof OperationalProfileView, label: string) => {
    const prop = editedProfile[key] as OperationalProperty;
    if (!prop) return null;
    
    const isEditing = editingField === key;
    
    const statusColors = {
      confirmed: "success",
      inferred: "brand",
      unconfirmed: "warning"
    } as const;
    
    return (
      <div className="rounded-xl border border-surface-border/50 bg-surface-subtle/20 p-4 space-y-3">
         <div className="flex justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">{label}</div>
                <AppBadge variant={statusColors[prop.status as keyof typeof statusColors] || "muted"} className="text-[9px] uppercase tracking-widest px-1.5 py-0">
                  {prop.status}
                </AppBadge>
              </div>
              {!isEditing && (
                <div className="text-sm font-bold text-text-primary">{prop.value}</div>
              )}
            </div>
            
            {!isEditing && (
              <button onClick={() => startEditing(key, prop.value)} className="shrink-0 text-[10px] uppercase font-bold text-intelligence-blue hover:text-intelligence-blue-hover transition-colors">
                Review
              </button>
            )}
         </div>
         
         {!isEditing && prop.evidence && (
           <div className="text-xs text-text-muted mt-2 pl-3 border-l-2 border-surface-border/60">
             {prop.evidence}
           </div>
         )}
         
         {isEditing && (
           <div className="space-y-4 pt-3 border-t border-surface-border/50 mt-3">
             <div>
               <AppLabel>Inferred Value</AppLabel>
               <AppInput value={tempValue} onChange={(e) => setTempValue(e.target.value)} />
             </div>
             
             <div>
               <AppLabel>Audit Note (Optional)</AppLabel>
               <textarea 
                  className="w-full rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-sm text-text-primary"
                  rows={2}
                  value={tempNote}
                  onChange={(e) => setTempNote(e.target.value)}
                  placeholder="Explain why you are modifying this value..."
               />
             </div>
             
             <div className="flex flex-wrap gap-2 justify-end pt-2">
               <AppButton variant="outline" size="sm" onClick={() => setEditingField(null)}>Cancel</AppButton>
               <AppButton variant="outline" size="sm" onClick={() => saveFieldEdit(key, "not_observed")} className="border-warning-amber/50 text-warning-amber hover:bg-warning-amber/10">Mark Unknown</AppButton>
               <AppButton size="sm" onClick={() => saveFieldEdit(key, "confirmed")} className="bg-success-emerald hover:bg-success-emerald/80 text-white">Confirm</AppButton>
             </div>
           </div>
         )}
      </div>
    );
  };

  return (
    <SlideOver isOpen={isOpen} onClose={handleClose} title="Review Intelligence Profile" width="md">
      <div className="space-y-6 pb-20">
        <div className="space-y-2">
          <AppTypography.SectionTitle className="!text-xl font-black tracking-tight">
            Profile Review
          </AppTypography.SectionTitle>
          <AppTypography.BodySm className="text-text-secondary leading-relaxed">
            Review and correct the AI-inferred operational profile for this vendor. Confirming or editing these fields will directly impact the generated buyer questions and risk assessments.
          </AppTypography.BodySm>
        </div>
        
        {error && <p className="text-xs font-medium text-error-red">{error}</p>}

        <div className="space-y-4">
          <h3 className="text-sm font-black text-white/90 uppercase tracking-widest border-b border-white/10 pb-2">Business Context</h3>
          {renderStringField("businessDomain", "Business Domain")}
          {renderStringField("productType", "Product Type")}
          {renderStringField("marketCategory", "Market Category")}
          {renderStringField("deployment", "Deployment")}
          
          <h3 className="text-sm font-black text-white/90 uppercase tracking-widest border-b border-white/10 pb-2 mt-8">Data & Architecture</h3>
          {renderPropertyField("customerDataInteraction", "Customer Data Access")}
          {renderPropertyField("connectorScope", "Cloud Connector Scope")}
          {renderPropertyField("infrastructureInteraction", "Infrastructure Interaction")}
          {renderPropertyField("aiInteractionModel", "AI Usage")}
          {renderPropertyField("persistenceBehavior", "Data Persistence")}
          {renderPropertyField("tenantModel", "Tenant Model")}
          {renderPropertyField("supportVisibility", "Support Visibility")}
          {renderPropertyField("exportability", "Exportability")}
          {renderPropertyField("scanningBehavior", "Scanning Behavior")}
          {renderPropertyField("administrativeScope", "Administrative Scope")}
        </div>
        
        {/* Sticky bottom bar for Save */}
        {isDirty && (
          <div className="fixed bottom-0 right-0 w-full max-w-md bg-surface-base/95 backdrop-blur-sm border-t border-surface-border p-4 flex justify-between items-center z-10">
            <span className="text-xs font-bold text-warning-amber">Unsaved changes</span>
            <AppButton isLoading={isSaving} onClick={handleSave} className="bg-intelligence-blue hover:bg-intelligence-blue-hover text-white">
              Save Profile
            </AppButton>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
