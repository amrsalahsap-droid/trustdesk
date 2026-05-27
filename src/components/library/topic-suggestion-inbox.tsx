"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CloseIcon, SparklesIcon, HelpCircleIcon, ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SuggestedTopic = {
  id: string;
  key: string;
  name: string;
  description: string;
  suggestionReason: string | null;
};

interface TopicSuggestionInboxProps {
  onReview: (topic: SuggestedTopic) => void;
  onApproved: (topicId: string) => void;
  onDismissed: (topicId: string) => void;
  refreshKey?: number;
}

export function TopicSuggestionInbox({ onReview, onApproved, onDismissed, refreshKey = 0 }: TopicSuggestionInboxProps) {
  const [suggestions, setSuggestions] = useState<SuggestedTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);


  // Source identification logic
  const getSourceInfo = (reason: string | null) => {
    if (!reason) return { label: "Library Suggestion", color: "bg-surface-base text-text-muted" };
    if (reason.toLowerCase().includes("business profile")) 
      return { label: "Onboarding Recommendation", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
    if (reason.toLowerCase().includes("semantic cluster") || reason.toLowerCase().includes("documents")) 
      return { label: "Document Discovery", color: "bg-accent-primary/10 text-accent-primary border-accent-primary/20" };
    if (reason.toLowerCase().includes("questionnaire") || reason.toLowerCase().includes("gap")) 
      return { label: "Gap Discovery", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
    return { label: "AI Suggestion", color: "bg-accent-primary/10 text-accent-primary border-accent-primary/20" };
  };

  async function fetchSuggestions() {
    try {
      const res = await fetch("/api/knowledge/topics?status=SUGGESTED");
      const data = await res.json();
      if (res.ok) {
        setSuggestions(data.topics || []);
      }
    } catch (err) {
      console.error("Failed to fetch suggestions", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchSuggestions();
    
    // D10-EN-03: Polling for background-discovered topics
    const interval = setInterval(fetchSuggestions, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [refreshKey]);

  async function handleScan() {
    setIsScanning(true);
    try {
        // Run both Document and Gap discovery
        await Promise.all([
            fetch("/api/workspaces/discovery", { method: "POST" }),
            fetch("/api/workspaces/discovery/gaps", { method: "POST" })
        ]);
        await fetchSuggestions();
    } catch (err) {
        console.error("Discovery scan failed", err);
    } finally {
        setIsScanning(false);
    }
  }

  async function handleDismiss(id: string) {
    try {
      const res = await fetch(`/api/knowledge/topics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "ARCHIVED" })
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
        onDismissed(id);
      }
    } catch (err) {
      console.error("Dismissal failed", err);
    }
  }


  if (isLoading && suggestions.length === 0) return null;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">
           <SparklesIcon className="h-3 w-3" />
           Knowledge Discovery
        </div>
        <Button variant="ghost" size="sm" onClick={handleScan} isLoading={isScanning} className="text-[10px] font-bold uppercase tracking-widest">
           Run Scan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suggestions.length === 0 ? (
           <Card className="col-span-full border-dashed border-surface-border bg-white p-8 flex flex-col items-center justify-center text-center opacity-80">
              <div className="h-10 w-10 rounded-full bg-surface-base flex items-center justify-center mb-3">
                 <CheckIcon className="h-5 w-5 text-text-muted" />
              </div>
              <p className="text-sm font-bold text-text-primary">Discovery Inbox Clean</p>
              <p className="text-xs text-text-muted mt-1">No new knowledge patterns detected.</p>
           </Card>
        ) : suggestions.map((suggestion) => {
          const source = getSourceInfo(suggestion.suggestionReason);
          return (
            <Card key={suggestion.id} className="relative group overflow-hidden border-accent-primary/10 bg-white p-5 shadow-sm ring-1 ring-accent-primary/5 transition-all hover:shadow-md hover:border-accent-primary/30">
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-3">
                   <div className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border", source.color)}>
                      {source.label}
                   </div>
                   <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleDismiss(suggestion.id)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-text-muted hover:bg-semantic-error-bg hover:text-semantic-error transition-colors"
                        title="Dismiss"
                      >
                         <CloseIcon className="h-3 w-3" />
                      </button>
                   </div>
                </div>

                <h4 className="text-sm font-bold text-text-primary group-hover:text-accent-primary transition-colors">{suggestion.name}</h4>
                <p className="mt-1.5 text-xs text-text-muted leading-relaxed line-clamp-2 mb-4 flex-1">
                  {suggestion.description}
                </p>

                <div className="flex items-center gap-2 pt-3 border-t border-surface-border/50 mt-auto">
                   <Button variant="primary" size="sm" className="w-full text-[10px] font-bold uppercase tracking-wider" onClick={() => onReview(suggestion)}>
                      Review Topic
                   </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
