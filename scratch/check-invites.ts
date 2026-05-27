import { prisma } from "../src/lib/db/prisma";

async function checkInvitations() {
  const invitations = await prisma.workspaceInvitation.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      workspace: { select: { name: true } },
      invitedBy: { select: { email: true } },
    }
  });

  console.log("Last 5 invitations:");
  invitations.forEach(inv => {
    console.log({
      id: inv.id,
      email: inv.email,
      workspace: inv.workspace.name,
      invitedBy: inv.invitedBy.email,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    });
  });
}

checkInvitations().catch(console.error);
