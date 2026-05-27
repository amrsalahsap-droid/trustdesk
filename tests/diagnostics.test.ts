import { describe, it } from "vitest";
import { prisma } from "../src/lib/db/prisma";

describe("Diagnostics", () => {
  it("should print latest orchestration results", async () => {
    const latestWorkspace = await prisma.workspace.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        onboardingIntelMetaJson: true,
      },
    });

    if (!latestWorkspace) {
      console.log("No workspaces found.");
      return;
    }

    console.log(`Workspace: ${latestWorkspace.name} (${latestWorkspace.id})`);
    const intel = latestWorkspace.onboardingIntelMetaJson as any;
    const prep = intel?.workspacePreparation;

    if (!prep) {
      console.log("No preparation state found in onboardingIntelMetaJson.");
      return;
    }

    console.log("\n--- Orchestration Summary ---");
    console.log(JSON.stringify(prep.summary || {}, null, 2));

    console.log("\n--- Stage Results ---");
    console.log(JSON.stringify(prep.stageResults || {}, null, 2));

    if (prep.errors && prep.errors.length > 0) {
      console.log("\n--- Errors ---");
      prep.errors.forEach((e: string) => console.log(`- ${e}`));
    }
  });
});
