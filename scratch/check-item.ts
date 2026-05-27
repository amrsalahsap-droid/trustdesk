import { uncheckedPrisma } from "../src/lib/db/prisma";

async function main() {
  const itemId = "cmop4dtbv0038143s8r0qe3ut";
  const item = await uncheckedPrisma.questionnaireItem.findUnique({
    where: { id: itemId },
    include: {
      questionnaire: true,
    }
  });
  console.log(JSON.stringify(item, null, 2));
}

main().catch(console.error).finally(() => uncheckedPrisma.$disconnect());
