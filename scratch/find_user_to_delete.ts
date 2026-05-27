
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'amrsalah.sap@gmail.com';
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: true,
      _count: {
        select: {
          uploadedSourceDocuments: true,
          triggeredParseJobs: true,
        }
      }
    }
  });

  if (!user) {
    console.log(`User with email ${email} not found.`);
    return;
  }

  console.log(`Found user: ${user.id} (${user.email})`);
  console.log(`Memberships: ${user.memberships.length}`);
  console.log(`Uploaded Documents: ${user._count.uploadedSourceDocuments}`);
  console.log(`Triggered Parse Jobs: ${user._count.triggeredParseJobs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
