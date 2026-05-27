import { prisma } from "../src/lib/db/prisma";
import { JobRobustnessService } from "../src/modules/infra/job-robustness-service";
import { retryParseJob } from "../src/modules/workspaces/source-documents/parsing/parse-job-service";

async function verifyHardening() {
  console.log("Starting Parsing Pipeline Hardening Verification...");

  // 1. Setup mock data
  const workspace = await prisma.workspace.findFirst({
    include: { memberships: { take: 1 } }
  });
  if (!workspace || workspace.memberships.length === 0) throw new Error("No workspace or user found");
  
  const user = await prisma.user.findUnique({ where: { id: workspace.memberships[0].userId } });
  if (!user) throw new Error("User not found");

  const doc = await prisma.sourceDocument.findFirst({ where: { workspaceId: workspace.id } });
  if (!doc) throw new Error("No document found in workspace " + workspace.id);

  console.log(`Using Workspace: ${workspace.id}, User: ${user.id}, Document: ${doc.id}`);

  // 2. Create a "Zombie" job (heartbeat expired)
  console.log("\n--- Testing Heartbeat Recovery ---");
  // Use raw IDs to satisfy both Prisma and the tenant guard
  const zombieJob = await prisma.sourceDocumentParseJob.create({
    data: {
      workspaceId: workspace.id,
      sourceDocumentId: doc.id,
      triggeredById: user.id,
      status: "PROCESSING",
      startedAt: new Date(Date.now() - 20 * 60 * 1000), // Started 20 mins ago
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000), // Heartbeat stopped 10 mins ago
    }
  });
  console.log(`Created zombie job: ${zombieJob.id}`);

  await JobRobustnessService.recoverStaleJobs();

  const recoveredJob = await prisma.sourceDocumentParseJob.findUnique({
    where: { id: zombieJob.id, workspaceId: workspace.id }
  });
  console.log(`Recovered status: ${recoveredJob?.status}, FailureCode: ${recoveredJob?.failureCode}`);
  
  if (recoveredJob?.status === "FAILED" && recoveredJob.failureCode === "STALE_ORPHAN") {
    console.log("✅ Heartbeat recovery successful.");
  } else {
    console.error("❌ Heartbeat recovery failed.");
  }

  // 3. Create a "Hung" job (hard timeout exceeded despite heartbeats)
  console.log("\n--- Testing Hard Timeout Recovery ---");
  const hungJob = await prisma.sourceDocumentParseJob.create({
    data: {
      workspaceId: workspace.id,
      sourceDocumentId: doc.id,
      triggeredById: user.id,
      status: "PROCESSING",
      startedAt: new Date(Date.now() - 25 * 60 * 1000), // Started 25 mins ago
      lastHeartbeatAt: new Date(), // Just pulse heartbeat now
    }
  });

  await JobRobustnessService.recoverStaleJobs();

  const hungRecovered = await prisma.sourceDocumentParseJob.findUnique({
    where: { id: hungJob.id, workspaceId: workspace.id }
  });
  console.log(`Recovered status: ${hungRecovered?.status}, Error: ${hungRecovered?.errorMessage}`);

  if (hungRecovered?.status === "FAILED" && hungRecovered.errorMessage?.includes("maximum allowed execution time")) {
    console.log("✅ Hard timeout recovery successful.");
  } else {
    console.error("❌ Hard timeout recovery failed.");
  }

  // 4. Test Retry Idempotency (in-place retry)
  console.log("\n--- Testing Retry Idempotency ---");
  const initialJobCount = await prisma.sourceDocumentParseJob.count({
    where: { sourceDocumentId: doc.id, workspaceId: workspace.id }
  });
  
  await retryParseJob(recoveredJob!.id, workspace.id);
  
  const finalJobCount = await prisma.sourceDocumentParseJob.count({
    where: { sourceDocumentId: doc.id, workspaceId: workspace.id }
  });
  const retriedJob = await prisma.sourceDocumentParseJob.findUnique({
    where: { id: recoveredJob!.id, workspaceId: workspace.id }
  });

  console.log(`Job count before: ${initialJobCount}, After retry: ${finalJobCount}`);
  console.log(`Retried job status: ${retriedJob?.status}`);

  if (initialJobCount === finalJobCount && retriedJob?.status === "QUEUED") {
    console.log("✅ In-place retry successful (no duplicate rows).");
  } else {
    console.error("❌ In-place retry failed.");
  }

  // Cleanup testing jobs
  await prisma.sourceDocumentParseJob.deleteMany({
    where: { id: { in: [zombieJob.id, hungJob.id] }, workspaceId: workspace.id }
  });

  console.log("\nVerification Complete.");
}

verifyHardening().catch(console.error).finally(() => prisma.$disconnect());
