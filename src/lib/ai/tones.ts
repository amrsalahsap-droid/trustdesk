/**
 * Professional tones for security questionnaire responses.
 * These modifiers affect the wording and style of synthesized answers
 * while preserving the underlying factual evidence.
 */

export const RESPONSE_TONES = {
  concise: {
    label: "Concise",
    description: "Brief, direct, and operational. No filler.",
    promptModifier: "Synthesize a BRIEF and ACCURATE security response. BAN ALL FILLER. No 'Regarding...', 'We take security seriously...', or 'This approach aligns...'. START IMMEDIATELY with the actionable policy or control. Be concise and operational.",
  },
  formal: {
    label: "Formal",
    description: "Professional, polite, and complete sentences.",
    promptModifier: "Use a professional and formal tone. Use complete sentences and standard business terminology. Ensure the response is polished and suitable for official documentation.",
  },
  enterprise: {
    label: "Enterprise / Procurement-ready",
    description: "Tailored for large-scale vendor risk reviews.",
    promptModifier: "Tailor the response for enterprise procurement and vendor risk management reviews. Be detailed, professional, and reassuring. Use terminology common in GRC (Governance, Risk, and Compliance) workflows.",
  },
  technical: {
    label: "Technical",
    description: "Focused on implementation and protocols.",
    promptModifier: "Use a deeply technical tone. Focus on implementation details, specific protocols, architectural controls, and engineering-level specifics. Avoid marketing language.",
  },
  customer_friendly: {
    label: "Customer-friendly",
    description: "Approachable and clear for non-technical users.",
    promptModifier: "Maintain an approachable yet professional tone. Explain security concepts clearly and avoid unnecessary jargon where possible. Ensure the response is accessible to a non-technical customer audience.",
  },
  compliance: {
    label: "Security/Compliance-focused",
    description: "Aligned with SOC2, ISO27001, etc.",
    promptModifier: "Focus on specific control frameworks (e.g., SOC2, ISO27001, NIST). Use compliance-heavy terminology and reference typical audit requirements or control families where relevant.",
  },
  executive: {
    label: "Executive Summary",
    description: "High-level summary of outcomes and risk.",
    promptModifier: "Provide a high-level summary suitable for leadership. Focus on outcomes, risk mitigation, and broad policy alignment rather than granular implementation details.",
  },
} as const;

export type ResponseTone = keyof typeof RESPONSE_TONES;

export const DEFAULT_TONE: ResponseTone = "concise";

export function getToneModifier(tone?: string): string {
  if (tone && tone in RESPONSE_TONES) {
    return RESPONSE_TONES[tone as ResponseTone].promptModifier;
  }
  return RESPONSE_TONES[DEFAULT_TONE].promptModifier;
}
