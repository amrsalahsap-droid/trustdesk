import { AliasDefinition } from "./topic-resolution-types";

export const TOPIC_ALIAS_REGISTRY: AliasDefinition[] = [
  // Privacy & Data Handling
  { sourceKey: "privacy_compliance", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  { sourceKey: "privacy_policy", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  { sourceKey: "privacy_rights", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  { sourceKey: "hipaa_privacy", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  { sourceKey: "consent_management", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  { sourceKey: "healthcare_compliance", targetKey: "privacy_data_protection", inferredPillarKey: "privacy_handling" },
  
  // Subprocessor & Supply Chain
  { sourceKey: "subprocessors", targetKey: "subprocessor_management", inferredPillarKey: "supply_chain" },
  { sourceKey: "vendor_management", targetKey: "subprocessor_management", inferredPillarKey: "supply_chain" },
  { sourceKey: "supply_chain_security", targetKey: "subprocessor_management", inferredPillarKey: "supply_chain" },
  { sourceKey: "third_party_risk_management", targetKey: "third_party_risk_management", inferredPillarKey: "supply_chain" },
  
  // Compliance Readiness Provisional
  { sourceKey: "compliance_readiness", targetKey: "compliance_readiness", inferredPillarKey: "compliance_readiness" },
  
  // Audit, Logging & Monitoring
  { sourceKey: "monitoring", targetKey: "audit_logging_monitoring", inferredPillarKey: "compliance_readiness" },
  { sourceKey: "audit_logging", targetKey: "audit_logging_monitoring", inferredPillarKey: "compliance_readiness" },
  { sourceKey: "transaction_monitoring", targetKey: "audit_logging_monitoring", inferredPillarKey: "compliance_readiness" },
  
  // Infrastructure Security & Cloud Governance
  { sourceKey: "endpoint_security", targetKey: "infrastructure_security", inferredPillarKey: "infrastructure_cloud" },
  { sourceKey: "integration_security", targetKey: "infrastructure_security", inferredPillarKey: "infrastructure_cloud" },
  { sourceKey: "shared_responsibility", targetKey: "infrastructure_security", inferredPillarKey: "infrastructure_cloud" },
  { sourceKey: "cloud_connector_permissions", targetKey: "infrastructure_security", inferredPillarKey: "infrastructure_cloud" },
  
  // AI & ML Models
  { sourceKey: "ai_governance", targetKey: "ai_data_processing", inferredPillarKey: "ai_model" },
  { sourceKey: "model_security", targetKey: "ai_data_processing", inferredPillarKey: "ai_model" },
  { sourceKey: "ai_privacy", targetKey: "ai_data_processing", inferredPillarKey: "ai_model" },
  { sourceKey: "model_risk_management", targetKey: "ai_data_processing", inferredPillarKey: "ai_model" },
  { sourceKey: "data_provenance", targetKey: "training_data_policy", inferredPillarKey: "ai_model" },
  { sourceKey: "ai_ethics", targetKey: "training_data_policy", inferredPillarKey: "ai_model" },
  
  // Identity & Fraud controls
  { sourceKey: "aml_kyc", targetKey: "identity_verification", inferredPillarKey: "identity_access" },
  { sourceKey: "kyc_aml", targetKey: "identity_verification", inferredPillarKey: "identity_access" },
  { sourceKey: "account_verification", targetKey: "identity_verification", inferredPillarKey: "identity_access" },
  { sourceKey: "fraud_prevention", targetKey: "fraud_controls", inferredPillarKey: "sensitive_data" },
];
