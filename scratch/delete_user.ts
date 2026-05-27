
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'amrsalah.sap@gmail.com';
  
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.log(`User with email ${email} not found.`);
    return;
  }

  console.log(`Deleting user: ${user.id} (${user.email})...`);

  // Delete the user. Cascades will handle memberships and invitations.
  // Others are SetNull.
  const deletedUser = await prisma.user.delete({
    where: { id: user.id }
  });

  console.log(`Successfully deleted user ${deletedUser.email} (ID: ${deletedUser.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
