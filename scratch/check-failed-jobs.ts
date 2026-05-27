
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const failedJobs = await prisma.sourceDocumentParseJob.findMany({
    where: { status: 'FAILED' },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      failureCode: true,
      startedAt: true,
      finishedAt: true,
      lastHeartbeatAt: true,
      retryCount: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log(JSON.stringify(failedJobs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
