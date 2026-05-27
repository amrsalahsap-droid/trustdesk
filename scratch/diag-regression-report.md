# Regression inspection — cmoasu2kx04jh14xozz636ziw

## 1. Executive summary
- Workspace: `cmoasu2kx04jh14xozz636ziw` (CYBRAL, slug `cybral-16`)
- Questionnaire: `cmob1ca5p01sz14qcocqt3j0p` — "Buyer_Security_Questionnaire_Fintech" (rowCount: 0)
- repairCutoff: 2026-04-23T01:27:02.188Z (source: answerSeedingJob.second)
- Last successful stage: matcher returned approved selections
- First broken or still-missing stage: none
- Verdict: Pipeline looks healthy end-to-end; zero-answer symptom is not explained by this audit.
- Category: environment-migration-mismatch

## 2. Before/after counts
- Documents parsed (COMPLETED): before=14, after=14
- Total chunks: 285
- Classified chunks: before=0, after=196 (delta=196, orphan%=31.23)
- SourceChunkTopic associations: before=0, after=414
- AnswerLibraryItem approved: before=0, after=47
- AnswerLibraryItem draft: before=0, after=10
- Answers with populated embedding: 57 (empty: 0)
- QuestionnaireItem approvedSelected: 0 (of 0 rows) — no before/after split because QuestionnaireItem has no updatedAt column
- Unresolved reason histogram (current):

## 3. Per-topic expectation matrix
### Access Control (`access_control`)
- topicPresent: yes
- chunkCoverage: 56
- subControlTaxonomyEntries: 7 (keys: rbac, access_request, access_approval, access_review, offboarding, privileged_access, admin_mfa)
- approvedSubControls: 13 (keys: admin_mfa, offboarding, rbac, access_approval, access_request, access_review, privileged_access)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Encryption at Rest (`encryption_at_rest`)
- topicPresent: yes
- chunkCoverage: 8
- subControlTaxonomyEntries: 2 (keys: algorithms, scope)
- approvedSubControls: 2 (keys: algorithms)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Encryption in Transit (`encryption_in_transit`)
- topicPresent: yes
- chunkCoverage: 6
- subControlTaxonomyEntries: 2 (keys: tls_policy, inter_service)
- approvedSubControls: 2 (keys: inter_service, tls_policy)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Logging (`logging`)
- topicPresent: yes
- chunkCoverage: 27
- subControlTaxonomyEntries: 2 (keys: admin_audit_log, alert_monitoring)
- approvedSubControls: 4 (keys: admin_audit_log, alert_monitoring)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Incident Response (`incident_response`)
- topicPresent: yes
- chunkCoverage: 12
- subControlTaxonomyEntries: 4 (keys: triage, containment, communication, post_mortem)
- approvedSubControls: 3 (keys: triage, containment, post_mortem)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Business Continuity / DR (`business_continuity`)
- topicPresent: yes
- chunkCoverage: 7
- subControlTaxonomyEntries: 3 (keys: rto_rpo, backup_frequency, dr_testing)
- approvedSubControls: 3 (keys: backup_frequency, dr_testing, rto_rpo)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Retention / Deletion (`retention`)
- topicPresent: yes
- chunkCoverage: 21
- subControlTaxonomyEntries: 2 (keys: retention_policy, deletion_process)
- approvedSubControls: 4 (keys: retention_policy, deletion_process)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Subprocessors (`subprocessors`)
- topicPresent: yes
- chunkCoverage: 29
- subControlTaxonomyEntries: 2 (keys: subprocessor_list, subprocessor_review)
- approvedSubControls: 2 (keys: subprocessor_review, subprocessor_list)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Data Classification (`data_classification`)
- topicPresent: yes
- chunkCoverage: 33
- subControlTaxonomyEntries: 2 (keys: label_taxonomy, handling_rules)
- approvedSubControls: 2 (keys: label_taxonomy, handling_rules)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Vulnerability Management / SDLC (`vulnerability_management`)
- topicPresent: yes
- chunkCoverage: 13
- subControlTaxonomyEntries: 4 (keys: scanning, remediation_sla, pentest, secure_sdlc)
- approvedSubControls: 4 (keys: remediation_sla, secure_sdlc, pentest, scanning)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### Purview / Enterprise Labels (`purview_integration`)
- topicPresent: yes
- chunkCoverage: 27
- subControlTaxonomyEntries: 2 (keys: label_sync, policy_enforcement)
- approvedSubControls: 0 (keys: none)
- draftSubControls: 2 (keys: label_sync, policy_enforcement)
- blockedQuestionnaireRows: 0
- populationStage: partial
- firstBrokenGate: approval

### Tenant Isolation (`tenant_isolation`)
- topicPresent: yes
- chunkCoverage: 9
- subControlTaxonomyEntries: 3 (keys: logical_isolation, network_isolation, evidence_export)
- approvedSubControls: 3 (keys: logical_isolation, network_isolation, evidence_export)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### MFA (`mfa`)
- topicPresent: yes
- chunkCoverage: 15
- subControlTaxonomyEntries: 3 (keys: admin_mfa, user_mfa, mfa_methods)
- approvedSubControls: 3 (keys: mfa_methods, user_mfa, admin_mfa)
- draftSubControls: 0 (keys: none)
- blockedQuestionnaireRows: 0
- populationStage: ok
- firstBrokenGate: n/a

### SSO (`sso`)
- topicPresent: yes
- chunkCoverage: 4
- subControlTaxonomyEntries: 2 (keys: saml_oidc, scim_provisioning)
- approvedSubControls: 0 (keys: none)
- draftSubControls: 2 (keys: saml_oidc, scim_provisioning)
- blockedQuestionnaireRows: 0
- populationStage: partial
- firstBrokenGate: approval

## 4. Root cause and fixes

**Root cause (one paragraph):** Pipeline looks healthy end-to-end; zero-answer symptom is not explained by this audit.

**Minimal fix:**
- Re-run the full repair sequence (seed-canonical-topics → reclassify-chunks → reseed-topics → promote-drafts).

**Strong fix:**
- Add end-to-end acceptance tests for the repair scripts against a seed workspace.

## Appendix: raw evidence

### Rollout-state summary
- reclassifiedAssociationCount: 414
- canonicalTopicsMissing: none
- taxonomyTopicsMissing: none
- reseedingRan: true
- bulkPromoteEventCount: 40
- promotedByTopic: {"logging":4,"encryption_at_rest":2,"rbac":2,"retention":4,"incident_response":3,"business_continuity":3,"mfa":3,"data_classification":2,"tenant_isolation":3,"subprocessors":2,"encryption_in_transit":2,"access_control":6,"vulnerability_management":4}

### Per-bucket row drill-downs
- Missing Topics: no matching row in questionnaire
- No Answer Content: no matching row in questionnaire
- Rejected Draft Candidates: no matching row in questionnaire
- Answer Mismatch: no matching row in questionnaire
- Sub-Control Missing: no matching row in questionnaire

### Approval bottleneck — top 15 drafts blocking the most rows
- (no drafts currently block any rows)

### All diagnostic JSON lines
```jsonl
{"event":"diag.header","workspaceId":"cmoasu2kx04jh14xozz636ziw","workspaceName":"CYBRAL","workspaceSlug":"cybral-16","workspaceCreatedAt":"2026-04-23T01:24:40.209Z","questionnaireId":"cmob1ca5p01sz14qcocqt3j0p","questionnaireTitle":"Buyer_Security_Questionnaire_Fintech","questionnaireCreatedAt":"2026-04-23T05:22:46.766Z"}
{"event":"diag.repair-cutoff","repairCutoff":"2026-04-23T01:27:02.188Z","source":"answerSeedingJob.second","candidates":[{"source":"answerSeedingJob.second","at":"2026-04-23T01:27:02.188Z"},{"source":"sourceChunkTopic.reclassified","at":"2026-04-23T04:57:18.863Z"}],"rolloutApplied":true}
{"event":"diag.repair-state.classification-topk-reclassified","appliedToThisWorkspace":true,"totalChunkCount":285,"totalSourceChunkTopicRows":414,"reclassifiedAssociationCount":414,"earliestReclassifiedAt":"2026-04-23T04:57:18.863Z","note":"414 associations were created post-parse, evidence of reclassification."}
{"event":"diag.repair-state.canonical-topics-seeded","appliedToThisWorkspace":true,"systemTopicCount":21,"missingFromSystem":[],"presentDetails":[{"key":"data_classification","createdAt":"2026-04-23T04:54:29.646Z","updatedAt":"2026-04-23T04:57:18.793Z"},{"key":"tenant_isolation","createdAt":"2026-04-23T04:54:29.671Z","updatedAt":"2026-04-23T04:57:18.800Z"},{"key":"purview_integration","createdAt":"2026-04-23T04:54:29.691Z","updatedAt":"2026-04-23T04:57:18.808Z"}]}
{"event":"diag.repair-state.subcontrol-taxonomy-rolled-out","appliedInCode":true,"taxonomyKeys":["access_control","incident_response","retention","logging","subprocessors","encryption_at_rest","encryption_in_transit","business_continuity","vulnerability_management","mfa","sso","data_classification","tenant_isolation","purview_integration"],"newInRolloutPresent":["encryption_at_rest","encryption_in_transit","business_continuity","vulnerability_management","mfa","sso","data_classification","tenant_isolation","purview_integration"],"newInRolloutMissing":[]}
{"event":"diag.repair-state.reseeded-after-taxonomy","appliedToThisWorkspace":true,"totalSeedingJobs":14,"postCutoffSeedingJobs":13,"latestJob":{"status":"PARTIAL","createdAt":"2026-04-23T01:27:21.312Z","startedAt":"2026-04-23T01:27:21.329Z","finishedAt":"2026-04-23T01:27:22.486Z"},"postCutoffTopicRunStatusHistogram":{"SKIPPED_NO_EVIDENCE":149,"FAILED":61,"REJECTED_LOW_QUALITY":24},"firstSeedingJobCreatedAt":"2026-04-23T01:27:01.722Z"}
{"event":"diag.repair-state.answer-embedding-backfilled","appliedToThisWorkspace":true,"totalAnswers":57,"emptyEmbeddingCount":0,"populatedEmbeddingCount":57,"emptyEmbeddingSample":[]}
{"event":"diag.repair-state.drafts-promoted","appliedToThisWorkspace":true,"bulkPromoteCount":40,"promotedByTopic":{"logging":4,"encryption_at_rest":2,"rbac":2,"retention":4,"incident_response":3,"business_continuity":3,"mfa":3,"data_classification":2,"tenant_isolation":3,"subprocessors":2,"encryption_in_transit":2,"access_control":6,"vulnerability_management":4},"promotedBySubControl":{"admin_audit_log":2,"alert_monitoring":2,"__untagged__":3,"algorithms":1,"retention_policy":2,"deletion_process":2,"triage":1,"containment":1,"post_mortem":1,"rto_rpo":1,"backup_frequency":1,"dr_testing":1,"admin_mfa":2,"user_mfa":1,"mfa_methods":1,"label_taxonomy":1,"handling_rules":1,"logical_isolation":1,"network_isolation":1,"evidence_export":1,"subprocessor_list":1,"subprocessor_review":1,"tls_policy":1,"inter_service":1,"rbac":1,"access_request":1,"access_review":1,"offboarding":1,"privileged_access":1,"scanning":1,"remediation_sla":1,"pentest":1,"secure_sdlc":1},"firstPromoteAt":null}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx39q04jw14xomd9etg4i","fileName":"Access_Control_Policy_Cybral.docx","parseStatus":"COMPLETED","chunkCount":25,"classifiedChunkCount":19,"orphanChunkCount":6,"orphanPct":24,"topMappedTopics":[{"key":"access_control","count":14},{"key":"rbac","count":13},{"key":"password_policy","count":5}],"reclassifiedChunkCount":47}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx3iq04k414xo80ovq3a8","fileName":"Business_Continuity_and_DR_Plan.pdf","parseStatus":"COMPLETED","chunkCount":2,"classifiedChunkCount":1,"orphanChunkCount":1,"orphanPct":50,"topMappedTopics":[{"key":"business_continuity","count":1},{"key":"backups","count":1}],"reclassifiedChunkCount":2}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx3pz04l714xobairp7qp","fileName":"Customer_Data_Residency_and_Tenant_Isolation.docx","parseStatus":"COMPLETED","chunkCount":21,"classifiedChunkCount":18,"orphanChunkCount":3,"orphanPct":14.29,"topMappedTopics":[{"key":"tenant_isolation","count":8},{"key":"access_control","count":7},{"key":"data_residency","count":6}],"reclassifiedChunkCount":39}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx3xw04mu14xoiv3g2t2q","fileName":"Cybral_GUARD_Architecture_Overview.pdf","parseStatus":"COMPLETED","chunkCount":2,"classifiedChunkCount":1,"orphanChunkCount":1,"orphanPct":50,"topMappedTopics":[{"key":"monitoring","count":1},{"key":"rbac","count":1},{"key":"access_control","count":1}],"reclassifiedChunkCount":3}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx43v04oc14xoz3zx60zx","fileName":"Cybral_GUARD_Product_Overview.docx","parseStatus":"COMPLETED","chunkCount":31,"classifiedChunkCount":19,"orphanChunkCount":12,"orphanPct":38.71,"topMappedTopics":[{"key":"data_classification","count":8},{"key":"access_control","count":6},{"key":"purview_integration","count":4}],"reclassifiedChunkCount":42}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx4e004q414xo47eis9vf","fileName":"Data_Classification_and_Labeling_Guide.docx","parseStatus":"COMPLETED","chunkCount":21,"classifiedChunkCount":12,"orphanChunkCount":9,"orphanPct":42.86,"topMappedTopics":[{"key":"data_classification","count":7},{"key":"purview_integration","count":5},{"key":"subprocessors","count":2}],"reclassifiedChunkCount":25}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx55104rs14xojjmb0ojy","fileName":"Encryption_and_Key_Management_Policy.docx","parseStatus":"COMPLETED","chunkCount":22,"classifiedChunkCount":18,"orphanChunkCount":4,"orphanPct":18.18,"topMappedTopics":[{"key":"encryption_at_rest","count":7},{"key":"encryption_in_transit","count":6},{"key":"password_policy","count":5}],"reclassifiedChunkCount":36}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx5h004um14xoql0onnuj","fileName":"Incident_Response_Plan_Cybral.docx","parseStatus":"COMPLETED","chunkCount":23,"classifiedChunkCount":16,"orphanChunkCount":7,"orphanPct":30.43,"topMappedTopics":[{"key":"incident_response","count":9},{"key":"monitoring","count":3},{"key":"retention","count":2}],"reclassifiedChunkCount":25}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx5t204wo14xoq2x5fr3o","fileName":"Information_Security_Policy_Cybral.docx","parseStatus":"COMPLETED","chunkCount":27,"classifiedChunkCount":18,"orphanChunkCount":9,"orphanPct":33.33,"topMappedTopics":[{"key":"rbac","count":7},{"key":"access_control","count":6},{"key":"employee_training","count":4}],"reclassifiedChunkCount":41}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx7ke04yy14xo4ypbwur0","fileName":"Logging_and_Monitoring_Standard.docx","parseStatus":"COMPLETED","chunkCount":23,"classifiedChunkCount":17,"orphanChunkCount":6,"orphanPct":26.09,"topMappedTopics":[{"key":"logging","count":10},{"key":"monitoring","count":5},{"key":"backups","count":4}],"reclassifiedChunkCount":37}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx7yj050r14xod30jn0br","fileName":"Microsoft_Purview_Integration_Guide.docx","parseStatus":"COMPLETED","chunkCount":23,"classifiedChunkCount":16,"orphanChunkCount":7,"orphanPct":30.43,"topMappedTopics":[{"key":"purview_integration","count":9},{"key":"monitoring","count":6},{"key":"access_control","count":3}],"reclassifiedChunkCount":31}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasx9dn053414xozrv9tc68","fileName":"Privacy_and_Data_Handling_Policy.docx","parseStatus":"COMPLETED","chunkCount":22,"classifiedChunkCount":17,"orphanChunkCount":5,"orphanPct":22.73,"topMappedTopics":[{"key":"rbac","count":6},{"key":"data_classification","count":5},{"key":"deletion","count":5}],"reclassifiedChunkCount":40}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasxc0x055o14xootljpzwu","fileName":"Secure_SDLC_Policy.docx","parseStatus":"COMPLETED","chunkCount":22,"classifiedChunkCount":13,"orphanChunkCount":9,"orphanPct":40.91,"topMappedTopics":[{"key":"access_control","count":5},{"key":"subprocessors","count":5},{"key":"rbac","count":4}],"reclassifiedChunkCount":25}
{"event":"diag.ingest.document","sourceDocumentId":"cmoasxcfs058614xowwhqasnl","fileName":"Vulnerability_Management_and_Pentest_Standard.docx","parseStatus":"COMPLETED","chunkCount":21,"classifiedChunkCount":11,"orphanChunkCount":10,"orphanPct":47.62,"topMappedTopics":[{"key":"vulnerability_management","count":4},{"key":"monitoring","count":3},{"key":"employee_training","count":2}],"reclassifiedChunkCount":21}
{"event":"diag.ingest.summary","docCount":14,"parsedCount":14,"chunkTotal":285,"classifiedTotal":196,"orphanTotal":89,"orphanPct":31.23}
{"event":"diag.topic.rollout-check","expectedKeys":["access_control","data_classification","tenant_isolation","purview_integration","encryption_at_rest","encryption_in_transit","business_continuity","vulnerability_management","mfa","sso","subprocessors"],"presentKeys":["access_control","data_classification","tenant_isolation","purview_integration","encryption_at_rest","encryption_in_transit","business_continuity","vulnerability_management","mfa","sso","subprocessors"],"missingKeys":[],"totalMergedTopicCount":27}
{"event":"diag.topic.inventory","topicKey":"mfa","topicName":"MFA","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":15,"taxonomyEntries":3,"approvedCount":3,"draftCount":0,"approvedSubControls":["mfa_methods","user_mfa","admin_mfa"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"sso","topicName":"SSO","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":4,"taxonomyEntries":2,"approvedCount":0,"draftCount":2,"approvedSubControls":[],"draftSubControls":["saml_oidc","scim_provisioning"]}
{"event":"diag.topic.inventory","topicKey":"access_control","topicName":"Access Control","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":56,"taxonomyEntries":7,"approvedCount":13,"draftCount":0,"approvedSubControls":["admin_mfa","offboarding","rbac","access_approval","access_request","access_review","privileged_access"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"rbac","topicName":"Role-Based Access","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":48,"taxonomyEntries":0,"approvedCount":2,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"encryption_at_rest","topicName":"Encryption at Rest","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":8,"taxonomyEntries":2,"approvedCount":2,"draftCount":0,"approvedSubControls":["algorithms"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"encryption_in_transit","topicName":"Encryption in Transit","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":6,"taxonomyEntries":2,"approvedCount":2,"draftCount":0,"approvedSubControls":["inter_service","tls_policy"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"retention","topicName":"Retention","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":21,"taxonomyEntries":2,"approvedCount":4,"draftCount":0,"approvedSubControls":["retention_policy","deletion_process"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"monitoring","topicName":"Monitoring","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":31,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"incident_response","topicName":"Incident Response","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":12,"taxonomyEntries":4,"approvedCount":3,"draftCount":0,"approvedSubControls":["triage","containment","post_mortem"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"vulnerability_management","topicName":"Vulnerability Management","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":13,"taxonomyEntries":4,"approvedCount":4,"draftCount":0,"approvedSubControls":["remediation_sla","secure_sdlc","pentest","scanning"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"employee_training","topicName":"Employee Training","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":14,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"subprocessors","topicName":"Subprocessors","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":29,"taxonomyEntries":2,"approvedCount":2,"draftCount":0,"approvedSubControls":["subprocessor_review","subprocessor_list"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"data_residency","topicName":"Data Residency","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":7,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"business_continuity","topicName":"Business Continuity","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":7,"taxonomyEntries":3,"approvedCount":3,"draftCount":0,"approvedSubControls":["backup_frequency","dr_testing","rto_rpo"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"password_policy","topicName":"Password Policy","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":18,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"backups","topicName":"Backups","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":18,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"deletion","topicName":"Deletion","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":11,"taxonomyEntries":0,"approvedCount":0,"draftCount":1,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"logging","topicName":"Logging","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":27,"taxonomyEntries":2,"approvedCount":4,"draftCount":0,"approvedSubControls":["admin_audit_log","alert_monitoring"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"scim_provisioning","topicName":"SCIM Provisioning","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"product-security-controls","topicName":"Product Security Controls","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"sla_availability","topicName":"SLA & Uptime Commitments","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"data_residency_europe","topicName":"European Data Residency","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"subprocessor_review","topicName":"Subprocessor Audits","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"cyber-asset-decommissioning","topicName":"Cyber Asset Decommissioning","scope":"workspace","chunkCoverageCount":0,"taxonomyEntries":0,"approvedCount":0,"draftCount":0,"approvedSubControls":[],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"data_classification","topicName":"Data Classification","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":33,"taxonomyEntries":2,"approvedCount":2,"draftCount":0,"approvedSubControls":["label_taxonomy","handling_rules"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"tenant_isolation","topicName":"Tenant Isolation","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":9,"taxonomyEntries":3,"approvedCount":3,"draftCount":0,"approvedSubControls":["logical_isolation","network_isolation","evidence_export"],"draftSubControls":[]}
{"event":"diag.topic.inventory","topicKey":"purview_integration","topicName":"Enterprise Label Integration","scope":"SYSTEM_WORKSPACE","chunkCoverageCount":27,"taxonomyEntries":2,"approvedCount":0,"draftCount":2,"approvedSubControls":[],"draftSubControls":["label_sync","policy_enforcement"]}
{"event":"diag.answer.aggregate","approvedTotal":47,"draftTotal":10,"approvedCreatedOrUpdatedAfterCutoff":47,"draftCreatedOrUpdatedAfterCutoff":10,"answersWithEmptyEmbedding":0,"approvedBySubControlTaggedCount":44,"draftBySubControlTaggedCount":4}
{"event":"diag.questionnaire.summary","questionnaireId":"cmob1ca5p01sz14qcocqt3j0p","rowCount":0,"resolvedTopicCount":0,"approvedSelectedCount":0,"reviewedCount":0,"unresolvedReasonHistogram":{"missing_topic":0,"no_approved_answer":0,"no_evidence":0,"low_quality_draft":0,"low_confidence":0,"mapping_weakness":0,"matching_failed":0,"pipeline_integrity_guard":0,"pipeline_integrity_guard_backfill":0,"approved_answer_retrieval_failed":0,"answer_fitness_failed":0,"missing_subcontrol_coverage":0,"__resolved__":0,"__unresolved_no_reason__":0}}
{"event":"diag.regression.before-after","repairCutoff":"2026-04-23T01:27:02.188Z","classifiedChunkCount":{"before":0,"after":196},"sourceChunkTopicAssociations":{"before":0,"after":414},"approvedAnswers":{"before":0,"after":47},"draftAnswers":{"before":0,"after":10},"answersWithEmbedding":{"before":0,"after":57},"notes":{"questionnaireItems":"QuestionnaireItem has no updatedAt column (schema), so before/after partitioning on questionnaire rows is not recoverable from existing data. Current state is reported as 'after'."},"questionnaireItems":{"rowCount":0,"approvedSelected":0,"unresolvedReasonHistogram":{"missing_topic":0,"no_approved_answer":0,"no_evidence":0,"low_quality_draft":0,"low_confidence":0,"mapping_weakness":0,"matching_failed":0,"pipeline_integrity_guard":0,"pipeline_integrity_guard_backfill":0,"approved_answer_retrieval_failed":0,"answer_fitness_failed":0,"missing_subcontrol_coverage":0,"__resolved__":0,"__unresolved_no_reason__":0}}}
{"event":"diag.row.trace","bucket":"Missing Topics","found":false,"note":"no row with this unresolvedReason in current questionnaire"}
{"event":"diag.row.trace","bucket":"No Answer Content","found":false,"note":"no row with this unresolvedReason in current questionnaire"}
{"event":"diag.row.trace","bucket":"Rejected Draft Candidates","found":false,"note":"no row with this unresolvedReason in current questionnaire"}
{"event":"diag.row.trace","bucket":"Answer Mismatch","found":false,"note":"no row with this unresolvedReason in current questionnaire"}
{"event":"diag.row.trace","bucket":"Sub-Control Missing","found":false,"note":"no row with this unresolvedReason in current questionnaire"}
{"event":"diag.bottleneck.drafts-blocking-rows","totalDrafts":10,"draftsWithAtLeastOneBlockedRow":0,"top15":[]}
{"event":"diag.expectation.matrix","controlFamily":"Access Control","topicKey":"access_control","topicPresent":true,"chunkCoverage":56,"subControlTaxonomyEntries":7,"taxonomyKeys":["rbac","access_request","access_approval","access_review","offboarding","privileged_access","admin_mfa"],"approvedSubControls":{"count":13,"keys":["admin_mfa","offboarding","rbac","access_approval","access_request","access_review","privileged_access"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Encryption at Rest","topicKey":"encryption_at_rest","topicPresent":true,"chunkCoverage":8,"subControlTaxonomyEntries":2,"taxonomyKeys":["algorithms","scope"],"approvedSubControls":{"count":2,"keys":["algorithms"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Encryption in Transit","topicKey":"encryption_in_transit","topicPresent":true,"chunkCoverage":6,"subControlTaxonomyEntries":2,"taxonomyKeys":["tls_policy","inter_service"],"approvedSubControls":{"count":2,"keys":["inter_service","tls_policy"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Logging","topicKey":"logging","topicPresent":true,"chunkCoverage":27,"subControlTaxonomyEntries":2,"taxonomyKeys":["admin_audit_log","alert_monitoring"],"approvedSubControls":{"count":4,"keys":["admin_audit_log","alert_monitoring"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Incident Response","topicKey":"incident_response","topicPresent":true,"chunkCoverage":12,"subControlTaxonomyEntries":4,"taxonomyKeys":["triage","containment","communication","post_mortem"],"approvedSubControls":{"count":3,"keys":["triage","containment","post_mortem"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Business Continuity / DR","topicKey":"business_continuity","topicPresent":true,"chunkCoverage":7,"subControlTaxonomyEntries":3,"taxonomyKeys":["rto_rpo","backup_frequency","dr_testing"],"approvedSubControls":{"count":3,"keys":["backup_frequency","dr_testing","rto_rpo"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Retention / Deletion","topicKey":"retention","topicPresent":true,"chunkCoverage":21,"subControlTaxonomyEntries":2,"taxonomyKeys":["retention_policy","deletion_process"],"approvedSubControls":{"count":4,"keys":["retention_policy","deletion_process"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Subprocessors","topicKey":"subprocessors","topicPresent":true,"chunkCoverage":29,"subControlTaxonomyEntries":2,"taxonomyKeys":["subprocessor_list","subprocessor_review"],"approvedSubControls":{"count":2,"keys":["subprocessor_review","subprocessor_list"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Data Classification","topicKey":"data_classification","topicPresent":true,"chunkCoverage":33,"subControlTaxonomyEntries":2,"taxonomyKeys":["label_taxonomy","handling_rules"],"approvedSubControls":{"count":2,"keys":["label_taxonomy","handling_rules"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Vulnerability Management / SDLC","topicKey":"vulnerability_management","topicPresent":true,"chunkCoverage":13,"subControlTaxonomyEntries":4,"taxonomyKeys":["scanning","remediation_sla","pentest","secure_sdlc"],"approvedSubControls":{"count":4,"keys":["remediation_sla","secure_sdlc","pentest","scanning"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"Purview / Enterprise Labels","topicKey":"purview_integration","topicPresent":true,"chunkCoverage":27,"subControlTaxonomyEntries":2,"taxonomyKeys":["label_sync","policy_enforcement"],"approvedSubControls":{"count":0,"keys":[]},"draftSubControls":{"count":2,"keys":["label_sync","policy_enforcement"]},"blockedQuestionnaireRows":0,"populationStage":"partial","firstBrokenGate":"approval"}
{"event":"diag.expectation.matrix","controlFamily":"Tenant Isolation","topicKey":"tenant_isolation","topicPresent":true,"chunkCoverage":9,"subControlTaxonomyEntries":3,"taxonomyKeys":["logical_isolation","network_isolation","evidence_export"],"approvedSubControls":{"count":3,"keys":["logical_isolation","network_isolation","evidence_export"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"MFA","topicKey":"mfa","topicPresent":true,"chunkCoverage":15,"subControlTaxonomyEntries":3,"taxonomyKeys":["admin_mfa","user_mfa","mfa_methods"],"approvedSubControls":{"count":3,"keys":["mfa_methods","user_mfa","admin_mfa"]},"draftSubControls":{"count":0,"keys":[]},"blockedQuestionnaireRows":0,"populationStage":"ok","firstBrokenGate":"n/a"}
{"event":"diag.expectation.matrix","controlFamily":"SSO","topicKey":"sso","topicPresent":true,"chunkCoverage":4,"subControlTaxonomyEntries":2,"taxonomyKeys":["saml_oidc","scim_provisioning"],"approvedSubControls":{"count":0,"keys":[]},"draftSubControls":{"count":2,"keys":["saml_oidc","scim_provisioning"]},"blockedQuestionnaireRows":0,"populationStage":"partial","firstBrokenGate":"approval"}
```
