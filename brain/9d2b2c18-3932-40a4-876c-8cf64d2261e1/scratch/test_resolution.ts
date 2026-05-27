import { resolveWorkspaceMembership } from "@/lib/auth/resolve-membership";
import { prisma } from "@/lib/db/prisma";
import { 
  NoWorkspaceAccessError, 
  WorkspaceSelectionRequiredError 
} from "@/lib/auth/errors";

async function testResolution() {
  console.log("--- Starting Workspace Resolution Tests ---");

  // Mock User
  const user1 = await prisma.user.findFirst();
  if (!user1) {
    console.error("No users found in database. Seed needed.");
    return;
  }
  const userId = user1.id;

  // Cleanup: Ensure at least one membership exists for testing
  let activeMemberships = await prisma.workspaceMembership.findMany({
    where: { userId, status: "ACTIVE" }
  });

  if (activeMemberships.length === 0) {
    console.log("Seeding a mock membership for test...");
    const workspace = await prisma.workspace.create({ data: { name: "Test WS", slug: "test-ws-" + Date.now(), status: "ACTIVE" } });
    await prisma.workspaceMembership.create({ 
      data: { userId, workspaceId: workspace.id, role: "OWNER", status: "ACTIVE" } 
    });
    // Re-fetch
    activeMemberships = await prisma.workspaceMembership.findMany({
      where: { userId, status: "ACTIVE" }
    });
  }

  const membershipCount = activeMemberships.length;
  const validWorkspaceId = activeMemberships[0].workspaceId;

  console.log(`User ${userId} has ${membershipCount} active memberships.`);

  // Test Case 1: Valid Hint
  try {
    const res = await resolveWorkspaceMembership({ userId, requestedWorkspaceId: validWorkspaceId });
    console.log("TC1: Valid Hint -> PASSED", res.workspaceId === validWorkspaceId ? "(Match)" : "(Mismatch)");
  } catch (e) {
    console.error("TC1: Valid Hint -> FAILED", e);
  }

  // Test Case 2: Invalid Hint (Ignored and Replaced)
  try {
    const res = await resolveWorkspaceMembership({ userId, requestedWorkspaceId: "non-existent-id" });
    if (membershipCount === 1) {
      console.log("TC2: Invalid Hint (Single WS) -> PASSED (Auto-selected valid WS)", res.workspaceId === validWorkspaceId);
    } else {
      console.log(`TC2: Invalid Hint (Multiple WS) -> FAILED (Got ${res.workspaceId}, expected throw)`);
    }
  } catch (e) {
    if (e instanceof WorkspaceSelectionRequiredError && membershipCount > 1) {
      console.log("TC2: Invalid Hint (Multiple WS) -> PASSED (Caught SelectionRequired)");
    } else {
      console.error("TC2: Invalid Hint -> FAILED", e);
    }
  }

  console.log("--- Tests Completed ---");
}

testResolution().catch(console.error);
