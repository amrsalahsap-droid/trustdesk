/**
 * Tests for Evidence Orchestration Service
 * 
 * Tests the automatic evidence categorization and topic linking functionality
 */

import { EvidenceOrchestrationService } from "../evidence-orchestration-service";
import { prisma } from "@/lib/db/prisma";

// Mock dependencies
jest.mock("@/lib/db/prisma");
jest.mock("@/lib/logging/logger");
jest.mock("@/lib/audit");

describe("EvidenceOrchestrationService", () => {
  const mockWorkspaceId = "test-workspace-id";
  const mockUserId = "test-user-id";
  const mockDocumentId = "test-document-id";
  const mockSessionId = "test-session-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("orchestrateEvidence", () => {
    it("should detect SOC2 report and link to appropriate topics", async () => {
      // Mock document
      const mockDocument = {
        id: mockDocumentId,
        originalName: "SOC2_Type2_Report.pdf",
        mimeType: "application/pdf",
        metadata: {
          extractedText: "Service Organization Control Type 2 Report...",
        },
      };

      // Mock document lookup
      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);

      // Mock workspace topics
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { key: "enterprise_saas_security" },
        { key: "governance" },
        { key: "vendor_security" },
      ]);

      // Mock Answer Library items
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: "answer-1",
          topic: { key: "enterprise_saas_security" },
        },
        {
          id: "answer-2", 
          topic: { key: "governance" },
        },
      ]);

      // Mock evidence creation
      (prisma.answerEvidence.create as jest.Mock).mockResolvedValue({ id: "evidence-1" });

      // Mock workspace update for readiness
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          readinessState: {
            missingEvidence: [],
            satisfiedEvidence: [],
            evidenceMaturityScore: 0.5,
          },
        },
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      // Mock document metadata update
      (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

      // Execute
      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId,
        {
          filename: "SOC2_Type2_Report.pdf",
          extractedText: "Service Organization Control Type 2 Report...",
          orchestrationSessionId: mockSessionId,
        }
      );

      // Assertions
      expect(result.documentType).toBe("soc2_report");
      expect(result.category).toBe("Compliance");
      expect(result.linkedTopics).toHaveLength(3);
      expect(result.linkedTopics[0].topicKey).toBe("enterprise_saas_security");
      expect(result.linkedTopics[0].linkageType).toBe("primary");
      expect(result.enrichmentMetadata.confidence).toBeGreaterThan(0.8);
      expect(result.errors).toHaveLength(0);

      // Verify Answer Library linking
      expect(prisma.answerEvidence.create).toHaveBeenCalledTimes(2);
    });

    it("should detect DPA and link to privacy topics", async () => {
      const mockDocument = {
        id: mockDocumentId,
        originalName: "Data_Processing_Agreement.pdf",
        mimeType: "application/pdf",
        metadata: {},
      };

      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);

      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { key: "privacy_gdpr" },
        { key: "data_processing" },
        { key: "vendor_security" },
      ]);

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: "answer-1",
          topic: { key: "privacy_gdpr" },
        },
      ]);

      (prisma.answerEvidence.create as jest.Mock).mockResolvedValue({ id: "evidence-1" });

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          readinessState: {
            missingEvidence: [],
            satisfiedEvidence: [],
            evidenceMaturityScore: 0.5,
          },
        },
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});
      (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId,
        {
          filename: "Data_Processing_Agreement.pdf",
          extractedText: "Data Processing Agreement between controller and processor...",
        }
      );

      expect(result.documentType).toBe("dpa");
      expect(result.category).toBe("Privacy");
      expect(result.linkedTopics[0].topicKey).toBe("privacy_gdpr");
      expect(result.linkedTopics[0].linkageType).toBe("primary");
    });

    it("should handle unknown document type gracefully", async () => {
      const mockDocument = {
        id: mockDocumentId,
        originalName: "Random_Document.pdf",
        mimeType: "application/pdf",
        metadata: {},
      };

      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);

      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: { readinessState: {} },
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});
      (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId,
        {
          filename: "Random_Document.pdf",
          extractedText: "Some random content that doesn't match any patterns...",
        }
      );

      expect(result.documentType).toBe("unknown");
      expect(result.category).toBe("Compliance");
      expect(result.linkedTopics).toHaveLength(0);
      expect(result.enrichmentMetadata.confidence).toBe(0);
    });

    it("should update readiness state when evidence is uploaded", async () => {
      const mockDocument = {
        id: mockDocumentId,
        originalName: "SOC2_Type2_Report.pdf",
        mimeType: "application/pdf",
        metadata: {},
      };

      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);

      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { key: "enterprise_saas_security" },
      ]);

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: "answer-1",
          topic: { key: "enterprise_saas_security" },
        },
      ]);

      (prisma.answerEvidence.create as jest.Mock).mockResolvedValue({ id: "evidence-1" });

      // Mock workspace with missing evidence
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          readinessState: {
            missingEvidence: [
              { topicKey: "enterprise_saas_security", required: true },
              { topicKey: "governance", required: true },
            ],
            satisfiedEvidence: [],
            evidenceMaturityScore: 0.3,
          },
        },
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});
      (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId,
        {
          filename: "SOC2_Type2_Report.pdf",
          extractedText: "Service Organization Control Type 2 Report...",
        }
      );

      // Verify readiness state was updated
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: mockWorkspaceId },
        data: {
          metadata: expect.objectContaining({
            readinessState: expect.objectContaining({
              missingEvidence: expect.arrayContaining([
                expect.objectContaining({ topicKey: "governance" }),
              ]),
              satisfiedEvidence: expect.arrayContaining([
                expect.objectContaining({
                  topicKey: "enterprise_saas_security",
                  documentId: mockDocumentId,
                }),
              ]),
              evidenceMaturityScore: expect.any(Number),
            }),
          }),
        },
      });

      expect(result.readinessImpact.missingEvidenceReduced).toContain("enterprise_saas_security");
      expect(result.readinessImpact.readinessScoreDelta).toBe(0.05);
    });

    it("should handle document not found error", async () => {
      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not found");
      expect(result.documentType).toBe("unknown");
    });
  });

  describe("getOrchestrationResult", () => {
    it("should return orchestration result when metadata exists", async () => {
      const meta = {
        inferredDocumentType: "soc2_report" as const,
        linkedTopics: ["enterprise_saas_security", "governance"],
        linkedCategories: ["Compliance", "Governance"],
        readinessImpact: {
          evidenceMaturityImprovement: 0.1,
          missingEvidenceReduced: [],
          recommendationsSatisfied: [],
          readinessScoreDelta: 0.05,
        },
        onboardingGenerated: true,
        confidence: 0.9,
        orchestrationVersion: "1.0.0",
        orchestratedAt: new Date(),
        orchestrationSessionId: "session-123",
      };

      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue({
        id: mockDocumentId,
        workspaceId: mockWorkspaceId,
      });

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {
          evidenceOrchestrationByDocumentId: {
            [mockDocumentId]: meta,
          },
        },
      });

      const result = await EvidenceOrchestrationService.getOrchestrationResult(mockDocumentId);

      expect(result).not.toBeNull();
      expect(result!.documentType).toBe("soc2_report");
      expect(result!.linkedTopics).toHaveLength(2);
      expect(result!.enrichmentMetadata.confidence).toBe(0.9);
    });

    it("should return null when no orchestration metadata exists", async () => {
      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue({
        id: mockDocumentId,
        workspaceId: mockWorkspaceId,
      });

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {},
      });

      const result = await EvidenceOrchestrationService.getOrchestrationResult(mockDocumentId);

      expect(result).toBeNull();
    });
  });

  describe("removeOrchestration", () => {
    it("should remove orchestration and evidence links", async () => {
      (prisma.answerEvidence.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {
          evidenceOrchestrationByDocumentId: {
            [mockDocumentId]: { inferredDocumentType: "soc2_report" },
          },
        },
      });
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await EvidenceOrchestrationService.removeOrchestration(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId
      );

      expect(result.deleted).toBe(4);
      expect(result.errors).toHaveLength(0);

      expect(prisma.answerEvidence.deleteMany).toHaveBeenCalledWith({
        where: { documentId: mockDocumentId },
      });

      expect(prisma.workspace.update).toHaveBeenCalled();
    });
  });

  describe("document type detection", () => {
    it("should detect document types from filename patterns", async () => {
      const testCases = [
        {
          filename: "SOC2_Type2_Report.pdf",
          expectedType: "soc2_report",
          expectedConfidence: 0.9,
        },
        {
          filename: "ISO27001_Certificate.pdf",
          expectedType: "iso27001_certificate",
          expectedConfidence: 0.9,
        },
        {
          filename: "Data_Processing_Agreement.pdf",
          expectedType: "dpa",
          expectedConfidence: 0.85,
        },
        {
          filename: "Privacy_Policy.pdf",
          expectedType: "privacy_policy",
          expectedConfidence: 0.8,
        },
        {
          filename: "Security_Policy.pdf",
          expectedType: "security_policy",
          expectedConfidence: 0.8,
        },
        {
          filename: "Incident_Response_Plan.pdf",
          expectedType: "incident_response_policy",
          expectedConfidence: 0.85,
        },
        {
          filename: "Business_Continuity_Plan.pdf",
          expectedType: "bc_dr_plan",
          expectedConfidence: 0.85,
        },
        {
          filename: "Penetration_Test_Report.pdf",
          expectedType: "penetration_test",
          expectedConfidence: 0.8,
        },
      ];

      for (const testCase of testCases) {
        const mockDocument = {
          id: mockDocumentId,
          originalName: testCase.filename,
          mimeType: "application/pdf",
          metadata: {},
        };

        (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);
        (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
          id: mockWorkspaceId,
          metadata: { readinessState: {} },
        });

        (prisma.workspace.update as jest.Mock).mockResolvedValue({});
        (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

        const result = await EvidenceOrchestrationService.orchestrateEvidence(
          mockDocumentId,
          mockWorkspaceId,
          mockUserId,
          {
            filename: testCase.filename,
          }
        );

        expect(result.documentType).toBe(testCase.expectedType);
        expect(result.enrichmentMetadata.confidence).toBeCloseTo(testCase.expectedConfidence, 1);
      }
    });

    it("should classify from onboarding upload context when filename is ambiguous", async () => {
      const mockDocument = {
        id: mockDocumentId,
        originalName: "Notes.pdf",
        mimeType: "application/pdf",
      };

      (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { key: "access_control" },
        { key: "security_operations" },
        { key: "governance" },
      ]);
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        onboardingIntelMetaJson: {},
      });
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});
      (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

      const result = await EvidenceOrchestrationService.orchestrateEvidence(
        mockDocumentId,
        mockWorkspaceId,
        mockUserId,
        {
          filename: "Notes.pdf",
          uploadContext: "upload_infosec_policy",
          orchestrationSessionId: mockSessionId,
        },
      );

      expect(result.documentType).toBe("security_policy");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("topic linkage", () => {
    it("should create appropriate topic linkages for each document type", async () => {
      const testCases = [
        {
          documentType: "soc2_report",
          expectedTopics: ["enterprise_saas_security", "governance", "vendor_security"],
        },
        {
          documentType: "dpa",
          expectedTopics: ["privacy_gdpr", "data_processing", "vendor_security"],
        },
        {
          documentType: "security_policy",
          expectedTopics: ["access_control", "security_operations", "governance"],
        },
      ];

      for (const testCase of testCases) {
        const mockDocument = {
          id: mockDocumentId,
          originalName: `${testCase.documentType}.pdf`,
          mimeType: "application/pdf",
          metadata: {},
        };

        (prisma.sourceDocument.findUnique as jest.Mock).mockResolvedValue(mockDocument);

        // Mock all expected topics as existing
        (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue(
          testCase.expectedTopics.map(key => ({ key }))
        );

        (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
          id: mockWorkspaceId,
          metadata: { readinessState: {} },
        });

        (prisma.workspace.update as jest.Mock).mockResolvedValue({});
        (prisma.sourceDocument.update as jest.Mock).mockResolvedValue({});

        const result = await EvidenceOrchestrationService.orchestrateEvidence(
          mockDocumentId,
          mockWorkspaceId,
          mockUserId,
          {
            filename: `${testCase.documentType}.pdf`,
            extractedText: `Content for ${testCase.documentType}`,
          }
        );

        expect(result.linkedTopics.map(t => t.topicKey)).toEqual(
          expect.arrayContaining(testCase.expectedTopics)
        );

        // Verify primary linkage types
        const primaryLinkages = result.linkedTopics.filter(t => t.linkageType === "primary");
        expect(primaryLinkages.length).toBeGreaterThan(0);
      }
    });
  });
});
