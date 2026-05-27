
import { createSessionToken } from "../src/lib/auth/session-token";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const email = "forensic@test.com";
  
  // 1. Ensure user exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Forensic Auditor",
        emailVerifiedAt: new Date(),
        passwordHash: "dummy-hash", // required field
      }
    });
    console.log(`Created user: ${user.id}`);
  } else {
    console.log(`Using existing user: ${user.id}`);
  }

  // 2. Generate token
  const token = createSessionToken(user.id);
  console.log("\n--- SESSION TOKEN ---");
  console.log(token);
  console.log("---------------------\n");
  
  // 3. Create a workspace and membership
  const workspace = await prisma.workspace.create({
    data: {
      name: "Forensic Workspace",
      slug: "forensic-lab",
      status: "ACTIVE",
      industry: ["Technology"], // Mark profile as complete
    }
  });
  console.log(`Created workspace: ${workspace.id}`);

  await prisma.workspaceMembership.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "OWNER",
      status: "ACTIVE",
    }
  });
  console.log(`Created membership for user ${user.id} in workspace ${workspace.id}`);
}

main().catch(console.error);
