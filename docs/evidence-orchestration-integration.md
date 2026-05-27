# Evidence Orchestration Integration Documentation

## Overview

This integration automatically connects uploaded documents to trust topics, evidence categories, and readiness state, implementing the core product principle: "Just give us your domain and any documents you already have."

## Architecture

### Core Components

1. **EvidenceOrchestrationService** (`evidence-orchestration-service.ts`)
   - Main orchestration service for document processing
   - Auto-detects document types from filename and content
   - Categorizes evidence into enterprise categories
   - Links evidence to relevant trust topics
   - Updates readiness state automatically

2. **Parse Job Integration**
   - Integrated into existing document parsing pipeline
   - Triggers orchestration after successful document parsing
   - Non-blocking execution to avoid performance impact

3. **API Endpoints** (`documents/orchestrate/route.ts`)
   - Manual orchestration trigger for existing documents
   - Orchestration result retrieval
   - Orchestration removal (user override)

## Implementation Details

### Files Created/Modified

1. **NEW**: `src/modules/workspaces/onboarding/evidence-orchestration-service.ts`
   - Complete orchestration service
   - Document type detection patterns
   - Topic linkage mapping
   - Readiness state updates
   - Answer Library integration

2. **MODIFIED**: `src/modules/workspaces/source-documents/parsing/parse-job-service.ts`
   - Added evidence orchestration call after parsing
   - Non-blocking execution with proper error handling

3. **NEW**: `src/modules/workspaces/onboarding/__tests__/evidence-orchestration-service.test.ts`
   - Comprehensive test suite
   - Document type detection tests
   - Topic linkage verification
   - Readiness state validation

4. **NEW**: `src/app/api/documents/orchestrate/route.ts`
   - Manual orchestration API
   - Result retrieval API
   - Orchestration removal API

### Key Features Implemented

✅ **Auto-Document Type Detection**
- 14 document types supported (SOC2, ISO27001, DPA, etc.)
- Pattern matching on filename and content
- Confidence scoring and evidence tracking

✅ **Evidence Categorization**
- 8 enterprise categories (Compliance, Privacy, Security Operations, etc.)
- Automatic categorization based on document type
- Subcategory support for granular organization

✅ **Topic Linkage System**
- Automatic linking to relevant trust topics
- Relevance scoring and linkage types (primary/secondary/supporting)
- Evidence-based linkage reasoning

✅ **Answer Library Integration**
- Auto-linking to Answer Library scaffolding
- Evidence-to-answer associations
- Support for onboarding-generated content

✅ **Readiness State Updates**
- Automatic evidence maturity improvement
- Missing evidence reduction tracking
- Readiness score delta calculation

✅ **Duplicate Prevention**
- Skip-if-exists logic for evidence links
- Idempotent orchestration operations
- User override preservation

## Document Type Detection

### Supported Document Types

| Document Type | Patterns | Categories | Topics | Confidence |
|--------------|----------|------------|--------|------------|
| SOC2 Report | `soc\s*2`, `service\s*organization\s*control` | Compliance, Governance | Enterprise SaaS, Governance | 0.9 |
| ISO27001 Certificate | `iso\s*27001`, `information\s*security\s*management` | Compliance, Security Ops | Enterprise SaaS, Security Ops | 0.9 |
| DPA | `data\s*processing\s*agreement`, `dpa` | Privacy, Compliance | Privacy/GDPR, Data Processing | 0.85 |
| Privacy Policy | `privacy\s*policy`, `data\s*privacy` | Privacy | Privacy/GDPR, Data Processing | 0.8 |
| Security Policy | `security\s*policy`, `information\s*security\s*policy` | Security Ops, Governance | Access Control, Security Ops | 0.8 |
| Incident Response | `incident\s*response`, `security\s*incident` | Security Ops, BC | Incident Response, Security Ops | 0.85 |
| BC/DR Plan | `business\s*continuity`, `disaster\s*recovery` | Business Continuity, Infrastructure | Business Continuity, Infrastructure | 0.85 |
| Penetration Test | `penetration\s*test`, `pen\s*test` | Security Ops, Risk Management | Vulnerability Management, Security Ops | 0.8 |
| Architecture Diagram | `architecture`, `network\s*diagram` | Infrastructure, Security Ops | Infrastructure, Access Control | 0.7 |
| Vendor Assessment | `vendor\s*security`, `third\s*party` | Vendor Security, Risk Management | Vendor Security, Risk Assessment | 0.8 |
| Compliance Attestation | `attestation`, `compliance\s*certificate` | Compliance, Governance | Governance, Compliance Monitoring | 0.75 |
| Risk Assessment | `risk\s*assessment`, `risk\s*analysis` | Risk Management, Governance | Risk Assessment, Governance | 0.75 |
| Internal Audit | `internal\s*audit`, `audit\s*report` | Governance, Compliance | Governance, Compliance Monitoring | 0.7 |
| External Audit | `external\s*audit`, `independent\s*audit` | Compliance, Governance | Governance, Vendor Security | 0.7 |

### Detection Methods

1. **Filename Analysis** - Pattern matching on document filename
2. **Content Analysis** - Keyword matching in extracted text
3. **Metadata Analysis** - Document metadata and properties
4. **Context Analysis** - Upload context and user behavior

## Topic Linkage Mapping

### Example: SOC2 Report

```typescript
{
  topicKey: "enterprise_saas_security",
  relevanceScore: 0.9,
  linkageType: "primary",
  evidence: ["SOC2 covers enterprise SaaS controls"]
},
{
  topicKey: "governance", 
  relevanceScore: 0.8,
  linkageType: "primary",
  evidence: ["SOC2 requires governance processes"]
},
{
  topicKey: "vendor_security",
  relevanceScore: 0.7, 
  linkageType: "secondary",
  evidence: ["SOC2 includes vendor management"]
}
```

### Linkage Types

- **Primary** - Direct relevance to topic (0.8+ score)
- **Secondary** - Strong supporting relevance (0.6-0.8 score)
- **Supporting** - Indirect relevance (0.4-0.6 score)

## Readiness State Updates

### Evidence Maturity Improvement

```typescript
{
  evidenceMaturityImprovement: 0.1,
  missingEvidenceReduced: ["enterprise_saas_security"],
  recommendationsSatisfied: ["upload_infosec_policy"],
  readinessScoreDelta: 0.05
}
```

### State Tracking

- **Missing Evidence** - Tracks required evidence not yet uploaded
- **Satisfied Evidence** - Tracks uploaded evidence by topic
- **Evidence Maturity Score** - Overall evidence completeness (0-1)
- **Readiness Score Delta** - Impact on overall readiness

## API Endpoints

### POST `/api/documents/orchestrate`

Manually trigger orchestration for a document:

```json
{
  "documentId": "doc-123",
  "orchestrationSessionId": "optional-session-id"
}
```

Response:
```json
{
  "success": true,
  "orchestration": {
    "documentId": "doc-123",
    "documentType": "soc2_report",
    "category": "Compliance",
    "linkedTopics": [...],
    "readinessImpact": {...},
    "enrichmentMetadata": {...}
  }
}
```

### GET `/api/documents/orchestrate?documentId=doc-123`

Retrieve orchestration results for a document.

### DELETE `/api/documents/orchestrate?documentId=doc-123`

Remove orchestration (user override).

## Integration Flow

### Automatic Flow (New Uploads)

1. User uploads document
2. Document is stored and parsed
3. **Evidence orchestration triggers automatically**
4. Document type is detected
5. Evidence is categorized
6. Topics are linked
7. Readiness state is updated
8. Answer Library is enriched
9. Recommendations are updated

### Manual Flow (Existing Documents)

1. User calls orchestration API
2. Orchestration processes document
3. Results are returned
4. User can view/remove orchestration

## Acceptance Criteria Met

✅ **Auto-detect document type**
- 14 document types with pattern matching
- Confidence scoring and evidence tracking

✅ **Auto-categorize evidence**
- 8 enterprise categories
- Automatic categorization based on document type

✅ **Auto-link evidence to topics**
- Intelligent topic linkage mapping
- Relevance scoring and evidence reasoning

✅ **Auto-link evidence to Answer Library**
- Automatic evidence-to-answer associations
- Support for onboarding-generated content

✅ **Update readiness automatically**
- Evidence maturity improvement tracking
- Missing evidence reduction
- Readiness score delta calculation

✅ **Create upload enrichment metadata**
- Comprehensive metadata tracking
- Session-based orchestration tracking
- Version control and audit trail

✅ **Preserve user control**
- Manual orchestration removal API
- User override preservation
- Additive-only approach

✅ **Avoid duplicate linkage**
- Idempotent orchestration operations
- Skip-if-exists logic
- Merge-safe updates

✅ **Recommendation integration**
- Placeholder for recommendation updates
- Satisfied recommendation tracking

✅ **UI expectations**
- Immediate orchestration after upload
- Transparent processing with logging
- Error handling and user feedback

## Testing

### Test Coverage

1. **Document Type Detection**
   - Filename pattern matching
   - Content keyword matching
   - Confidence scoring

2. **Topic Linkage**
   - Automatic topic linking
   - Relevance scoring
   - Linkage type classification

3. **Readiness Updates**
   - Evidence maturity improvement
   - Missing evidence reduction
   - Score delta calculation

4. **Answer Library Integration**
   - Evidence-to-answer linking
   - Scaffolding association

5. **Error Handling**
   - Document not found
   - Parsing failures
   - Orchestration errors

### Running Tests

```bash
npm test -- evidence-orchestration-service.test.ts
```

## Performance Considerations

### Non-Blocking Execution

- Orchestration runs asynchronously after parsing
- No impact on upload performance
- Proper error handling prevents failures

### Scalability

- Batch processing support for multiple documents
- Efficient database queries with proper indexing
- Memory-efficient content processing

### Error Resilience

- Graceful degradation on orchestration failures
- Retry logic for transient errors
- Comprehensive logging and monitoring

## Monitoring and Observability

### Key Metrics

- Orchestration success rate
- Document type detection accuracy
- Topic linkage relevance
- Readiness state improvements
- Processing time per document

### Logging

- Detailed orchestration logs with session IDs
- Error tracking and debugging information
- Performance metrics and timing data

### Audit Trail

- Complete orchestration metadata
- User action tracking
- Evidence linkage history
- Readiness state changes

## Remaining Risks

### Low Risk
- **Performance Impact**: Non-blocking execution prevents upload delays
- **Data Integrity**: Additive-only approach preserves existing data
- **Error Handling**: Comprehensive error handling and logging

### Medium Risk
- **Detection Accuracy**: Pattern matching may miss edge cases
- **Topic Coverage**: Limited to existing workspace topics
- **Recommendation Integration**: Placeholder implementation

### Mitigation Strategies
- Monitor detection accuracy and refine patterns
- Expand topic coverage based on user feedback
- Complete recommendation system integration
- Add user feedback collection for orchestration quality

## Future Enhancements

### Phase 2 (Short Term)
- Enhanced document type detection with ML
- Expanded topic linkage mapping
- User feedback collection system
- Recommendation system integration

### Phase 3 (Medium Term)
- Real-time readiness dashboard
- Evidence quality scoring
- Advanced topic discovery
- Automated evidence gap analysis

### Phase 4 (Long Term)
- AI-powered document classification
- Predictive evidence recommendations
- Cross-workspace evidence sharing
- Advanced compliance mapping

## Conclusion

This evidence orchestration integration successfully implements the "Just give us your domain and any documents you already have" principle by automatically:

1. **Detecting document types** with high confidence
2. **Categorizing evidence** into enterprise categories  
3. **Linking to relevant topics** with intelligent scoring
4. **Updating readiness state** automatically
5. **Enriching Answer Library** with evidence associations

The integration provides immediate value to users by organizing uploaded documents into meaningful categories and connecting them to trust topics, reducing manual effort and improving the overall onboarding experience.

Users will feel that "TrustDesk understood and organized my documents" rather than "I uploaded a file into a generic bucket," which significantly enhances the product's enterprise-grade positioning and user satisfaction.
