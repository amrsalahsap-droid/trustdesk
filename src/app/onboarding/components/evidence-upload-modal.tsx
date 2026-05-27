/**
 * Evidence Upload Modal - Onboarding Review Screen
 *
 * Premium split-pane layout containing:
 * - Left Pane: Preloaded context sections (What to upload, Why this matters, Affected trust topics, Affected buyer questions)
 * - Right Pane: Upload/Input tabs (Files, Web URL, Text Note) serializing web links & text notes into virtual text documents.
 */

import { useState, useRef } from "react";
import {
  CloseIcon,
  UploadIcon,
  CheckIcon,
  AlertCircleIcon,
  FileIcon,
  LinkIcon,
  EditIcon,
  BookIcon,
  ShieldCheckIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  MODAL_KEY_DISPLAY,
  displayLabelForUploadHint,
} from "@/lib/onboarding/evidence-upload-mapping";

export interface EvidenceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  onboardingSessionId?: string;
  expectedDocumentType?: string;
  recommendationId?: string;
  linkedTopicKeys?: string[];
  evidenceCategory?: string;
  documentReviewHref?: string;
  onComplete: (uploadResult: {
    documentId: string;
    documentType: string;
    linkedTopics: string[];
    success: boolean;
  }) => Promise<void>;

  // Enriched Preloaded Context Props
  title?: string;
  relatedPillar?: string;
  whyItMatters?: string;
  suggestedSources?: string[];
  relatedTopics?: string[];
  relatedRisks?: string[];
  buyerQuestions?: any[];
}

export function EvidenceUploadModal({
  isOpen,
  onClose,
  userId,
  onboardingSessionId,
  expectedDocumentType,
  recommendationId,
  linkedTopicKeys = [],
  evidenceCategory,
  documentReviewHref,
  onComplete,

  // Enriched Props Fallbacks
  title,
  relatedPillar = "Compliance & Audit Readiness",
  whyItMatters,
  suggestedSources = [],
  relatedTopics = [],
  relatedRisks = [],
  buyerQuestions = [],
}: EvidenceUploadModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "url" | "note">("file");

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [urlInput, setUrlInput] = useState("");
  const [urlTitleInput, setUrlTitleInput] = useState("");

  // Text note state
  const [noteInput, setNoteInput] = useState("");
  const [noteTitleInput, setNoteTitleInput] = useState("");

  // Upload status states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const getDocumentTypeDisplay = () => {
    if (title) return title;
    if (!expectedDocumentType) return "Document";
    return MODAL_KEY_DISPLAY[expectedDocumentType] || displayLabelForUploadHint(expectedDocumentType);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
    }
  };

  const handleUpload = async () => {
    let fileToUpload: File | null = null;

    if (activeTab === "file") {
      if (!selectedFile) {
        setUploadError("Please select a file to upload");
        return;
      }
      fileToUpload = selectedFile;
    } else if (activeTab === "url") {
      if (!urlInput.trim()) {
        setUploadError("Please enter a valid website URL");
        return;
      }
      const titleStr = urlTitleInput.trim() || "evidence_url";
      const fileContent = `SOURCE EVIDENCE URL: ${urlInput.trim()}\nTITLE: ${titleStr}\nSUBMITTED BY: ${userId}\nTIMESTAMP: ${new Date().toISOString()}\n`;
      const fileName = `${titleStr.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_url.txt`;
      fileToUpload = new File([fileContent], fileName, { type: "text/plain" });
    } else {
      if (!noteInput.trim()) {
        setUploadError("Please enter your written policy snippet or note text");
        return;
      }
      const titleStr = noteTitleInput.trim() || "evidence_note";
      const fileContent = `SOURCE EVIDENCE NOTE:\nTITLE: ${titleStr}\nSUBMITTED BY: ${userId}\nTIMESTAMP: ${new Date().toISOString()}\n\n---\n\n${noteInput.trim()}\n`;
      const fileName = `${titleStr.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_note.txt`;
      fileToUpload = new File([fileContent], fileName, { type: "text/plain" });
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      if (onboardingSessionId) {
        formData.append("onboardingSessionId", onboardingSessionId);
      }
      if (recommendationId) {
        formData.append("recommendationId", recommendationId);
      }
      if (expectedDocumentType) {
        formData.append("expectedDocumentType", expectedDocumentType);
      }

      // Merge manually linked topics and context related topics to maximize orchestration
      const allLinkedTopics = Array.from(new Set([...linkedTopicKeys, ...relatedTopics]));
      if (allLinkedTopics.length > 0) {
        formData.append("linkedTopicKeys", JSON.stringify(allLinkedTopics));
      }
      if (evidenceCategory) {
        formData.append("evidenceCategory", evidenceCategory);
      }

      setUploadProgress(40);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg =
          payload?.error?.message ||
          payload?.error ||
          (typeof payload?.detail === "string" ? payload.detail : null) ||
          "Upload failed";
        throw new Error(msg);
      }

      setUploadProgress(85);

      const docId = payload?.document?.id;
      if (!docId) {
        throw new Error("Upload succeeded but no document id was returned");
      }

      await onComplete({
        documentId: docId,
        documentType: expectedDocumentType || "Document",
        linkedTopics: allLinkedTopics,
        success: true,
      });

      setUploadProgress(100);
      setUploadSuccess(true);
      setIsUploading(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetModal = () => {
    setSelectedFile(null);
    setUrlInput("");
    setUrlTitleInput("");
    setNoteInput("");
    setNoteTitleInput("");
    setUploadError(null);
    setUploadSuccess(false);
    setUploadProgress(0);
    setIsUploading(false);
  };

  const handleClose = () => {
    if (!isUploading) {
      resetModal();
      onClose();
    }
  };

  if (!isOpen) return null;

  const topicsToDisplay = Array.from(new Set([...linkedTopicKeys, ...relatedTopics]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-brand-navy/95 border border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-brand-navy/40">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-intelligence-blue/20 flex items-center justify-center border border-intelligence-blue/30 text-intelligence-blue shrink-0">
              <UploadIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black tracking-tight text-white">
                  Add Evidence: {getDocumentTypeDisplay()}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 tracking-normal uppercase">
                  {relatedPillar}
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Strengthen trust readiness by contributing verifying documents, policies, or explanations.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isUploading}
            className="h-8 w-8 p-0 text-white/40 hover:text-white hover:bg-white/5 rounded-lg"
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Split Panel */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Pane - Rich Context */}
          <div className="w-full md:w-5/12 border-r border-white/10 overflow-y-auto p-6 space-y-6 bg-brand-navy/20">
            
            {/* Why This Matters */}
            <div className="space-y-2">
              <span className="text-[10px] font-black text-intelligence-blue tracking-widest uppercase">
                Why this matters
              </span>
              <p className="text-xs text-white/70 leading-relaxed bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                {whyItMatters || "Required to satisfy corporate compliance policies and demonstrate robust posture before initiating enterprise procurement."}
              </p>
            </div>

            {/* What to Upload / Accepted Evidence */}
            {suggestedSources.length > 0 && (
              <div className="space-y-2.5">
                <span className="text-[10px] font-black text-intelligence-blue tracking-widest uppercase">
                  What to upload
                </span>
                <div className="space-y-1.5">
                  {suggestedSources.map((source, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs text-white/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-intelligence-blue mt-1.5 shrink-0" />
                      <span>{source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Affected Trust Topics */}
            {topicsToDisplay.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-intelligence-blue tracking-widest uppercase flex items-center gap-1.5">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  Affected trust topics
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {topicsToDisplay.map((topic, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-medium text-white/80 lowercase tracking-normal"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Affected Buyer Questions */}
            {buyerQuestions.length > 0 && (
              <div className="space-y-3">
                <span className="text-[10px] font-black text-intelligence-blue tracking-widest uppercase flex items-center gap-1.5">
                  <BookIcon className="h-3.5 w-3.5" />
                  Satisfied buyer questions ({buyerQuestions.length})
                </span>
                <div className="space-y-2.5">
                  {buyerQuestions.slice(0, 3).map((q, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-intelligence-blue/[0.03] border border-intelligence-blue/10 rounded-xl space-y-1"
                    >
                      <p className="text-[11px] font-bold text-white leading-normal">
                        "{q.question}"
                      </p>
                      <p className="text-[9px] text-white/40 font-medium">
                        Domain focus: {q.concernDomain || "Security Posture"}
                      </p>
                    </div>
                  ))}
                  {buyerQuestions.length > 3 && (
                    <p className="text-[10px] text-white/40 italic">
                      + {buyerQuestions.length - 3} more related enterprise queries
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Pane - Inputs */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
            
            {/* Tab Swapping Header */}
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("file");
                  setUploadError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "file"
                    ? "bg-intelligence-blue text-white shadow-md shadow-intelligence-blue/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <FileIcon className="h-3.5 w-3.5" />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("url");
                  setUploadError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "url"
                    ? "bg-intelligence-blue text-white shadow-md shadow-intelligence-blue/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Web URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("note");
                  setUploadError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "note"
                    ? "bg-intelligence-blue text-white shadow-md shadow-intelligence-blue/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <EditIcon className="h-3.5 w-3.5" />
                Text Note
              </button>
            </div>

            {/* Input Panels */}
            <div className="flex-1 flex flex-col justify-center min-h-[220px]">
              
              {/* FILE UPLOAD PANEL */}
              {activeTab === "file" && (
                <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center bg-white/[0.01] hover:bg-white/[0.02] transition-colors flex flex-col items-center justify-center space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isUploading}
                  />

                  {!selectedFile ? (
                    <>
                      <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-2">
                        <UploadIcon className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-bold text-white">Choose a file to upload</p>
                      <p className="text-xs text-white/40 max-w-[280px]">
                        Supported formats: PDF, DOCX, TXT, PNG, JPG (up to 25MB)
                      </p>
                      <Button
                        variant="outline"
                        className="h-10 rounded-xl px-5 border-white/10 hover:bg-white/5 hover:text-white text-xs font-bold mt-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        Select File
                      </Button>
                    </>
                  ) : (
                    <div className="w-full space-y-4 text-left">
                      <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
                        <div className="h-10 w-10 rounded-lg bg-intelligence-blue/15 flex items-center justify-center text-intelligence-blue shrink-0">
                          <FileIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{selectedFile.name}</p>
                          <p className="text-[10px] text-white/40 mt-0.5 uppercase">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type || "unknown mime"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          className="h-8 rounded-lg px-3 border border-white/10 text-[10px] font-black uppercase text-white/60 hover:text-white hover:bg-white/5"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* URL LINK PANEL */}
              {activeTab === "url" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/50 uppercase tracking-wider">
                      Evidence Title
                    </label>
                    <input
                      type="text"
                      value={urlTitleInput}
                      onChange={(e) => setUrlTitleInput(e.target.value)}
                      placeholder="e.g. Corporate Privacy Statement"
                      disabled={isUploading}
                      className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-intelligence-blue transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/50 uppercase tracking-wider">
                      Website URL
                    </label>
                    <div className="relative flex items-center">
                      <LinkIcon className="absolute left-4 h-4 w-4 text-white/30" />
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/privacy"
                        disabled={isUploading}
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-intelligence-blue transition-colors"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 leading-normal mt-1">
                      TrustDesk will ingest, parse, and verify claims at the provided URL.
                    </p>
                  </div>
                </div>
              )}

              {/* TEXT NOTE PANEL */}
              {activeTab === "note" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/50 uppercase tracking-wider">
                      Evidence Title
                    </label>
                    <input
                      type="text"
                      value={noteTitleInput}
                      onChange={(e) => setNoteTitleInput(e.target.value)}
                      placeholder="e.g. Model Training Consent Clause"
                      disabled={isUploading}
                      className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-intelligence-blue transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/50 uppercase tracking-wider">
                      Written Statement / Note Details
                    </label>
                    <textarea
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Paste standard security clauses, consent policy details, or a brief operational note describing how customer data isolation is achieved..."
                      disabled={isUploading}
                      rows={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-intelligence-blue transition-colors resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Uploading progress indicator */}
            {isUploading && (
              <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-2 shrink-0">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>Uploading and processing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-intelligence-blue h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error state */}
            {uploadError && (
              <div className="p-4 bg-error-red/10 border border-error-red/20 rounded-2xl flex items-start gap-3 shrink-0">
                <AlertCircleIcon className="h-5 w-5 text-error-red shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-error-red">Upload failed</p>
                  <p className="text-[10px] text-white/70 mt-0.5">{uploadError}</p>
                </div>
              </div>
            )}

            {/* Success state */}
            {uploadSuccess && (
              <div className="p-4 bg-trust-green/10 border border-trust-green/20 rounded-2xl flex items-start gap-3 shrink-0">
                <CheckIcon className="h-5 w-5 text-trust-green shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-trust-green">Evidence added successfully</p>
                  <p className="text-[10px] text-white/70 mt-0.5">
                    TrustDesk will re-score affected trust topics in the background.
                  </p>
                  {documentReviewHref && (
                    <a
                      href={documentReviewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-[9px] font-black uppercase tracking-wider text-intelligence-blue hover:underline mt-2"
                    >
                      Review in Documents Hub →
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-brand-navy/40 shrink-0">
          <span className="text-[10px] text-white/40 font-medium">
            Ingested evidence undergoes automated parsing, compliance mapping, and PI extraction.
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="h-11 rounded-xl px-5 border-white/10 text-white/80 hover:bg-white/5 hover:text-white text-xs font-bold"
            >
              {uploadSuccess ? "Close" : "Cancel"}
            </Button>
            <Button
              onClick={uploadSuccess ? handleClose : handleUpload}
              disabled={
                isUploading ||
                (activeTab === "file" && !selectedFile) ||
                (activeTab === "url" && !urlInput.trim()) ||
                (activeTab === "note" && !noteInput.trim())
              }
              className={`min-w-[140px] h-11 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all ${
                uploadSuccess
                  ? "bg-trust-green text-white hover:bg-trust-green"
                  : "bg-intelligence-blue text-white hover:bg-intelligence-blue-hover"
              }`}
            >
              {isUploading ? (
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : uploadSuccess ? (
                "Done"
              ) : (
                "Submit Evidence"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
