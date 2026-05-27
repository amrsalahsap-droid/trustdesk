import { QuestionnaireExportService } from "./src/modules/questionnaires/questionnaire-export-service";
import { prisma } from "./src/lib/db/prisma";

async function test() {
  try {
    const qId = "cmoi5lkri001t14lgpb2z16xy";
    const res = await prisma.$queryRaw`SELECT "workspaceId" FROM "Questionnaire" WHERE "id" = ${qId}`;
    if (!res || res.length === 0) {
      console.log("Questionnaire not found via raw query.");
      return;
    }
    const workspaceId = res[0].workspaceId;
    console.log("Found workspace:", workspaceId);
    console.log("Running getReadiness...");
    const result = await QuestionnaireExportService.getReadiness(qId, workspaceId);
    console.log("SUCCESS!", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("ERROR CAUGHT IN getReadiness:");
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
