import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id, status: "ACTIVE", workspace: { status: "ACTIVE" } },
    select: {
      workspace: {
        select: {
          id: true,
          name: true,
          isDemo: true,
        }
      }
    }
  });

  const workspaces = memberships.map(m => m.workspace);

  return NextResponse.json({ 
    user,
    workspaces
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  if (!name) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Name is required" } },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    select: { id: true, email: true, name: true },
    data: { name },
  });

  return NextResponse.json({ user: updated });
}
