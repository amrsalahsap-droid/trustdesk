import { prisma } from "../src/lib/db/prisma";
import { DemoSeedingService } from "../src/modules/workspaces/onboarding/demo-seeding-service";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scratch/run-demo-seeding.ts <user-email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User ${email} not found`);
    process.exit(1);
  }

  console.log(`Seeding demo workspace for user: ${user.email} (${user.id})`);
  const workspace = await DemoSeedingService.createDemoWorkspace(user.id);
  console.log(`Successfully created demo workspace: ${workspace.name} (${workspace.id})`);
  
  const questionnaire = await prisma.questionnaire.findFirst({
    where: { workspaceId: workspace.id },
    include: { items: true }
  });
  
  if (questionnaire) {
    console.log(`Questionnaire items for ${questionnaire.title}:`);
    questionnaire.items.forEach(item => {
      console.log(`- [${item.reviewStatus}] ${item.question}`);
      console.log(`  Suggestion: ${item.suggestedAnswer?.slice(0, 50)}...`);
      console.log(`  Selection: ${item.finalAnswerSelection}`);
      console.log(`  Verification: ${item.verificationStatus}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
