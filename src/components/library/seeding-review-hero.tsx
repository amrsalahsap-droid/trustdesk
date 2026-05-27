"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookIcon, SparklesIcon, MagicIcon, ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface SeedingReviewHeroProps {
  draftCount: number;
  topicCount: number;
  onStartReview: () => void;
  onDismiss: () => void;
}

export function SeedingReviewHero({
  draftCount,
  topicCount,
  onStartReview,
  onDismiss
}: SeedingReviewHeroProps) {
  return (
    <Card 
      noPadding 
      className="relative overflow-hidden border-none bg-gradient-to-br from-accent-primary via-accent-primary/90 to-blue-700 p-8 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-700"
    >
      {/* Decorative background elements */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-10 right-10 h-40 w-40 rounded-full bg-blue-400/20 blur-2xl" />
      
      <div className="relative z-10 flex flex-col items-start gap-8 lg:flex-row lg:items-center">
        {/* Visual Badge/Icon */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-md shadow-inner ring-1 ring-white/20">
          <BookIcon className="h-10 w-10 text-white" />
          <div className="absolute -right-2 -top-2 flex h-8 w-8 animate-bounce items-center justify-center rounded-full bg-semantic-warning shadow-lg">
            <SparklesIcon className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Text Content */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
              AI Synthesis Complete
            </span>
          </div>
          <h2 className="max-w-xl text-3xl font-black tracking-tight text-white leading-tight">
            We've built your knowledge baseline.
          </h2>
          <p className="max-w-2xl text-base font-medium text-white/80 leading-relaxed">
            Your documents have been parsed into <span className="font-bold text-white underline decoration-white/30 underline-offset-4">{draftCount} draft answers</span> across <span className="font-bold text-white underline decoration-white/30 underline-offset-4">{topicCount} domain topics</span>. Review and verify them to power your first questionnaire.
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-3 min-w-[200px]">
          <Button 
            onClick={onStartReview}
            variant="secondary"
            className="w-full h-12 bg-white text-accent-primary hover:bg-white/90 font-bold shadow-xl border-none transition-all hover:scale-[1.02] active:scale-[0.98]"
            leftIcon={<MagicIcon className="h-4 w-4" />}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
          >
            Start Verification
          </Button>
          <button 
            onClick={onDismiss}
            className="text-[11px] font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors text-center py-2"
          >
            I'll review later
          </button>
        </div>
      </div>

      {/* Stats micro-footer */}
      <div className="mt-8 flex items-center gap-6 border-t border-white/10 pt-6">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-semantic-success animate-pulse" />
          <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
            Verified Source Grounding: 100%
          </span>
        </div>
        <div className="h-1 w-1 rounded-full bg-white/20" />
        <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
          Multi-document Synthesis Active
        </span>
      </div>
    </Card>
  );
}
