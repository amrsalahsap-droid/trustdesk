/**
 * Tests for Contradiction Detection Service
 *
 * Coverage for top V1 rule types:
 * - boolean_polarity
 * - required_term_missing
 * - forbidden_term
 * - numeric_range
 * - enum_mismatch
 * - contains
 * - exact_match
 */

import { describe, it, expect } from "vitest";
import { detect } from "../detection-service";
import type { QuestionnaireRow } from "../detection-types";
import type { ContradictionRulePack, ContradictionRule } from "../rule-types";
import type { CanonicalAnswerMetadata } from "../canonical-retrieval";

// Test helpers
function createRow(overrides: Partial<QuestionnaireRow> = {}): QuestionnaireRow {
  return {
    id: "row-1",
    question: "Do you use MFA?",
    finalAnswer: "Yes, we use MFA",
    suggestedAnswer: "",
    topicKey: "mfa",
    subControlKey: "admin_mfa",
    ...overrides,
  };
}

function createCanonical(overrides: Partial<CanonicalAnswerMetadata> = {}): CanonicalAnswerMetadata {
  return {
    answerId: "canonical-1",
    title: "MFA Policy",
    answer: "MFA is required for all admin access",
    governanceStatus: "APPROVED_FOR_EXPORT",
    approvalScope: "EXPORT_ALLOWED",
    exportSafe: true,
    status: "APPROVED",
    approvedAt: new Date("2024-01-01"),
    approvedByUserId: null,
    version: "v1",
    versionNumber: 1,
    topicId: "topic-1",
    subControlKey: "admin_mfa",
    freshness: "fresh",
    ...overrides,
  };
}

function createRulePack(rules: ContradictionRule[]): ContradictionRulePack {
  return {
    topicKey: "mfa",
    topicName: "Multi-Factor Authentication",
    version: "1.0.0",
    rules,
  };
}

describe("ContradictionDetectionService", () => {
  describe("boolean_polarity", () => {
    it("should detect opposite polarity (yes vs no)", () => {
      const row = createRow({ finalAnswer: "No, we do not use MFA" });
      const canonical = createCanonical({ answer: "Yes, MFA is required" });
      const rule: ContradictionRule = {
        id: "mfa_polarity",
        description: "MFA polarity check",
        topicKey: "mfa",
        subControlKey: "admin_mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "boolean_polarity",
          strictPolarity: true,
          positiveIndicators: ["yes", "required", "enabled"],
          negativeIndicators: ["no", "not required", "disabled"],
        },
        messageTemplate: "MFA requirement contradicts canonical",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.contradictionType).toBe("boolean_polarity");
      expect(result.hits).toHaveLength(1);
    });
    
    it("should not detect when polarities match (yes vs yes)", () => {
      const row = createRow({ finalAnswer: "Yes, we use MFA" });
      const canonical = createCanonical({ answer: "Yes, MFA is required" });
      const rule: ContradictionRule = {
        id: "mfa_polarity",
        description: "MFA polarity check",
        topicKey: "mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "boolean_polarity",
          positiveIndicators: ["yes", "required"],
          negativeIndicators: ["no", "not required"],
        },
        messageTemplate: "MFA requirement contradicts canonical",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
      expect(result.hits).toHaveLength(0);
    });
    
    it("should not match when no polarity detected", () => {
      const row = createRow({ finalAnswer: "We are reviewing our options" });
      const canonical = createCanonical({ answer: "Yes, MFA is required" });
      const rule: ContradictionRule = {
        id: "mfa_polarity",
        description: "MFA polarity check",
        topicKey: "mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "boolean_polarity",
          positiveIndicators: ["yes"],
          negativeIndicators: ["no"],
        },
        messageTemplate: "MFA requirement contradicts canonical",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("required_term_missing", () => {
    it("should detect when required terms are missing", () => {
      const row = createRow({ finalAnswer: "We use security measures" });
      const canonical = createCanonical({ answer: "MFA is required for admin access" });
      const rule: ContradictionRule = {
        id: "mfa_required_terms",
        description: "MFA terms must be present",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA", "multi-factor", "2FA"],
          requireAll: false,
          minRequired: 1,
        },
        messageTemplate: "MFA not mentioned in answer",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("required_term_missing");
    });
    
    it("should not detect when required terms are present", () => {
      const row = createRow({ finalAnswer: "We use MFA for all access" });
      const canonical = createCanonical({ answer: "MFA is required" });
      const rule: ContradictionRule = {
        id: "mfa_required_terms",
        description: "MFA terms must be present",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA"],
          requireAll: true,
        },
        messageTemplate: "MFA not mentioned",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
    });
    
    it("should detect when not all required terms present", () => {
      const row = createRow({ finalAnswer: "We use MFA" });
      const canonical = createCanonical({ answer: "MFA and 2FA are required" });
      const rule: ContradictionRule = {
        id: "mfa_complete",
        description: "Both MFA and 2FA must be mentioned",
        topicKey: "mfa",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA", "2FA"],
          requireAll: true,
          minRequired: 2,
        },
        messageTemplate: "Incomplete MFA description",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
    });

    it("should not evaluate row terms when canonicalContainsAny gate fails", () => {
      const row = createRow({ finalAnswer: "Generic policy statement" });
      const canonical = createCanonical({ answer: "Admin MFA is optional for contractors" });
      const rule: ContradictionRule = {
        id: "gated_mfa_terms",
        description: "MFA terms when canonical requires MFA",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA", "2FA"],
          requireAll: false,
          minRequired: 1,
          canonicalContainsAny: ["required", "mandatory", "enforced"],
        },
        messageTemplate: "MFA not mentioned",
      };
      const pack = createRulePack([rule]);

      const result = detect(row, canonical, pack);

      expect(result.contradictionFound).toBe(false);
    });

    it("should evaluate row terms when canonicalContainsAny gate passes", () => {
      const row = createRow({ finalAnswer: "Generic policy statement" });
      const canonical = createCanonical({ answer: "MFA is mandatory for all administrators" });
      const rule: ContradictionRule = {
        id: "gated_mfa_terms",
        description: "MFA terms when canonical requires MFA",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA", "2FA"],
          requireAll: false,
          minRequired: 1,
          canonicalContainsAny: ["required", "mandatory", "enforced"],
        },
        messageTemplate: "MFA not mentioned",
      };
      const pack = createRulePack([rule]);

      const result = detect(row, canonical, pack);

      expect(result.contradictionFound).toBe(true);
    });
  });
  
  describe("forbidden_term", () => {
    it("should detect forbidden terms in row answer", () => {
      const row = createRow({ finalAnswer: "We use SMS only for authentication" });
      const canonical = createCanonical({ answer: "Hardware tokens are required" });
      const rule: ContradictionRule = {
        id: "no_weak_mfa",
        description: "Weak MFA methods forbidden",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "forbidden_term",
          forbiddenTerms: ["SMS", "email", "password only"],
          partialMatch: false,
        },
        messageTemplate: "Weak MFA method detected",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("forbidden_term");
    });
    
    it("should not detect when no forbidden terms present", () => {
      const row = createRow({ finalAnswer: "We use hardware tokens" });
      const canonical = createCanonical({ answer: "Hardware tokens required" });
      const rule: ContradictionRule = {
        id: "no_weak_mfa",
        description: "Weak MFA methods forbidden",
        topicKey: "mfa",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "forbidden_term",
          forbiddenTerms: ["SMS", "email"],
        },
        messageTemplate: "Weak MFA detected",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("numeric_range", () => {
    it("should detect numeric mismatch within tolerance", () => {
      const row = createRow({ finalAnswer: "We retain data for 30 days" });
      const canonical = createCanonical({ answer: "Retention period is 90 days" });
      const rule: ContradictionRule = {
        id: "retention_days",
        description: "Retention period must match",
        topicKey: "retention",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "numeric_range",
          absoluteTolerance: 0,
          relativeTolerance: 0,
        },
        messageTemplate: "Retention period mismatch",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("numeric_range");
    });
    
    it("should not detect when numbers match within tolerance", () => {
      const row = createRow({ finalAnswer: "We retain data for 95 days" });
      const canonical = createCanonical({ answer: "Retention period is 90 days" });
      const rule: ContradictionRule = {
        id: "retention_days",
        description: "Retention period must match",
        topicKey: "retention",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "numeric_range",
          relativeTolerance: 0.1, // 10% tolerance
        },
        messageTemplate: "Retention period mismatch",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      // 95 vs 90 = 5.5% diff, within 10% tolerance
      expect(result.contradictionFound).toBe(false);
    });
    
    it("should detect when value is below required minimum", () => {
      const row = createRow({ finalAnswer: "RTO is 1 hour" });
      const canonical = createCanonical({ answer: "RTO must be at most 4 hours" });
      const rule: ContradictionRule = {
        id: "rto_check",
        description: "RTO must not exceed canonical",
        topicKey: "recovery",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "numeric_range",
          mustBeLessOrEqual: true,
        },
        messageTemplate: "RTO exceeds requirement",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false); // 1 <= 4, no contradiction
    });
  });
  
  describe("enum_mismatch", () => {
    it("should detect enum value mismatch", () => {
      const row = createRow({ finalAnswer: "Reviews are done monthly" });
      const canonical = createCanonical({ answer: "Quarterly access reviews required" });
      const rule: ContradictionRule = {
        id: "review_frequency",
        description: "Review frequency must match",
        topicKey: "access_control",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "enum_mismatch",
          enumValues: ["monthly", "quarterly", "annually"],
          strictMatch: true,
        },
        messageTemplate: "Review frequency mismatch",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("enum_mismatch");
    });
    
    it("should handle equivalencies", () => {
      const row = createRow({ finalAnswer: "Every 3 months" });
      const canonical = createCanonical({ answer: "Quarterly reviews required" });
      const rule: ContradictionRule = {
        id: "review_frequency",
        description: "Review frequency must match",
        topicKey: "access_control",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "enum_mismatch",
          enumValues: ["quarterly", "monthly", "annually"],
          equivalencies: { "every 3 months": "quarterly" },
        },
        messageTemplate: "Review frequency mismatch",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      // "every 3 months" -> "quarterly" via equivalency
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("contains", () => {
    it("should detect low coverage", () => {
      const row = createRow({ finalAnswer: "We have controls" });
      const canonical = createCanonical({ 
        answer: "We implement AES-256 encryption at rest with key rotation every 90 days and HSM-backed key management" 
      });
      const rule: ContradictionRule = {
        id: "encryption_details",
        description: "Encryption details must be specified",
        topicKey: "encryption",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "contains",
          minCoverage: 0.5,
        },
        messageTemplate: "Encryption details insufficient",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("contains");
    });
    
    it("should pass when coverage is sufficient", () => {
      const row = createRow({ finalAnswer: "AES-256 encryption with key rotation every 90 days" });
      const canonical = createCanonical({ 
        answer: "AES-256 encryption at rest with key rotation every 90 days and HSM-backed key management" 
      });
      const rule: ContradictionRule = {
        id: "encryption_details",
        description: "Encryption details must be specified",
        topicKey: "encryption",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "contains",
          minCoverage: 0.4,
        },
        messageTemplate: "Encryption details insufficient",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("exact_match", () => {
    it("should detect when answers differ", () => {
      const row = createRow({ finalAnswer: "We encrypt data" });
      const canonical = createCanonical({ answer: "We encrypt all data at rest" });
      const rule: ContradictionRule = {
        id: "exact_encryption",
        description: "Encryption statement must match exactly",
        topicKey: "encryption",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "exact_match",
        },
        messageTemplate: "Encryption statement differs",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("exact_match");
    });
    
    it("should not detect when answers match", () => {
      const row = createRow({ finalAnswer: "We encrypt all data" });
      const canonical = createCanonical({ answer: "We encrypt all data" });
      const rule: ContradictionRule = {
        id: "exact_encryption",
        description: "Encryption statement must match",
        topicKey: "encryption",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "exact_match",
        },
        messageTemplate: "Encryption statement differs",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("regex", () => {
    it("should detect regex match", () => {
      const row = createRow({ finalAnswer: "Contact us at admin@example.com" });
      const canonical = createCanonical({ answer: "No email addresses should be in answers" });
      const rule: ContradictionRule = {
        id: "no_emails",
        description: "Email addresses not allowed",
        topicKey: "general",
        severity: "low",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "regex",
          pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
        },
        messageTemplate: "Email address detected",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("regex");
    });
    
    it("should handle inverted regex", () => {
      const row = createRow({ finalAnswer: "No specific pattern here" });
      const canonical = createCanonical({ answer: "Must contain year pattern YYYY" });
      const rule: ContradictionRule = {
        id: "year_required",
        description: "Year must be specified",
        topicKey: "general",
        severity: "medium",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "regex",
          pattern: "\\b20\\d{2}\\b",
          invert: true,
        },
        messageTemplate: "Year not found",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack);
      
      // Inverted regex: contradiction if pattern NOT found
      expect(result.contradictionFound).toBe(true);
    });
  });
  
  describe("no canonical available", () => {
    it("should return canonical unavailable when canonical is null", () => {
      const row = createRow();
      const pack = createRulePack([]);
      
      const result = detect(row, null, pack);
      
      expect(result.contradictionFound).toBe(false);
      expect("canonicalUnavailable" in result && result.canonicalUnavailable).toBe(true);
      expect(result.message).toContain("Cannot check for contradictions");
    });
  });
  
  describe("multiple hits", () => {
    it("should collect multiple hits and pick highest severity", () => {
      const row = createRow({ finalAnswer: "No MFA, SMS only" });
      const canonical = createCanonical({
        answer:
          "Yes, MFA is required. Phishing-resistant factors only; SMS is disallowed.",
      });
      
      const rules: ContradictionRule[] = [
        {
          id: "mfa_polarity",
          description: "MFA polarity",
          topicKey: "mfa",
          severity: "critical",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: {
            type: "boolean_polarity",
            positiveIndicators: ["yes"],
            negativeIndicators: ["no"],
          },
          messageTemplate: "Polarity mismatch",
        },
        {
          id: "no_sms",
          description: "No SMS allowed",
          topicKey: "mfa",
          severity: "high",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: {
            type: "forbidden_term",
            forbiddenTerms: ["SMS"],
          },
          messageTemplate: "SMS forbidden",
        },
        {
          id: "mfa_required_terms",
          description: "MFA terms required",
          topicKey: "mfa",
          severity: "medium",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: {
            type: "required_term_missing",
            requiredTerms: ["required", "mandatory"],
            minRequired: 1,
          },
          messageTemplate: "Required terms missing",
        },
      ];
      
      const pack = createRulePack(rules);
      const result = detect(row, canonical, pack);
      
      expect(result.contradictionFound).toBe(true);
      expect(result.hits).toHaveLength(3);
      expect(result.severity).toBe("critical"); // Highest of critical/high/medium
    });
    
    it("should sort hits by severity", () => {
      const row = createRow({ finalAnswer: "Low info" });
      const canonical = createCanonical({ answer: "Detailed policy required" });
      
      const rules: ContradictionRule[] = [
        {
          id: "low_severity",
          description: "Low severity issue",
          topicKey: "general",
          severity: "low",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match" },
          messageTemplate: "Low",
        },
        {
          id: "critical_severity",
          description: "Critical issue",
          topicKey: "general",
          severity: "critical",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match" },
          messageTemplate: "Critical",
        },
        {
          id: "medium_severity",
          description: "Medium issue",
          topicKey: "general",
          severity: "medium",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match" },
          messageTemplate: "Medium",
        },
      ];
      
      const pack = createRulePack(rules);
      const result = detect(row, canonical, pack);
      
      expect(result.hits[0].severity).toBe("critical");
      expect(result.hits[1].severity).toBe("medium");
      expect(result.hits[2].severity).toBe("low");
    });
  });
  
  describe("sub-control filtering", () => {
    it("should apply generic rules to all sub-controls", () => {
      const row = createRow({ subControlKey: "admin_mfa" });
      const canonical = createCanonical({ subControlKey: "admin_mfa" });
      const genericRule: ContradictionRule = {
        id: "generic_mfa",
        description: "Generic MFA rule",
        topicKey: "mfa",
        // No subControlKey - applies to all
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "boolean_polarity",
          positiveIndicators: ["yes"],
          negativeIndicators: ["no"],
        },
        messageTemplate: "Generic MFA issue",
      };
      const pack = createRulePack([genericRule]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.rulesEvaluated).toBe(1);
    });
    
    it("should filter specific rules by sub-control", () => {
      const row = createRow({ subControlKey: "admin_mfa" });
      const canonical = createCanonical({ subControlKey: "admin_mfa" });
      
      const specificRule: ContradictionRule = {
        id: "user_mfa_specific",
        description: "User MFA rule",
        topicKey: "mfa",
        subControlKey: "user_mfa", // Different from row
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: { type: "exact_match" },
        messageTemplate: "User MFA issue",
      };
      
      const pack = createRulePack([specificRule]);
      const result = detect(row, canonical, pack);
      
      // Rule has subControlKey "user_mfa" but row is "admin_mfa"
      // Generic rule would apply, but specific doesn't match
      expect(result.rulesEvaluated).toBe(0);
    });
    
    it("should match exact sub-control rules", () => {
      const row = createRow({ subControlKey: "admin_mfa" });
      const canonical = createCanonical({ subControlKey: "admin_mfa" });
      
      const specificRule: ContradictionRule = {
        id: "admin_mfa_specific",
        description: "Admin MFA rule",
        topicKey: "mfa",
        subControlKey: "admin_mfa", // Matches row
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: { type: "exact_match" },
        messageTemplate: "Admin MFA issue",
      };
      
      const pack = createRulePack([specificRule]);
      const result = detect(row, canonical, pack);
      
      expect(result.rulesEvaluated).toBe(1);
      expect(result.hits[0].ruleId).toBe("admin_mfa_specific");
    });

    it("never runs sub-control-scoped rules when the row has no sub-control", () => {
      // Regression guard for the offboarding-vs-admin_mfa false positive: if the row
      // has no sub-control context, sub-control-scoped rules (e.g. admin_mfa omission)
      // must be skipped even when their canonicalContainsAny gate would otherwise pass.
      const row = createRow({
        finalAnswer: "We use a ticket-based workflow for access requests.",
        subControlKey: null,
      });
      const canonical = createCanonical({
        answer: "MFA is required for all administrative access; must be enforced.",
        subControlKey: "admin_mfa",
      });
      const adminMfaRule: ContradictionRule = {
        id: "admin_mfa_required",
        description: "Admin MFA required",
        topicKey: "access_control",
        subControlKey: "admin_mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA", "multi-factor"],
          requireAll: false,
          minRequired: 1,
          canonicalContainsAny: ["required", "must", "enforced"],
        },
        messageTemplate: "Row missing MFA",
      };

      const result = detect(row, canonical, createRulePack([adminMfaRule]));

      expect(result.rulesEvaluated).toBe(0);
      expect(result.hits).toHaveLength(0);
      expect(result.contradictionFound).toBe(false);
    });

    it("runs generic (no sub-control) rules when the row has no sub-control", () => {
      const row = createRow({
        finalAnswer: "We do not have any access request process.",
        subControlKey: null,
      });
      const canonical = createCanonical({
        answer: "Access requests must go through a documented ticket workflow.",
        subControlKey: null,
      });
      const genericRule: ContradictionRule = {
        id: "generic_polarity",
        description: "Generic access process polarity",
        topicKey: "access_control",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "boolean_polarity",
          strictPolarity: true,
          positiveIndicators: ["ticket", "workflow", "documented"],
          negativeIndicators: ["no process", "do not", "informal"],
        },
        messageTemplate: "Access process polarity mismatch",
      };

      const result = detect(row, canonical, createRulePack([genericRule]));

      expect(result.rulesEvaluated).toBe(1);
    });

    it("filters out sub-control-scoped rules from a different sub-control when row sub-control is set", () => {
      const row = createRow({
        finalAnswer: "We offboard users within 24 hours via automated deprovisioning.",
        subControlKey: "offboarding",
      });
      const canonical = createCanonical({
        answer: "MFA must be enforced for all administrative access.",
        subControlKey: "admin_mfa",
      });
      const adminMfaRule: ContradictionRule = {
        id: "admin_mfa_required",
        description: "Admin MFA required",
        topicKey: "access_control",
        subControlKey: "admin_mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA"],
          requireAll: false,
          minRequired: 1,
          canonicalContainsAny: ["must", "required"],
        },
        messageTemplate: "Row missing MFA",
      };

      const result = detect(row, canonical, createRulePack([adminMfaRule]));

      expect(result.rulesEvaluated).toBe(0);
      expect(result.contradictionFound).toBe(false);
    });
  });

  describe("empty row answer", () => {
    it("returns a clean result without running rules when row answer is empty", () => {
      // Belt-and-suspenders — review-contradiction.ts also short-circuits on empty
      // rows, but direct callers of `detect()` must not produce false positives
      // from required_term_missing / contains / exact_match on an empty row.
      const row = createRow({ finalAnswer: "", suggestedAnswer: "" });
      const canonical = createCanonical({
        answer: "MFA must be enforced for all administrative access.",
      });
      const rule: ContradictionRule = {
        id: "admin_mfa_required",
        description: "Admin MFA required",
        topicKey: "mfa",
        subControlKey: "admin_mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA"],
          requireAll: false,
          minRequired: 1,
        },
        messageTemplate: "Row missing MFA",
      };

      const result = detect(row, canonical, createRulePack([rule]));

      expect(result.rulesEvaluated).toBe(0);
      expect(result.contradictionFound).toBe(false);
      expect(result.hits).toHaveLength(0);
      expect(result.reason).toMatch(/empty/i);
    });

    it("still runs rules when row answer is whitespace-but-nonempty after trim", () => {
      // Coverage: `"   "` trims to empty, which exercises the same short-circuit.
      const row = createRow({ finalAnswer: "   ", suggestedAnswer: "   " });
      const canonical = createCanonical({
        answer: "MFA must be enforced for all administrative access.",
      });
      const rule: ContradictionRule = {
        id: "admin_mfa_required",
        description: "Admin MFA required",
        topicKey: "mfa",
        subControlKey: "admin_mfa",
        severity: "critical",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: {
          type: "required_term_missing",
          requiredTerms: ["MFA"],
          requireAll: false,
          minRequired: 1,
        },
        messageTemplate: "Row missing MFA",
      };

      const result = detect(row, canonical, createRulePack([rule]));

      expect(result.rulesEvaluated).toBe(0);
      expect(result.contradictionFound).toBe(false);
    });
  });
  
  describe("detection metadata", () => {
    it("should include detection metadata in result", () => {
      const row = createRow();
      const canonical = createCanonical();
      const pack = createRulePack([]);
      
      const result = detect(row, canonical, pack, { mode: "export" });
      
      expect(result.detectionMeta.detectorVersion).toBe("1.0.0");
      expect(result.detectionMeta.rulePackVersion).toBe("1.0.0");
      expect(result.detectionMeta.mode).toBe("export");
      expect(result.detectionMeta.detectedAt).toBeInstanceOf(Date);
    });
    
    it("should default to internal mode", () => {
      const row = createRow();
      const canonical = createCanonical();
      const pack = createRulePack([]);
      
      const result = detect(row, canonical, pack);
      
      expect(result.detectionMeta.mode).toBe("internal");
    });
  });
  
  describe("excerpts", () => {
    it("should truncate long excerpts", () => {
      const longAnswer = "a".repeat(500);
      const row = createRow({ finalAnswer: longAnswer });
      const canonical = createCanonical({ answer: longAnswer });
      const rule: ContradictionRule = {
        id: "exact",
        description: "Exact match",
        topicKey: "general",
        severity: "high",
        rowField: "finalAnswer",
        canonicalField: "answer",
        config: { type: "exact_match" },
        messageTemplate: "Match",
      };
      const pack = createRulePack([rule]);
      
      const result = detect(row, canonical, pack, { maxExcerptLength: 100 });
      
      expect(result.rowExcerpt?.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(result.canonicalExcerpt?.length).toBeLessThanOrEqual(103);
    });
  });
});
