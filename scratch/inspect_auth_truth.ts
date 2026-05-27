
import { resolveWorkspaceMembership } from "../src/lib/auth/resolve-membership";
import { prisma } from "../src/lib/db/prisma";
import { 
  NoWorkspaceAccessError, 
  MembershipSuspendedError, 
  WorkspaceSelectionRequiredError 
} from "../src/lib/auth/errors";

async function main() {
  console.log("--- Auth & Membership Truth Inspection ---");

  // 1. Create a clean user
  const email = "auth-tester@test.com";
  await prisma.workspaceMembership.deleteMany({ where: { user: { email } } });
  await prisma.workspace.deleteMany({ where: { slug: { in: ["ws-1", "ws-2"] } } });
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: {
      email,
      name: "Auth Tester",
      passwordHash: "hash",
    }
  });

  console.log(`\nScenario 1: No memberships`);
  try {
    await resolveWorkspaceMembership({ userId: user.id });
    console.log("FAIL: Expected NoWorkspaceAccessError");
  } catch (e) {
    console.log(`SUCCESS: Caught ${e.constructor.name}: ${e.message}`);
  }

  // 2. Create a suspended membership
  const ws1 = await prisma.workspace.create({
    data: { name: "WS 1", slug: "ws-1", status: "ACTIVE" }
  });
  await prisma.workspaceMembership.create({
    data: {
      userId: user.id,
      workspaceId: ws1.id,
      role: "EDITOR",
      status: "SUSPENDED"
    }
  });

  console.log(`\nScenario 2: Suspended membership (with hint)`);
  try {
    await resolveWorkspaceMembership({ userId: user.id, requestedWorkspaceId: ws1.id });
    console.log("FAIL: Expected MembershipSuspendedError");
  } catch (e) {
    console.log(`SUCCESS: Caught ${e.constructor.name}: ${e.message}`);
  }

  // 3. Create two active memberships
  const ws2 = await prisma.workspace.create({
    data: { name: "WS 2", slug: "ws-2", status: "ACTIVE" }
  });
  await prisma.workspaceMembership.updateMany({
    where: { userId: user.id, workspaceId: ws1.id },
    data: { status: "ACTIVE" }
  });
  await prisma.workspaceMembership.create({
    data: {
      userId: user.id,
      workspaceId: ws2.id,
      role: "EDITOR",
      status: "ACTIVE"
    }
  });

  console.log(`\nScenario 3: Multiple memberships (no hint)`);
  try {
    await resolveWorkspaceMembership({ userId: user.id });
    console.log("FAIL: Expected WorkspaceSelectionRequiredError");
  } catch (e) {
    console.log(`SUCCESS: Caught ${e.constructor.name}: ${e.message}`);
    if (e instanceof WorkspaceSelectionRequiredError) {
        console.log(`Workspace IDs: ${e.workspaceIds.join(", ")}`);
    }
  }

  console.log(`\nScenario 4: Multiple memberships (with valid hint)`);
  try {
    const result = await resolveWorkspaceMembership({ userId: user.id, requestedWorkspaceId: ws2.id });
    console.log(`SUCCESS: Resolved to workspace ${result.workspaceId}`);
  } catch (e) {
    console.log(`FAIL: Caught unexpected error ${e.constructor.name}: ${e.message}`);
  }

  // Cleanup
  await prisma.workspaceMembership.deleteMany({ where: { userId: user.id } });
  await prisma.workspace.deleteMany({ where: { id: { in: [ws1.id, ws2.id] } } });
  await prisma.user.delete({ where: { id: user.id } });
}

main().catch(console.error);
