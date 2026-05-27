import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ws = await prisma.workspace.findUnique({
    where: { id: 'cmodd652c000n14xola9qixue' }
  });
  console.log(JSON.stringify(ws, null, 2));
}
main().catch(console.error);
