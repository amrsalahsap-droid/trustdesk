import { prisma } from "@/lib/db/prisma";

async function initializeAnswerVersions() {
  try {
    console.log("--- Starting Answer Version Initialization ---");

    // 1. Find all answers that have NO versions
    const items = await prisma.answerLibraryItem.findMany({
      include: {
        versions: { take: 1 }
      }
    });

    const itemsToInitialize = items.filter(item => item.versions.length === 0);
    console.log(`Found ${itemsToInitialize.length} items requiring initialization.`);

    let count = 0;
    for (const item of itemsToInitialize) {
      // Create v1 snapshot based on current state
      await prisma.answerLibraryItemVersion.create({
        data: {
          workspaceId: item.workspaceId,
          answerId: item.id,
          versionNumber: 1,
          title: item.title,
          answerText: item.answer,
          status: item.status,
          changeReason: "System initialization for versioning",
          createdAt: item.createdAt, // Match original creation date
          ownerId: item.ownerId,
          approverId: item.approverId,
          evidenceSnapshotJson: [],
          resetApprovalRequired: false,
        },
      });

      
      // Ensure currentVersion is set to 1
      await prisma.answerLibraryItem.update({
          where: { id: item.id },
          data: { currentVersion: 1 }
      });

      count++;
    }

    console.log(`Successfully initialized ${count} item versions.`);
    console.log("--- Answer Version Initialization Complete ---");
  } catch (err) {
    console.error("Initialization FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

initializeAnswerVersions();
