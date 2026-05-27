import { mapConfidenceTier, confidenceTierShortLabel, confidenceTierDescription } from "@/components/trust/map-confidence-tier";
import { StatusSignal } from "@/components/ui/status-signal";
import type { ConfidenceTierLevel } from "@/components/trust/map-confidence-tier";
import type { TrustDensity } from "@/components/trust/evidence-presence";

interface ConfidenceTierProps {
  confidenceScore: number | null | undefined;
  /** When true, shows a 3-segment discrete meter (detail / questionnaire). */
  showMeter?: boolean;
  density?: TrustDensity;
}

function meterActive(tier: ConfidenceTierLevel, segment: 0 | 1 | 2): boolean {
  if (tier === "manual") return false;
  const idx = tier === "high" ? 0 : tier === "medium" ? 1 : 2;
  return segment === idx;
}

export function ConfidenceTier({ confidenceScore, showMeter = false, density = "sm" }: ConfidenceTierProps) {
  const tier = mapConfidenceTier(confidenceScore);
  const label = confidenceTierShortLabel(tier);
  const md = density === "md";

  const statusKey = {
    "high": "ans_approved",
    "medium": "ans_draft", // Neutral-ish
    "low": "ans_low_confidence",
    "manual": "ans_draft",
  }[tier] || "ans_draft";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${md ? "min-h-11" : ""}`}>
      <StatusSignal 
        status={statusKey as any} 
        label={label}
        variant={md ? "badge" : "subtle" as any}
      />
      {showMeter && tier !== "manual" ? (
        <div className="flex h-1.5 w-20 shrink-0 gap-0.5 overflow-hidden rounded-full border border-white/5 bg-white/5 p-px">
          {([0, 1, 2] as const).map((seg) => (
            <div
              key={seg}
              className={`h-full flex-1 rounded-sm transition-colors ${
                meterActive(tier, seg) ? "bg-accent-primary" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
