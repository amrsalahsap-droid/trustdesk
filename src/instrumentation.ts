import "@/lib/env/server";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.SKIP_DATABASE) {
    try {
      const { JobRobustnessService } = await import("@/modules/infra/job-robustness-service");
      const { staleParseJobs, staleSeedingJobs } = await JobRobustnessService.recoverStaleJobs();

      if (staleParseJobs.length > 0) {
        const { prisma } = await import("@/lib/db/prisma");
        const { runParseJob } = await import("@/modules/workspaces/source-documents/parsing/parse-job-service");
        
        for (const job of staleParseJobs) {
          try {
            await prisma.sourceDocumentParseJob.update({
              where: { id: job.id },
              data: { status: "QUEUED", errorMessage: null }
            });
            void runParseJob(job.id).catch((err) => {
              console.error(`job-recovery:parse:re-run-failed:${job.id}`, err);
            });
          } catch (error) {
            console.error(`job-recovery:parse:update-failed:${job.id}`, error);
          }
        }
      }

      if (staleSeedingJobs.length > 0) {
        const { prisma } = await import("@/lib/db/prisma");
        const { processAnswerSeedingJob } = await import("@/modules/workspaces/intelligence/answer-seeding-job-service");

        for (const job of staleSeedingJobs) {
          try {
            await prisma.answerSeedingJob.update({
              where: { id: job.id },
              data: { status: "QUEUED", lastError: null }
            });
            void processAnswerSeedingJob(job.id).catch((err) => {
              console.error(`job-recovery:seeding:re-run-failed:${job.id}`, err);
            });
          } catch (error) {
            console.error(`job-recovery:seeding:update-failed:${job.id}`, error);
          }
        }
      }
    } catch (error) {
      console.error("Instrumentation registration failed:", error);
      // Don't crash the server, just log the error
    }
  }
}
