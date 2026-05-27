/**
 * Tests for Contradiction Rule Loader
 *
 * Coverage:
 * - Valid rule pack load
 * - Invalid rule rejection with detailed errors
 * - Topic-scoped rule filtering
 * - Sub-control rule filtering
 * - Severity filtering
 * - Duplicate rule detection
 * - JSON parse error handling
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  loadRulePack,
  loadRulePackSafe,
  validateRulePack,
  getApplicableRules,
  listAvailableRulePacks,
  loadMultipleRulePacks,
  RulePackLoadError,
  RulePackNotFoundError,
} from "../rule-loader";
import type { ContradictionRulePack, ContradictionRule } from "../rule-types";

const TEST_RULES_DIR = join(process.cwd(), "src", "lib", "contradiction", "rules");

function createTestPack(pack: Partial<ContradictionRulePack> & { topicKey: string }): ContradictionRulePack {
  return {
    topicName: pack.topicKey,
    version: "1.0.0",
    rules: [],
    ...pack,
  } as ContradictionRulePack;
}

describe("rule-loader", () => {
  describe("validateRulePack", () => {
    it("should validate a valid rule pack", () => {
      const pack = createTestPack({
        topicKey: "test_topic",
        topicName: "Test Topic",
        rules: [
          {
            id: "test_rule_1",
            description: "A test rule",
            topicKey: "test_topic",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test message",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject pack without topicKey", () => {
      const pack = {
        topicName: "Test",
        version: "1.0.0",
        rules: [],
      };

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "topicKey")).toBe(true);
    });

    it("should reject pack without topicName", () => {
      const pack = {
        topicKey: "test",
        version: "1.0.0",
        rules: [],
      };

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "topicName")).toBe(true);
    });

    it("should reject pack without version", () => {
      const pack = {
        topicKey: "test",
        topicName: "Test",
        rules: [],
      };

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "version")).toBe(true);
    });

    it("should reject pack without rules", () => {
      const pack = {
        topicKey: "test",
        topicName: "Test",
        version: "1.0.0",
      };

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "rules")).toBe(true);
    });

    it("should reject pack with empty rules array", () => {
      const pack = {
        topicKey: "test",
        topicName: "Test",
        version: "1.0.0",
        rules: [],
      };

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "EMPTY_RULES_ARRAY")).toBe(true);
    });

    it("should reject rule without id", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            description: "A test rule",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test",
          } as unknown as ContradictionRule,
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes("id"))).toBe(true);
    });

    it("should reject rule with invalid severity", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "urgent" as any,
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_RULE_SEVERITY")).toBe(true);
    });

    it("should reject regex rule without pattern", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "regex" },
            messageTemplate: "Test",
          } as unknown as ContradictionRule,
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_REGEX_PATTERN")).toBe(true);
    });

    it("should reject invalid regex pattern", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "regex", pattern: "[invalid(" },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_REGEX_PATTERN")).toBe(true);
    });

    it("should reject enum rule without enumValues", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "enum_mismatch" },
            messageTemplate: "Test",
          } as unknown as ContradictionRule,
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_ENUM_VALUES")).toBe(true);
    });

    it("should reject empty enumValues array", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "enum_mismatch", enumValues: [] },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "EMPTY_ENUM_VALUES")).toBe(true);
    });

    it("should reject forbidden term rule without forbiddenTerms", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "forbidden_term" },
            messageTemplate: "Test",
          } as unknown as ContradictionRule,
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_FORBIDDEN_TERMS")).toBe(true);
    });

    it("should reject required term rule without requiredTerms", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "required_term_missing" },
            messageTemplate: "Test",
          } as unknown as ContradictionRule,
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_TERMS")).toBe(true);
    });

    it("should reject required term rule with empty canonicalContainsAny", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: {
              type: "required_term_missing",
              requiredTerms: ["MFA"],
              canonicalContainsAny: [],
            },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "EMPTY_CANONICAL_CONTAINS_ANY")).toBe(true);
    });

    it("should detect duplicate rule ids", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "duplicate_id",
            description: "First",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test",
          },
          {
            id: "duplicate_id",
            description: "Second",
            topicKey: "test",
            severity: "medium",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test 2",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_RULE_ID")).toBe(true);
    });

    it("should reject numeric range with negative absolute tolerance", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "numeric_range", absoluteTolerance: -5 },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "NEGATIVE_TOLERANCE")).toBe(true);
    });

    it("should reject numeric range with invalid relative tolerance", () => {
      const pack = createTestPack({
        topicKey: "test",
        rules: [
          {
            id: "test_1",
            description: "Test",
            topicKey: "test",
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "numeric_range", relativeTolerance: 1.5 },
            messageTemplate: "Test",
          },
        ],
      });

      const result = validateRulePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_RELATIVE_TOLERANCE")).toBe(true);
    });
  });

  describe("loadRulePack (integration)", () => {
    const testTopicKey = "__test_rule_pack__";
    const testFilePath = join(TEST_RULES_DIR, `${testTopicKey}.json`);

    afterAll(() => {
      // Cleanup test file
      if (existsSync(testFilePath)) {
        rmSync(testFilePath);
      }
    });

    it("should load valid rule pack from file", () => {
      const pack: ContradictionRulePack = {
        topicKey: testTopicKey,
        topicName: "Test Pack",
        version: "1.0.0",
        rules: [
          {
            id: "test_rule_1",
            description: "A test rule",
            topicKey: testTopicKey,
            severity: "high",
            rowField: "finalAnswer",
            canonicalField: "answer",
            config: { type: "exact_match" },
            messageTemplate: "Test: {{rowValue}} vs {{canonicalValue}}",
          },
        ],
      };

      writeFileSync(testFilePath, JSON.stringify(pack, null, 2));

      const loaded = loadRulePack(testTopicKey);
      expect(loaded.topicKey).toBe(testTopicKey);
      expect(loaded.rules).toHaveLength(1);
      expect(loaded.rules[0].id).toBe("test_rule_1");
    });

    it("should throw RulePackNotFoundError for missing file", () => {
      expect(() => loadRulePack("__nonexistent_topic__")).toThrow(RulePackNotFoundError);
    });

    it("should throw RulePackLoadError for invalid JSON", () => {
      writeFileSync(testFilePath, "not valid json {{{");

      expect(() => loadRulePack(testTopicKey)).toThrow(RulePackLoadError);
    });

    it("should throw RulePackLoadError for invalid rule pack", () => {
      const invalidPack = {
        topicKey: testTopicKey,
        // missing topicName, version, rules
      };

      writeFileSync(testFilePath, JSON.stringify(invalidPack));

      expect(() => loadRulePack(testTopicKey)).toThrow(RulePackLoadError);
    });
  });

  describe("loadRulePackSafe", () => {
    it("should return success result for valid pack", () => {
      // Uses the access_control.json file we created
      const result = loadRulePackSafe("access_control");
      expect(result.success).toBe(true);
      expect(result.pack).toBeDefined();
      expect(result.pack!.topicKey).toBe("access_control");
    });

    it("should return failure result for missing pack", () => {
      const result = loadRulePackSafe("__definitely_missing__");
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe("getApplicableRules", () => {
    const testPack: ContradictionRulePack = {
      topicKey: "test",
      topicName: "Test",
      version: "1.0.0",
      rules: [
        {
          id: "generic_rule",
          description: "Generic topic rule",
          topicKey: "test",
          severity: "medium",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match", enabled: true },
          messageTemplate: "Generic",
        },
        {
          id: "subcontrol_a_rule",
          description: "Sub-control A rule",
          topicKey: "test",
          subControlKey: "sub_a",
          severity: "high",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "contains", enabled: true },
          messageTemplate: "Sub A",
        },
        {
          id: "subcontrol_b_rule",
          description: "Sub-control B rule",
          topicKey: "test",
          subControlKey: "sub_b",
          severity: "critical",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "regex", pattern: ".*", enabled: true },
          messageTemplate: "Sub B",
        },
        {
          id: "disabled_rule",
          description: "Disabled rule",
          topicKey: "test",
          severity: "low",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match", enabled: false },
          messageTemplate: "Disabled",
        },
        {
          id: "info_rule",
          description: "Info severity rule",
          topicKey: "test",
          severity: "info",
          rowField: "finalAnswer",
          canonicalField: "answer",
          config: { type: "exact_match", enabled: true },
          messageTemplate: "Info",
        },
      ],
    };

    it("should return all active rules when no sub-control filter", () => {
      const rules = getApplicableRules(testPack, {});
      const ruleIds = rules.map((r) => r.id);
      expect(ruleIds).toContain("generic_rule");
      expect(ruleIds).toContain("subcontrol_a_rule");
      expect(ruleIds).toContain("subcontrol_b_rule");
      expect(ruleIds).toContain("info_rule");
      // Disabled rule should be excluded
      expect(ruleIds).not.toContain("disabled_rule");
    });

    it("should filter by sub-control key", () => {
      const rules = getApplicableRules(testPack, { subControlKey: "sub_a" });
      const ruleIds = rules.map((r) => r.id);
      // Generic rule applies to all sub-controls
      expect(ruleIds).toContain("generic_rule");
      // Sub-control specific rules
      expect(ruleIds).toContain("subcontrol_a_rule");
      expect(ruleIds).not.toContain("subcontrol_b_rule");
    });

    it("should filter by minimum severity", () => {
      const rules = getApplicableRules(testPack, { minSeverity: "high" });
      const ruleIds = rules.map((r) => r.id);
      expect(ruleIds).toContain("subcontrol_a_rule"); // high
      expect(ruleIds).toContain("subcontrol_b_rule"); // critical
      expect(ruleIds).not.toContain("generic_rule"); // medium
      expect(ruleIds).not.toContain("info_rule"); // info
    });

    it("should sort by severity (highest first)", () => {
      const rules = getApplicableRules(testPack, {});
      expect(rules[0].id).toBe("subcontrol_b_rule"); // critical
      expect(rules[1].id).toBe("subcontrol_a_rule"); // high
      expect(rules[2].id).toBe("generic_rule"); // medium
    });

    it("should include disabled rules when activeOnly is false", () => {
      const rules = getApplicableRules(testPack, { activeOnly: false });
      const ruleIds = rules.map((r) => r.id);
      expect(ruleIds).toContain("disabled_rule");
    });
  });

  describe("listAvailableRulePacks", () => {
    it("should list the four MVP topic rule packs", () => {
      const packs = listAvailableRulePacks();
      for (const key of [
        "access_control",
        "mfa",
        "encryption_at_rest",
        "encryption_in_transit",
      ]) {
        expect(packs).toContain(key);
      }
    });
  });

  describe("loadMultipleRulePacks", () => {
    it("should load multiple packs and track errors", () => {
      const result = loadMultipleRulePacks(["access_control", "__nonexistent__"]);
      expect(result.packs.has("access_control")).toBe(true);
      expect(result.errors.has("__nonexistent__")).toBe(true);
    });
  });
});
