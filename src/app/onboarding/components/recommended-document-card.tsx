import { useState } from "react";
import { 
  FileTextIcon, 
  CheckIcon, 
  UploadIcon, 
  EyeIcon, 
  PlusIcon, 
  ChevronDownIcon,
  DownloadIcon,
  AlertCircleIcon,
  SparklesIcon
} from "@/components/icons";
import { type RecommendedDocument } from "@/modules/workspaces/onboarding/document-recommendation-service";
import { cn } from "@/lib/utils";
import { AppCard, AppTypography, AppIcon, AppButton, AppBadge } from "@/components/ui/app-design-system/primitives";

export function RecommendedDocumentCard({ 
  doc, 
  isAdopted,
  isGenerating,
  onViewSample,
  onAdopt,
  onDownloadDocx
}: { 
  doc: RecommendedDocument, 
  isAdopted: boolean,
  isGenerating: boolean,
  onViewSample: () => void,
  onAdopt: () => void,
  onDownloadDocx: () => void
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <AppCard 
      variant="section" 
      hover 
      className={cn(
        "!p-0 overflow-hidden",
        expanded && "border-intelligence-blue bg-intelligence-blue-soft"
      )}
    >
      {/* Header Container */}
      <div className="layout-panel-padding-md flex items-start gap-4">
        <AppIcon icon={FileTextIcon} filled variant="muted" size="sm" className="mt-1" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <AppTypography.SubSection className="truncate">{doc.name}</AppTypography.SubSection>
            {(doc.importanceIndicator === "CRITICAL" || doc.priority === "HIGH") && (
              <AppBadge variant="error">Critical</AppBadge>
            )}
            {doc.brief?.status === "MANUAL_REVIEW_REQUIRED" && (
              <AppBadge variant="warning" className="flex items-center gap-1.5">
                <AlertCircleIcon className="h-3 w-3" /> Manual Review
              </AppBadge>
            )}
            {isAdopted && (
              <AppBadge variant="success" className="flex items-center gap-1">
                <CheckIcon className="h-3 w-3" /> Ready
              </AppBadge>
            )}
          </div>
          <AppTypography.BodySm className="line-clamp-2 leading-relaxed">
             {doc.brief?.status === "MANUAL_REVIEW_REQUIRED" ? "High-precision scan failed. Drafting guidance provided below." : (doc.tailoredDescription || doc.description)}
          </AppTypography.BodySm>
          {doc.recommendationReason ? (
            <div className="mt-2.5 border-l-2 border-border-soft pl-3">
              <AppTypography.Metadata className="block mb-0.5 opacity-60 lowercase tracking-normal">Why recommended</AppTypography.Metadata>
              <p className="text-xs text-text-secondary leading-relaxed">{doc.recommendationReason}</p>
            </div>
          ) : null}
        </div>

        <button 
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-base transition-colors"
        >
          <ChevronDownIcon className={cn("h-4 w-4 text-text-muted transition-transform duration-300", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Expanded Content */}
      <div className={cn(
        "layout-panel-padding-md pt-0 grid transition-all duration-500 ease-in-out",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden space-y-5">
           <div className="h-px bg-border-soft" />
           
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                 <AppTypography.Metadata className="opacity-60">Evidence Detected</AppTypography.Metadata>
                 <div className="flex flex-col gap-2.5">
                    {doc.brief?.evidenceUsed && doc.brief.evidenceUsed.length > 0 ? (
                      doc.brief.evidenceUsed.slice(0, 4).map((e, i) => (
                        <div key={i} className="flex flex-col gap-1">
                           <AppTypography.SubSection className="text-xs truncate">{e.split('/').pop() || 'Homepage'}</AppTypography.SubSection>
                           <AppTypography.Metadata className="!tracking-normal !lowercase truncate italic leading-none opacity-50">{e}</AppTypography.Metadata>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-text-muted italic">Limited page-specific signal detected.</span>
                    )}
                 </div>
              </div>
              <div className="space-y-3">
                 <AppTypography.Metadata className="opacity-60">Strategy Insight</AppTypography.Metadata>
                 <AppTypography.BodySm className="leading-relaxed text-text-secondary">
                    {doc.brief?.tailoringStrategy || "Standard policy alignment."}
                 </AppTypography.BodySm>
              </div>
            </div>

           {doc.brief?.status === "MANUAL_REVIEW_REQUIRED" && (
             <div className="rounded-xl border border-warning-amber/20 bg-warning-amber/5 p-5 space-y-3">
                <div className="flex items-center gap-2.5 text-warning-amber">
                   <AlertCircleIcon className="h-4 w-4" />
                   <AppTypography.Metadata className="!text-warning-amber">Why we recommend Manual Review</AppTypography.Metadata>
                </div>
                <AppTypography.BodySm className="leading-relaxed text-text-secondary font-medium">
                   The scan found evidence of your business model, but specific operational details for this document were derived from industry standards (HYPOTHESIZED) rather than direct website observations.
                </AppTypography.BodySm>
                <div className="space-y-1.5 pt-1">
                   <AppTypography.Metadata className="opacity-60">Key Inferred Workflows</AppTypography.Metadata>
                   <AppTypography.BodySm className="italic text-text-muted leading-relaxed font-medium">
                      {doc.brief?.criticalWorkflowLink}
                   </AppTypography.BodySm>
                </div>
             </div>
           )}

           {(doc.brief?.whyItMattersForBusiness ||
              (doc.brief?.workflowsToCover && doc.brief.workflowsToCover.length > 0) ||
              (doc.brief?.rolesPersonas && doc.brief.rolesPersonas.length > 0)) && (
             <div className="rounded-xl border border-border-soft bg-surface-base p-5 space-y-4">
                <AppTypography.Metadata className="opacity-60">Business brief</AppTypography.Metadata>
                {doc.brief?.whyItMattersForBusiness ? (
                  <AppTypography.BodySm className="text-text-secondary">{doc.brief.whyItMattersForBusiness}</AppTypography.BodySm>
                ) : null}
                {doc.brief?.workflowsToCover && doc.brief.workflowsToCover.length > 0 ? (
                  <div className="space-y-2">
                    <AppTypography.Metadata className="opacity-60 lowercase tracking-normal">Workflows</AppTypography.Metadata>
                    <ul className="space-y-1.5 ml-1">
                      {doc.brief.workflowsToCover.slice(0, 8).map((w, i) => (
                        <li key={i} className="text-body-sm text-text-primary flex items-start gap-2 font-black uppercase tracking-tight">
                          <span className="mt-2 h-1 w-1 rounded-full bg-text-muted shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {doc.brief?.rolesPersonas && doc.brief.rolesPersonas.length > 0 ? (
                  <div className="space-y-1.5">
                    <AppTypography.Metadata className="opacity-60 lowercase tracking-normal">Roles / personas</AppTypography.Metadata>
                    <AppTypography.SubSection className="text-xs">{doc.brief.rolesPersonas.slice(0, 8).join(" · ")}</AppTypography.SubSection>
                  </div>
                ) : null}
             </div>
           )}

           {doc.templateSignalsUsed && doc.templateSignalsUsed.length > 0 && (
             <details className="rounded-xl border border-border-soft bg-surface-base p-4">
               <summary className="cursor-pointer">
                 <AppTypography.Metadata className="opacity-60 hover:text-text-primary transition-colors lowercase tracking-normal">Why this template was shaped for you</AppTypography.Metadata>
               </summary>
               <ul className="mt-4 space-y-3">
                 {doc.templateSignalsUsed.slice(0, 12).map((s, i) => (
                   <li key={i} className="text-body-sm text-text-secondary leading-relaxed space-y-1">
                     <div className="flex items-center gap-2">
                        <AppTypography.SubSection className="text-[10px]">{s.field}</AppTypography.SubSection>
                        <AppBadge variant="muted" className="lowercase !tracking-normal">{s.category}</AppBadge>
                     </div>
                     {s.value ? <AppTypography.SubSection className="text-[10px] block opacity-80">{s.value}</AppTypography.SubSection> : null}
                     {s.source ? <AppTypography.Metadata className="block !tracking-normal !lowercase truncate opacity-40">{s.source}</AppTypography.Metadata> : null}
                   </li>
                 ))}
               </ul>
             </details>
           )}

           <div className="space-y-4">
              <div className="flex items-center justify-between">
                <AppTypography.Metadata className="opacity-60">Key areas we recommend for your company</AppTypography.Metadata>
                {(() => {
                  const manualOrLimited =
                    doc.tailoringMode === "LIMITED_FALLBACK" ||
                    doc.brief?.status === "MANUAL_REVIEW_REQUIRED" ||
                    doc.templateQuality === "limited" ||
                    doc.templateQuality === "manual_required";
                  const evidenceBacked =
                    !manualOrLimited &&
                    doc.tailoringMode === "HIGH_PRECISION" &&
                    doc.brief?.status === "READY" &&
                    (doc.brief?.evidenceUsed?.length ?? 0) > 0;
                  if (manualOrLimited) {
                    return <AppBadge variant="warning"><AlertCircleIcon className="h-3 w-3" /> Limited tailoring</AppBadge>;
                  }
                  if (evidenceBacked) {
                    return <AppBadge variant="brand"><SparklesIcon className="h-3 w-3" /> Evidence-backed</AppBadge>;
                  }
                  return null;
                })()}
              </div>
              <ul className="grid grid-cols-1 gap-2 focus-within:ring-0">
                 {(doc.recommendedSections || []).map((item, i) => (
                   <li key={i} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-action-brand mt-1.5 shrink-0 shadow-[0_0_8px_rgba(var(--action-brand-rgb),0.4)]" />
                      <AppTypography.SubSection className="text-sm !tracking-tight">{item}</AppTypography.SubSection>
                   </li>
                 ))}
              </ul>
           </div>

           {/* Actions */}
           <div className="flex flex-wrap gap-3 pt-3">
               <AppButton 
                  onClick={onAdopt}
                  disabled={isAdopted || isGenerating}
                  className={cn(isAdopted && "bg-trust-green/10 text-trust-green border-trust-green/20 cursor-default shadow-none")}
               >
                 {isGenerating ? (
                   <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2.5" />
                 ) : isAdopted ? (
                   <CheckIcon className="h-4 w-4 mr-2.5" />
                 ) : (
                   <UploadIcon className="h-4 w-4 mr-2.5" />
                 )}
                 {isGenerating ? "Generating..." : isAdopted ? "Uploaded" : "Upload existing"}
               </AppButton>
               
               <AppButton 
                  variant="outline"
                  onClick={onViewSample}
                  disabled={isGenerating}
               >
                 {isGenerating ? (
                   <div className="h-4 w-4 animate-spin rounded-full border-2 border-intelligence-blue/30 border-t-intelligence-blue mr-2.5" />
                 ) : (
                   <EyeIcon className="h-4 w-4 mr-2.5" />
                 )}
                 {isGenerating ? "Analyzing..." : "View Sample"}
               </AppButton>
  
               <AppButton 
                  variant="outline"
                  onClick={onAdopt}
                  disabled={isAdopted || isGenerating}
               >
                 {isGenerating ? (
                   <div className="h-4 w-4 animate-spin rounded-full border-2 border-intelligence-blue/30 border-t-intelligence-blue mr-2.5" />
                 ) : (
                   <PlusIcon className="h-4 w-4 mr-2.5" />
                 )}
                 {isGenerating ? "Building..." : "Use Template"}
               </AppButton>
  
               <AppButton 
                  variant="ghost"
                  onClick={onDownloadDocx}
                  className="bg-intelligence-blue/5 hover:bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/10"
               >
                 <DownloadIcon className="h-4 w-4 mr-2.5" />
                 DOCX
               </AppButton>
            </div>
        </div>
      </div>
    </AppCard>
  );
}
