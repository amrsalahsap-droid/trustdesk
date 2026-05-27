import { prisma } from "./src/lib/db/prisma";

async function main() {
  const qId = "cmobpr9px02it149gg9m870pg";
  const res: any = await prisma.$queryRaw`SELECT "workspaceId" FROM "Questionnaire" WHERE id = ${qId}`;
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
