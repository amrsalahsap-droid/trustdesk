/**
 * Fixture cases for V1 topic rule packs: canonical text, row text, sub-control,
 * and expected contradiction outcome for deterministic regression tests.
 */

import type { QuestionnaireRow } from "../../detection-types";
import type { CanonicalAnswerMetadata } from "../../canonical-retrieval";

export interface V1RulePackCase {
  id: string;
  topicKey: string;
  subControlKey: string;
  canonicalAnswer: string;
  rowAnswer: string;
  expectContradiction: boolean;
  /** When expectContradiction is true, at least one of these rule ids must appear in hits */
  expectAnyRuleIds?: string[];
  /** When set, no hit may use these rule ids */
  expectNoRuleIds?: string[];
}

function baseRow(
  topicKey: string,
  subControlKey: string,
  finalAnswer: string,
): QuestionnaireRow {
  return {
    id: `fixture-${topicKey}-${subControlKey}`,
    question: "Fixture",
    finalAnswer,
    suggestedAnswer: "",
    topicKey,
    subControlKey,
  };
}

function baseCanonical(answer: string, subControlKey: string | null): CanonicalAnswerMetadata {
  return {
    answerId: "fixture-canonical",
    title: "Fixture",
    answer,
    governanceStatus: "APPROVED_FOR_EXPORT",
    approvalScope: "EXPORT_ALLOWED",
    exportSafe: true,
    status: "APPROVED",
    approvedAt: new Date("2024-01-01"),
    approvedByUserId: null,
    nextReviewDueAt: null,
    version: "v1",
    versionNumber: 1,
    topicId: "fixture-topic",
    subControlKey,
    subControlLabels: [],
    freshness: "fresh",
  };
}

export const V1_RULE_PACK_CASES: V1RulePackCase[] = [
  {
    id: "ac_rbac_no_contradiction",
    topicKey: "access_control",
    subControlKey: "rbac",
    canonicalAnswer: "Yes, RBAC is implemented across all production systems.",
    rowAnswer: "Yes, we enforce RBAC and least privilege in production.",
    expectContradiction: false,
  },
  {
    id: "ac_rbac_polarity_contradiction",
    topicKey: "access_control",
    subControlKey: "rbac",
    canonicalAnswer: "Yes, RBAC is fully implemented for all staff.",
    rowAnswer: "No, we do not use RBAC today.",
    expectContradiction: true,
    expectAnyRuleIds: ["access_control_rbac_polarity"],
  },
  {
    id: "ac_admin_mfa_gated_no_fire",
    topicKey: "access_control",
    subControlKey: "admin_mfa",
    canonicalAnswer: "MFA is optional for administrators during migration.",
    rowAnswer: "We follow our security policy.",
    expectContradiction: false,
    expectNoRuleIds: ["access_control_admin_mfa_required"],
  },
  {
    id: "ac_admin_mfa_gated_fire",
    topicKey: "access_control",
    subControlKey: "admin_mfa",
    canonicalAnswer: "MFA is mandatory for all administrative accounts.",
    rowAnswer: "We follow our security policy.",
    expectContradiction: true,
    expectAnyRuleIds: ["access_control_admin_mfa_required"],
  },
  {
    id: "ac_access_review_same_cadence",
    topicKey: "access_control",
    subControlKey: "access_review",
    canonicalAnswer: "Access is recertified quarterly by owners.",
    rowAnswer: "We perform quarterly access reviews.",
    expectContradiction: false,
  },
  {
    id: "ac_access_review_mismatch",
    topicKey: "access_control",
    subControlKey: "access_review",
    canonicalAnswer: "Access reviews are quarterly.",
    rowAnswer: "We review access annually only.",
    expectContradiction: true,
    expectAnyRuleIds: ["access_control_review_frequency"],
  },
  {
    id: "mfa_admin_polarity_contradiction",
    topicKey: "mfa",
    subControlKey: "admin_mfa",
    canonicalAnswer: "Admin MFA is required for all privileged accounts.",
    rowAnswer: "Admin MFA is optional and not enforced.",
    expectContradiction: true,
    expectAnyRuleIds: ["mfa_admin_polarity"],
  },
  {
    id: "mfa_methods_enum_mismatch",
    topicKey: "mfa",
    subControlKey: "mfa_methods",
    canonicalAnswer: "We require WebAuthn or FIDO2 for workforce MFA.",
    rowAnswer: "End users may authenticate with SMS only.",
    expectContradiction: true,
    expectAnyRuleIds: ["mfa_methods_enum"],
  },
  {
    id: "mfa_methods_required_gated",
    topicKey: "mfa",
    subControlKey: "mfa_methods",
    canonicalAnswer: "Supported factors include TOTP and WebAuthn.",
    rowAnswer: "MFA is enabled per policy.",
    expectContradiction: true,
    expectAnyRuleIds: ["mfa_methods_required"],
  },
  {
    id: "ear_scope_polarity",
    topicKey: "encryption_at_rest",
    subControlKey: "scope",
    canonicalAnswer: "All customer databases and backups are encrypted at rest with AES-256.",
    rowAnswer: "Customer data at rest is not encrypted in legacy archives.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_at_rest_scope_polarity"],
  },
  {
    id: "ear_algorithm_mismatch",
    topicKey: "encryption_at_rest",
    subControlKey: "algorithms",
    canonicalAnswer: "We use AES-256 for volume encryption.",
    rowAnswer: "Volumes use AES-128 only.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_at_rest_algorithm_exact"],
  },
  {
    id: "ear_kms_gated_no_fire",
    topicKey: "encryption_at_rest",
    subControlKey: "algorithms",
    canonicalAnswer: "We use AES-256 with static keys on disk.",
    rowAnswer: "We use AES-256.",
    expectContradiction: false,
    expectNoRuleIds: ["encryption_at_rest_kms_required"],
  },
  {
    id: "ear_kms_gated_fire",
    topicKey: "encryption_at_rest",
    subControlKey: "algorithms",
    canonicalAnswer: "Data keys are wrapped with AWS KMS using envelope encryption.",
    rowAnswer: "We encrypt with AES-256 locally.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_at_rest_kms_required"],
  },
  {
    id: "eit_tls_polarity",
    topicKey: "encryption_in_transit",
    subControlKey: "tls_policy",
    canonicalAnswer: "HTTPS with TLS 1.2+ is mandatory for all customer API traffic.",
    rowAnswer: "HTTP is allowed for internal debugging endpoints on the same hostname.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_in_transit_tls_required_polarity"],
  },
  {
    id: "eit_tls_version_mismatch",
    topicKey: "encryption_in_transit",
    subControlKey: "tls_policy",
    canonicalAnswer: "Minimum protocol is TLS 1.3 for all edge connections.",
    rowAnswer: "We terminate TLS 1.2 at the load balancer minimum.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_in_transit_tls_version_enum"],
  },
  {
    id: "eit_inter_service_polarity",
    topicKey: "encryption_in_transit",
    subControlKey: "inter_service",
    canonicalAnswer: "All east-west traffic uses mutual TLS inside the mesh.",
    rowAnswer: "Plain HTTP is acceptable inside the VPC between microservices.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_in_transit_inter_service_polarity"],
  },
  {
    id: "eit_inter_service_mtls_gated",
    topicKey: "encryption_in_transit",
    subControlKey: "inter_service",
    canonicalAnswer: "Service mesh enforces mTLS for every internal call.",
    rowAnswer: "Services communicate over the corporate LAN with no encryption.",
    expectContradiction: true,
    expectAnyRuleIds: ["encryption_in_transit_inter_service_mtls_required"],
  },
];

export function rowFromCase(c: V1RulePackCase): QuestionnaireRow {
  return baseRow(c.topicKey, c.subControlKey, c.rowAnswer);
}

export function canonicalFromCase(c: V1RulePackCase): CanonicalAnswerMetadata {
  return baseCanonical(c.canonicalAnswer, c.subControlKey);
}
