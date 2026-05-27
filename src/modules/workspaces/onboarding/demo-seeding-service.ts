import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { EmbeddingService } from "@/lib/ai/embedding-service";
import { DOCUMENT_LIBRARY } from "./document-library-data";
import { randomUUID } from "crypto";

export class DemoSeedingService {
  static async createDemoWorkspace(userId: string) {
    const workspaceName = "Acme Cloud Security Demo";
    const workspaceSlug = `acme-demo-${Math.floor(Math.random() * 10000)}`;

    // 1. Create Workspace
    const workspace = await uncheckedPrisma.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        industry: ["Technology"],
        website: "https://acme-security.example.com",
        status: "ACTIVE",
        dataTypes: ["PII", "Financial"],
        complianceTargets: ["SOC2", "ISO27001"],
        isDemo: true,
      },
    });

    // 2. Add User as Owner
    await uncheckedPrisma.workspaceMembership.create({
      data: {
        userId,
        workspaceId: workspace.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await uncheckedPrisma.user.update({
      where: { id: userId },
      data: { lastActiveWorkspaceId: workspace.id }
    });

    // 3. Seed Documents
    const docsToSeed = ["infosec_policy", "privacy_policy", "access_control"];
    
    for (const docKey of docsToSeed) {
      const entry = DOCUMENT_LIBRARY[docKey];
      const doc = await uncheckedPrisma.sourceDocument.create({
        data: {
          workspaceId: workspace.id,
          uploadedById: userId,
          originalName: `${entry.name}.pdf`,
          fileName: `${entry.id}.pdf`,
          mimeType: "application/pdf",
          fileSizeBytes: 1024 * 50, // Mock size
          storageKey: `demo/${workspace.id}/${entry.id}.pdf`,
          storageBucket: "demo-bucket",
          uploadStatus: "UPLOADED",
        },
      });

      await uncheckedPrisma.sourceDocumentContent.create({
        data: {
          workspaceId: workspace.id,
          sourceDocumentId: doc.id,
          fullText: entry.sampleText,
        },
      });
    }

    // 4. Seed Knowledge Topics & Answers
    const topics = [
      { key: "mfa", name: "MFA", status: "ACTIVE" as const },
      { key: "access_control", name: "Access Control", status: "ACTIVE" as const },
      { key: "encryption_at_rest", name: "Encryption at Rest", status: "ACTIVE" as const },
    ];

    const topicRecords = [];
    for (const t of topics) {
      const topic = await uncheckedPrisma.knowledgeTopic.create({
        data: {
          workspaceId: workspace.id,
          key: t.key,
          name: t.name,
          description: `Acme's policy for ${t.name}`,
          status: t.status,
          embedding: await EmbeddingService.getEmbedding(`${t.name}: Acme's policy`),
        },
      });
      topicRecords.push(topic);
    }

    // Seed Answer Library Items
    const mfaTopic = topicRecords.find(t => t.key === "mfa")!;
    const acTopic = topicRecords.find(t => t.key === "access_control")!;

    const libItemsData = [
      {
        topicId: mfaTopic.id,
        title: "MFA Enforcement",
        answer: "Acme requires Multi-Factor Authentication (MFA) for all employees accessing production systems. We support TOTP and WebAuthn.",
        status: "APPROVED" as const,
        governanceStatus: "APPROVED_FOR_EXPORT" as const,
        subControlKey: "admin_mfa",
      },
      {
        topicId: acTopic.id,
        title: "RBAC Policy",
        answer: "Access to Acme systems is managed via Role-Based Access Control (RBAC). Permissions are granted based on the principle of least privilege.",
        status: "APPROVED" as const,
        governanceStatus: "APPROVED_FOR_EXPORT" as const,
        subControlKey: "rbac",
      },
      {
        topicId: acTopic.id,
        title: "Access Review Cadence",
        answer: "We perform internal access reviews of all administrative accounts on an annual basis.",
        status: "DRAFT" as const,
        governanceStatus: "DRAFT" as const,
        subControlKey: "access_review",
      },
    ];

    const libItems = [];
    for (const item of libItemsData) {
      const record = await uncheckedPrisma.answerLibraryItem.create({
        data: {
          workspaceId: workspace.id,
          topicId: item.topicId,
          title: item.title,
          answer: item.answer,
          status: item.status,
          governanceStatus: item.governanceStatus,
          subControlKey: item.subControlKey,
          embedding: await EmbeddingService.getEmbedding(item.answer),
          versionNumber: 1,
          exportSafe: item.governanceStatus === "APPROVED_FOR_EXPORT",
        },
      });
      libItems.push(record);
    }

    // 5. Seed Questionnaire
    const questionnaire = await uncheckedPrisma.questionnaire.create({
      data: {
        workspaceId: workspace.id,
        title: "CSA CAIQ v4 - Acme Assessment",
        sourceFileName: "csa_caiq_v4.xlsx",
        createdById: userId,
      },
    });

    const questionnaireItems = [
      {
        question: "Is Multi-Factor Authentication (MFA) required for all administrative access?",
        importedAnswer: "Yes",
        suggestedAnswer: "Acme requires Multi-Factor Authentication (MFA) for all employees accessing production systems. We support TOTP and WebAuthn.",
        finalAnswer: "Acme requires Multi-Factor Authentication (MFA) for all employees accessing production systems. We support TOTP and WebAuthn.",
        reviewStatus: "matched",
        reviewed: true,
        topicId: mfaTopic.id,
        topicKey: mfaTopic.key,
        topicName: mfaTopic.name,
        finalAnswerSelection: "suggested" as const,
        suggestedAnswerId: libItems.find(i => i.subControlKey === "admin_mfa")?.id,
      },
      {
        question: "How frequently are user access rights reviewed for administrative accounts?",
        importedAnswer: "Quarterly",
        suggestedAnswer: "We perform internal access reviews of all administrative accounts on an annual basis.",
        finalAnswer: "Acme performs comprehensive access reviews for all administrative accounts on a quarterly basis, exceeding our internal annual policy minimum.",
        reviewStatus: "edited",
        reviewed: true,
        topicId: acTopic.id,
        topicKey: acTopic.key,
        topicName: acTopic.name,
        finalAnswerSelection: "edited" as const,
        suggestedAnswerId: libItems.find(i => i.subControlKey === "access_review")?.id,
      },
      {
        question: "Are data-at-rest encryption keys managed in a Hardware Security Module (HSM)?",
        importedAnswer: null,
        suggestedAnswer: "Acme uses AWS KMS with FIPS 140-2 Level 3 validated HSMs to manage all data-at-rest encryption keys.",
        finalAnswer: "Acme uses AWS KMS with FIPS 140-2 Level 3 validated HSMs to manage all data-at-rest encryption keys.",
        reviewStatus: "matched",
        reviewed: false,
        verificationStatus: "SUGGESTED" as const,
        topicId: topicRecords.find(t => t.key === "encryption_at_rest")!.id,
        topicKey: "encryption_at_rest",
        topicName: "Encryption at Rest",
        finalAnswerSelection: "suggested" as const,
      },
      {
        question: "Do you maintain a SOC2 Type II report for the current fiscal year?",
        importedAnswer: null,
        suggestedAnswer: "Yes, Acme maintains a SOC2 Type II report covering the Security, Availability, and Confidentiality trust principles. The report is available for review upon request under NDA.",
        finalAnswer: "Yes, Acme maintains a SOC2 Type II report covering the Security, Availability, and Confidentiality trust principles. The report is available for review upon request under NDA.",
        reviewStatus: "matched",
        reviewed: false,
        verificationStatus: "NEEDS_REVIEW" as const,
        unresolvedReason: null,
        suggestionStatus: "AI Synthesis Complete",
      },
      {
        question: "Is root access to the production environment restricted and logged?",
        importedAnswer: "Yes",
        suggestedAnswer: "Administrator access is reviewed every 90 days for necessity. (From Access Control Policy)",
        finalAnswer: "Yes, root access is strictly restricted to senior SREs and all sessions are logged via AWS CloudTrail.",
        reviewStatus: "matched",
        reviewed: true,
        topicId: acTopic.id,
        topicKey: acTopic.key,
        topicName: acTopic.name,
        finalAnswerSelection: "edited" as const,
      },
    ];

    for (const [index, item] of questionnaireItems.entries()) {
      const qItem = await uncheckedPrisma.questionnaireItem.create({
        data: {
          workspaceId: workspace.id,
          questionnaireId: questionnaire.id,
          sortOrder: index,
          question: item.question,
          importedAnswer: item.importedAnswer,
          importedAnswerSource: item.importedAnswer ? "raw_import" : null,
          suggestedAnswer: item.suggestedAnswer || "",
          finalAnswer: item.finalAnswer || "",
          reviewStatus: item.reviewStatus,
          reviewed: item.reviewed,
          topicId: item.topicId || null,
          topicKey: item.topicKey || null,
          topicName: item.topicName || null,
          unresolvedReason: item.unresolvedReason || null,
          finalAnswerSelection: item.finalAnswerSelection || null,
          suggestedAnswerId: item.suggestedAnswerId || null,
          verificationStatus: (item as any).verificationStatus || (item.reviewed ? "ACCEPTED" : "UNREVIEWED"),
          suggestionStatus: (item as any).suggestionStatus || (item.reviewed ? "Verified" : "Pending Review"),
        },
      });

      // Add a blocker (Contradiction) to the "root access" question
      if (item.question.includes("root access")) {
        const acLibItem = libItems.find(i => i.subControlKey === "rbac")!; // Just picking a canonical one for the mock
        await uncheckedPrisma.contradictionResult.create({
          data: {
            workspaceId: workspace.id,
            questionnaireId: questionnaire.id,
            questionnaireItemId: qItem.id,
            contradictionFound: true,
            contradictionType: "DIRECT_NEGATION",
            severity: "critical",
            message: "Direct contradiction detected with Access Control Policy.",
            reason: "The questionnaire answer states root access is restricted, but the policy (Section 4) mentions shared root credentials for emergency use.",
            rowAnswerExcerpt: "root access is strictly restricted to senior SREs",
            canonicalAnswerId: acLibItem.id,
            canonicalAnswerExcerpt: "Shared root credentials are maintained in an emergency vault...",
            canonicalVersionNumber: 1,
            resolutionStatus: "PENDING",
            isStale: false,
            detectorVersion: "1.0.0",
          },
        });
      }

      // Add a warning (Manual override/Flag) to the "access rights reviewed" question
      if (item.question.includes("access rights reviewed")) {
        await uncheckedPrisma.questionnaireItem.update({
          where: { id: qItem.id },
          data: {
            conflictNote: "Warning: Policy requires annual review, but questionnaire claims quarterly. Check if internal procedures have been updated.",
          }
        });
      }
    }

    return workspace;
  }
}
