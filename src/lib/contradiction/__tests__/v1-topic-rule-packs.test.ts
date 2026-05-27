/**
 * Integration tests: V1 JSON rule packs for the four MVP topics load cleanly
 * and detect() matches fixture expectations.
 */

import { describe, it, expect } from "vitest";
import { loadRulePack, validateRulePack } from "../rule-loader";
import { detect } from "../detection-service";
import {
  V1_RULE_PACK_CASES,
  rowFromCase,
  canonicalFromCase,
} from "./fixtures/v1-rule-pack-cases";

const MVP_TOPIC_KEYS = [
  "access_control",
  "mfa",
  "encryption_at_rest",
  "encryption_in_transit",
] as const;

describe("V1 topic rule packs", () => {
  it("loads and validates all four MVP packs", () => {
    for (const topicKey of MVP_TOPIC_KEYS) {
      const pack = loadRulePack(topicKey);
      const validation = validateRulePack(pack);
      expect(validation.valid, topicKey).toBe(true);
      expect(pack.topicKey).toBe(topicKey);
      expect(pack.rules.length).toBeGreaterThan(0);
    }
  });

  it("runs fixture cases against loaded packs", () => {
    const packs = Object.fromEntries(
      MVP_TOPIC_KEYS.map((k) => [k, loadRulePack(k)] as const),
    );

    for (const c of V1_RULE_PACK_CASES) {
      const pack = packs[c.topicKey];
      const result = detect(rowFromCase(c), canonicalFromCase(c), pack);

      expect(
        result.contradictionFound,
        `${c.id}: expected contradiction=${c.expectContradiction}`,
      ).toBe(c.expectContradiction);

      if (c.expectContradiction && c.expectAnyRuleIds?.length) {
        const hitIds = new Set(result.hits.map((h) => h.ruleId));
        const matched = c.expectAnyRuleIds.some((id) => hitIds.has(id));
        expect(matched, `${c.id}: expected one of ${c.expectAnyRuleIds} in ${[...hitIds].join(", ")}`).toBe(
          true,
        );
      }

      if (c.expectNoRuleIds?.length) {
        const hitIds = result.hits.map((h) => h.ruleId);
        for (const forbidden of c.expectNoRuleIds) {
          expect(hitIds, `${c.id}`).not.toContain(forbidden);
        }
      }
    }
  });
});
