export type CapabilityKey =
  | "cloud_scanning"
  | "data_classification"
  | "workflow_automation"
  | "email_ingestion"
  | "file_sync"
  | "browser_extension"
  | "endpoint_agent"
  | "ai_inference"
  | "ai_training"
  | "tenant_management"
  | "webhook_delivery"
  | "identity_federation"
  | "api_gateway"
  | "communication_ingestion"
  | "document_generation"
  | "audit_logging"
  | "cloud_connector"
  | "OCR_processing"
  | "infrastructure_monitoring"
  | "export_generation"
  | "report_generation"
  | "support_access"
  | "admin_console"
  | "sensitive_data_discovery"
  | "encryption_management";

export type CapabilityDefinition = {
  key: CapabilityKey;
  label: string;
  procurementRiskWeight: number;
  procurementImplications: string[];
  likelyQuestionnaireAreas: string[];
  requiredEvidenceTypes: string[];
};

export const CAPABILITY_TAXONOMY: Record<CapabilityKey, CapabilityDefinition> = {
  cloud_scanning: {
    key: "cloud_scanning",
    label: "Cloud Infrastructure Scanning",
    procurementRiskWeight: 9,
    procurementImplications: ["privileged_cloud_access", "infrastructure_reach"],
    likelyQuestionnaireAreas: ["Cloud Security", "IAM", "Infrastructure Access"],
    requiredEvidenceTypes: ["least_privilege_architecture", "read_only_roles"],
  },
  data_classification: {
    key: "data_classification",
    label: "Data Classification",
    procurementRiskWeight: 8,
    procurementImplications: ["customer_data_access", "metadata_visibility"],
    likelyQuestionnaireAreas: ["Data Privacy", "Data Handling", "Compliance"],
    requiredEvidenceTypes: ["data_retention_policy", "encryption_at_rest"],
  },
  workflow_automation: {
    key: "workflow_automation",
    label: "Workflow Automation",
    procurementRiskWeight: 6,
    procurementImplications: ["cross_system_integration", "auth_token_storage"],
    likelyQuestionnaireAreas: ["API Security", "Access Control"],
    requiredEvidenceTypes: ["oauth_scopes", "token_rotation_policy"],
  },
  email_ingestion: {
    key: "email_ingestion",
    label: "Email Ingestion",
    procurementRiskWeight: 8,
    procurementImplications: ["customer_content_exposure", "retention_concerns", "support_visibility"],
    likelyQuestionnaireAreas: ["Privacy", "Data Retention", "Communication Security"],
    requiredEvidenceTypes: ["email_retention_policy", "PII_redaction_process"],
  },
  file_sync: {
    key: "file_sync",
    label: "File Synchronization",
    procurementRiskWeight: 7,
    procurementImplications: ["data_exfiltration_risk", "unauthorized_sync"],
    likelyQuestionnaireAreas: ["Endpoint Security", "Data Loss Prevention"],
    requiredEvidenceTypes: ["encryption_in_transit", "access_logs"],
  },
  browser_extension: {
    key: "browser_extension",
    label: "Browser Extension",
    procurementRiskWeight: 7,
    procurementImplications: ["dom_read_access", "cross_site_tracking"],
    likelyQuestionnaireAreas: ["Endpoint Security", "Privacy"],
    requiredEvidenceTypes: ["extension_manifest_review", "data_collection_policy"],
  },
  endpoint_agent: {
    key: "endpoint_agent",
    label: "Endpoint Agent",
    procurementRiskWeight: 9,
    procurementImplications: ["host_level_access", "continuous_monitoring"],
    likelyQuestionnaireAreas: ["Endpoint Security", "System Access"],
    requiredEvidenceTypes: ["agent_privilege_level", "auto_update_mechanism"],
  },
  ai_inference: {
    key: "ai_inference",
    label: "AI Inference",
    procurementRiskWeight: 6,
    procurementImplications: ["third_party_data_sharing", "prompt_injection"],
    likelyQuestionnaireAreas: ["AI Governance", "Data Processing"],
    requiredEvidenceTypes: ["subprocessor_list", "data_processing_agreement"],
  },
  ai_training: {
    key: "ai_training",
    label: "AI Model Training",
    procurementRiskWeight: 10,
    procurementImplications: ["customer_data_usage", "ai_governance_requirements"],
    likelyQuestionnaireAreas: ["AI Governance", "Intellectual Property"],
    requiredEvidenceTypes: ["opt_out_mechanism", "model_training_policy"],
  },
  tenant_management: {
    key: "tenant_management",
    label: "Multi-Tenant Management",
    procurementRiskWeight: 7,
    procurementImplications: ["tenant_isolation_risk", "cross_tenant_exposure"],
    likelyQuestionnaireAreas: ["Cloud Security", "Architecture"],
    requiredEvidenceTypes: ["tenant_isolation_architecture", "penetration_test_report"],
  },
  webhook_delivery: {
    key: "webhook_delivery",
    label: "Webhook Delivery",
    procurementRiskWeight: 5,
    procurementImplications: ["outbound_traffic", "payload_exposure"],
    likelyQuestionnaireAreas: ["API Security", "Network Security"],
    requiredEvidenceTypes: ["webhook_signature_verification", "payload_encryption"],
  },
  identity_federation: {
    key: "identity_federation",
    label: "Identity Federation",
    procurementRiskWeight: 8,
    procurementImplications: ["sso_integration", "directory_sync"],
    likelyQuestionnaireAreas: ["Identity & Access Management", "Authentication"],
    requiredEvidenceTypes: ["saml_oidc_support", "mfa_enforcement"],
  },
  api_gateway: {
    key: "api_gateway",
    label: "API Gateway",
    procurementRiskWeight: 7,
    procurementImplications: ["traffic_inspection", "rate_limiting_bypass"],
    likelyQuestionnaireAreas: ["Network Security", "Availability"],
    requiredEvidenceTypes: ["ddos_protection", "waf_ruleset"],
  },
  communication_ingestion: {
    key: "communication_ingestion",
    label: "Communication Ingestion",
    procurementRiskWeight: 8,
    procurementImplications: ["chat_history_access", "internal_comms_exposure"],
    likelyQuestionnaireAreas: ["Privacy", "Data Handling"],
    requiredEvidenceTypes: ["data_retention_policy", "data_processing_agreement"],
  },
  document_generation: {
    key: "document_generation",
    label: "Document Generation",
    procurementRiskWeight: 5,
    procurementImplications: ["template_injection", "pdf_rendering_exploits"],
    likelyQuestionnaireAreas: ["Application Security"],
    requiredEvidenceTypes: ["input_sanitization", "sandbox_rendering"],
  },
  audit_logging: {
    key: "audit_logging",
    label: "Audit Logging",
    procurementRiskWeight: 4,
    procurementImplications: ["log_retention", "log_tampering"],
    likelyQuestionnaireAreas: ["Security Operations", "Compliance"],
    requiredEvidenceTypes: ["log_immutability", "siem_integration"],
  },
  cloud_connector: {
    key: "cloud_connector",
    label: "Cloud Connector",
    procurementRiskWeight: 8,
    procurementImplications: ["cross_environment_access", "api_key_storage"],
    likelyQuestionnaireAreas: ["Cloud Security", "API Security"],
    requiredEvidenceTypes: ["secret_management_architecture", "least_privilege_access"],
  },
  OCR_processing: {
    key: "OCR_processing",
    label: "OCR Processing",
    procurementRiskWeight: 7,
    procurementImplications: ["pii_extraction", "image_retention"],
    likelyQuestionnaireAreas: ["Data Privacy", "Data Handling"],
    requiredEvidenceTypes: ["ephemeral_processing", "pii_redaction"],
  },
  infrastructure_monitoring: {
    key: "infrastructure_monitoring",
    label: "Infrastructure Monitoring",
    procurementRiskWeight: 8,
    procurementImplications: ["telemetry_collection", "system_state_visibility"],
    likelyQuestionnaireAreas: ["Cloud Security", "System Access"],
    requiredEvidenceTypes: ["data_minimization", "agent_security"],
  },
  export_generation: {
    key: "export_generation",
    label: "Export Generation",
    procurementRiskWeight: 5,
    procurementImplications: ["data_exfiltration", "bulk_download"],
    likelyQuestionnaireAreas: ["Data Loss Prevention"],
    requiredEvidenceTypes: ["export_audit_logs", "rate_limiting"],
  },
  report_generation: {
    key: "report_generation",
    label: "Report Generation",
    procurementRiskWeight: 4,
    procurementImplications: ["aggregate_data_exposure"],
    likelyQuestionnaireAreas: ["Data Privacy"],
    requiredEvidenceTypes: ["role_based_access_control"],
  },
  support_access: {
    key: "support_access",
    label: "Support Access",
    procurementRiskWeight: 8,
    procurementImplications: ["vendor_personnel_access", "unsupervised_access"],
    likelyQuestionnaireAreas: ["Access Control", "Vendor Management"],
    requiredEvidenceTypes: ["support_access_logs", "just_in_time_access"],
  },
  admin_console: {
    key: "admin_console",
    label: "Admin Console",
    procurementRiskWeight: 6,
    procurementImplications: ["privileged_actions", "configuration_changes"],
    likelyQuestionnaireAreas: ["Identity & Access Management"],
    requiredEvidenceTypes: ["mfa_enforcement", "admin_audit_logs"],
  },
  sensitive_data_discovery: {
    key: "sensitive_data_discovery",
    label: "Sensitive Data Discovery",
    procurementRiskWeight: 9,
    procurementImplications: ["deep_data_inspection", "pii_concentration"],
    likelyQuestionnaireAreas: ["Data Privacy", "Data Security"],
    requiredEvidenceTypes: ["data_minimization", "encryption_in_use"],
  },
  encryption_management: {
    key: "encryption_management",
    label: "Encryption Management",
    procurementRiskWeight: 8,
    procurementImplications: ["key_custody", "cryptographic_failures"],
    likelyQuestionnaireAreas: ["Cryptography", "Data Security"],
    requiredEvidenceTypes: ["byok_support", "fips_certification"],
  },
};
