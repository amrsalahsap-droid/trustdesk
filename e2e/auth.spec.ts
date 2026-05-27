import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.describe("Authentication & Invitation Flow", () => {
  let workspaceId: string;
  let adminUserId: string;

  test.beforeAll(async () => {
    // 1. Setup a test workspace and admin user
    const admin = await prisma.user.create({
      data: {
        email: `admin-e2e-${Math.random().toString(36).substring(7)}@test.com`,
        name: "E2E Admin",
        passwordHash: "$2b$12$fakehashfakehashfakehashfakehashfakehashfakehash", // Dummy bcrypt hash
      },
    });
    adminUserId = admin.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "E2E Test Workspace",
        slug: `e2e-ws-${Math.random().toString(36).substring(7)}`,
      },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMembership.create({
      data: {
        userId: adminUserId,
        workspaceId,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId } });
    await prisma.workspaceInvitation.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { email: { contains: "test.com" } } });
    await prisma.$disconnect();
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should allow a new user to sign up via invitation link", async ({ page }) => {
    const newUserEmail = `new-user-${Math.random().toString(36).substring(7)}@test.com`;
    
    // 1. Generate invitation (using the real service logic by direct DB manipulation for speed in E2E)
    const invitation = await prisma.workspaceInvitation.create({
      data: {
        email: newUserEmail,
        workspaceId,
        role: "OPERATOR",
        token: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    // 2. Navigate to invite link
    await page.goto(`/auth/invite/${invitation.token}`);
    
    // 3. Verify invite page content
    await expect(page.locator("h1")).toContainText(/Join/i);
    await expect(page.locator("body")).toContainText("E2E Test Workspace");

    // 4. Fill in signup form
    await page.fill('input[name="name"]', "Test User");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');

    // 5. Verify redirect to app onboarding or dashboard
    // Depending on the app logic, it might go to /onboarding or /app
    await expect(page).toHaveURL(/\/app|\/onboarding/);
    
    // 6. Verify membership in DB
    const membership = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, user: { email: newUserEmail } }
    });
    expect(membership?.status).toBe("ACTIVE");
  });
});
