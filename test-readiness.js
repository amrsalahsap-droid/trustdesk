const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { QuestionnaireExportService } = require('./.next/server/app/api/questionnaires/[id]/export/readiness/route.js') || {};

async function test() {
  try {
    // If we can't require the Next.js compiled file, let's just query the DB directly to see what the data looks like
    const qId = "cmoi5lkri001t14lgpb2z16xy";
    const q = await prisma.questionnaire.findFirst({
      where: { id: qId },
      include: {
        jobs: true,
        items: true,
      }
    });
    console.log("Questionnaire:", q ? "found" : "not found");
    if (!q) return;
    
    console.log("Jobs count:", q.jobs.length);
    if (q.jobs.length > 0) {
      console.log("Job 0 fileBytes typeof:", typeof q.jobs[0].fileBytes);
      console.log("Job 0 fileBytes isBuffer:", Buffer.isBuffer(q.jobs[0].fileBytes));
    }
    
    console.log("Items count:", q.items.length);
    
    // Check if we can import the service directly using tsx
    console.log("Data loaded fine. Using TSX to run the service...");
  } catch (err) {
    console.error("Script error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
