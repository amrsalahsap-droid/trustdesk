
import { uncheckedPrisma as prisma } from "../src/lib/db/prisma";

async function inspectData() {
  console.log("--- Data Integrity Inspection ---");
  
  const users = await prisma.user.count();
  const workspaces = await prisma.workspace.count();
  const memberships = await prisma.workspaceMembership.count();
  const topics = await prisma.knowledgeTopic.count();
  const answers = await prisma.answerLibraryItem.count();
  const versions = await prisma.answerLibraryItemVersion.count();
  
  console.log(`Users: ${users}`);
  console.log(`Workspaces: ${workspaces}`);
  console.log(`Memberships: ${memberships}`);
  console.log(`Canonical Topics: ${topics}`);
  console.log(`Answers: ${answers}`);
  console.log(`Answer Versions: ${versions}`);

  if (workspaces > 0) {
    const firstWorkspace = await prisma.workspace.findFirst();
    console.log(`First Workspace: ${JSON.stringify(firstWorkspace)}`);
  }

  if (users > 0) {
    const firstUser = await prisma.user.findFirst();
    console.log(`First User: ${JSON.stringify(firstUser)}`);
  }
}

inspectData();
