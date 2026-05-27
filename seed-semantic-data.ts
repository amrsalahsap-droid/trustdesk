import { PrismaClient } from "@prisma/client";
import { ChunkingService } from "./src/modules/workspaces/source-documents/parsing/chunking-service";

const prisma = new PrismaClient();

async function seedSemanticData() {
  try {
    console.log("--- Seeding Semantic Search Data ---");

    // 1. Get Workspace
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error("No workspace found");

    const owner = await prisma.user.findFirst();
    if (!owner) throw new Error("No user found");

    // 2. Create a Mock Document
    const doc = await prisma.sourceDocument.create({
      data: {
        workspaceId: workspace.id,
        uploadedById: owner.id,
        fileName: "SecurityPolicy_v1.pdf",
        originalName: "SecurityPolicy_v1.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        storageKey: "mock-policy-123",
        storageBucket: "trustdesk-uploads",
        uploadStatus: "UPLOADED",
      }
    });

    // 3. Add Extracted Content with clear topics
    await prisma.sourceDocumentContent.create({
      data: {
        sourceDocumentId: doc.id,
        fullText: `
          SECTION 1: IDENTITY AND ACCESS
          Multi-factor authentication (MFA) is mandatory for all employee accounts. 
          We use hardware security keys (WebAuthn) as the primary second factor.
          Password complexity requires at least 14 characters.

          SECTION 2: DATA ENCRYPTION
          All sensitive data at rest is encrypted using AES-256-GCM.
          Keys are managed by our cloud provider's Key Management Service (KMS).
          Backups are encrypted before being moved off-site.

          SECTION 3: NETWORK SECURITY
          Our infrastructure is isolated within a Virtual Private Cloud (VPC).
          External traffic is strictly limited to HTTPS (TLS 1.3).
          Intrusion Detection Systems (IDS) scan for anomalous traffic patterns.
        `
      }
    });

    console.log(`Document created and content extracted: ${doc.fileName}`);

    // 4. Run Chunking & Embedding
    console.log("Running Chunking & Embedding engine...");
    await ChunkingService.runChunking(doc.id);

    console.log("--- Seeding Complete ---");
  } catch (err) {
    console.error("Seeding FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seedSemanticData();
