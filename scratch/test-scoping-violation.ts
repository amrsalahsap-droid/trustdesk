import { prisma } from "../src/lib/db/prisma";
import { MultiTenantScopingError } from "../src/lib/db/tenant-extension";

async function testViolation() {
  console.log("Testing multi-tenant scoping enforcement...");

  try {
    console.log("Attempting to fetch all QuestionnaireItems without workspaceId filter (this should fail)...");
    // @ts-ignore - Deliberately missing where filter for testing
    await prisma.questionnaireItem.findMany();
    console.error("FAILURE: Query succeeded when it should have been blocked by the extension!");
    process.exit(1);
  } catch (err) {
    if (err instanceof MultiTenantScopingError) {
      console.log("SUCCESS: Caught expected MultiTenantScopingError:", err.message);
    } else {
      console.error("FAILURE: Caught unexpected error type:", err);
      process.exit(1);
    }
  }

  try {
    console.log("Attempting to fetch a single QuestionnaireItem by ID without workspaceId (this should fail)...");
    // @ts-ignore
    await prisma.questionnaireItem.findUnique({
      where: { id: "some-id" }
    });
    console.error("FAILURE: findUnique succeeded without workspaceId!");
    process.exit(1);
  } catch (err) {
    if (err instanceof MultiTenantScopingError) {
      console.log("SUCCESS: findUnique blocked as expected.");
    } else {
      console.error("FAILURE:", err);
      process.exit(1);
    }
  }

  try {
    console.log("Attempting to fetch with valid workspaceId (this should succeed)...");
    // We use a dummy ID; it might return empty array but it shouldn't throw the scoping error.
    await prisma.questionnaireItem.findMany({
      where: { workspaceId: "some-workspace-id" }
    });
    console.log("SUCCESS: Query with workspaceId succeeded.");
  } catch (err) {
    console.error("FAILURE: Query with valid workspaceId was blocked!", err);
    process.exit(1);
  }

  console.log("All scoping tests passed.");
}

testViolation().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
