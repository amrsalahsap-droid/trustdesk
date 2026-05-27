import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac } from "crypto";

const prisma = new PrismaClient();
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";

function createSessionToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

test.describe("Workspace Transition & Persistence", () => {
  let userId: string;
  let demoWorkspaceId: string;
  let realWorkspaceId: string;

  test.beforeAll(async () => {
    // 1. Setup User
    const email = `test-transition-${Math.random().toString(36).substring(7)}@test.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Transition User",
        passwordHash: "fake",
      },
    });
    userId = user.id;

    // 2. Setup Demo Workspace (via DemoSeedingService equivalent)
    const demoWs = await prisma.workspace.create({
      data: {
        name: "Acme Cloud Security Demo",
        slug: `demo-${Math.random().toString(36).substring(7)}`,
        isDemo: true,
      },
    });
    demoWorkspaceId = demoWs.id;

    await prisma.workspaceMembership.create({
      data: {
        userId,
        workspaceId: demoWorkspaceId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    // Seed one questionnaire in demo
    await prisma.questionnaire.create({
      data: {
        workspaceId: demoWorkspaceId,
        title: "Demo Questionnaire",
        createdById: userId,
        items: {
          create: [
            {
              question: "Demo Question?",
              sortOrder: 0,
              importedAnswer: "Demo Answer",
            }
          ]
        }
      }
    });
  });

  test.afterAll(async () => {
    // Cleanup
    await prisma.workspaceMembership.deleteMany({ where: { userId } });
    await prisma.questionnaireItem.deleteMany({ where: { workspaceId: { in: [demoWorkspaceId, realWorkspaceId || ""] } } });
    await prisma.questionnaire.deleteMany({ where: { workspaceId: { in: [demoWorkspaceId, realWorkspaceId || ""] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [demoWorkspaceId, realWorkspaceId || ""] } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("should handle the demo-to-real transition flow", async ({ page, context }) => {
    // 1. Login via cookie
    const token = createSessionToken(userId);
    await context.addCookies([
      { name: "td_session", value: token, domain: "localhost", path: "/", httpOnly: true },
      { name: "td_active_uid", value: userId, domain: "localhost", path: "/" }
    ]);

    // 2. Start at dashboard (should land in Demo since it's the only one)
    await page.goto("/app");
    await expect(page.locator("body")).toContainText("Acme Cloud Security Demo");
    await expect(page.locator("body")).toContainText("Demo Environment");

    // 3. Create a real workspace
    await page.goto("/onboarding");
    await page.fill('input[name="workspaceName"]', "Real Workspace Inc");
    await page.fill('input[name="website"]', "https://real-inc.com");
    await page.click('button:has-text("Next")');
    
    // Step 2 of onboarding (Profile)
    await page.waitForURL(/\/onboarding/);
    await page.click('button:has-text("Complete Setup")');

    // 4. Verify landing in real workspace
    await page.waitForURL(/\/app/);
    await expect(page.locator("body")).toContainText("Real Workspace Inc");
    await expect(page.locator("body")).not.toContainText("Demo Environment");

    // Save real workspace ID for cleanup
    const realWs = await prisma.workspace.findFirst({ where: { name: "Real Workspace Inc" } });
    realWorkspaceId = realWs!.id;

    // 5. Verify real workspace is empty
    await page.click('a:has-text("Questionnaires")');
    await expect(page.locator("body")).not.toContainText("Demo Questionnaire");
    await expect(page.locator("body")).toContainText("No questionnaires found");

    // 6. Use Workspace Switcher to go back to Demo
    await page.click('button:has-text("Real Workspace Inc")');
    await page.click('button:has-text("Acme Cloud Security Demo")');
    
    await page.waitForURL(/\/app/);
    await expect(page.locator("body")).toContainText("Acme Cloud Security Demo");
    await expect(page.locator("body")).toContainText("Demo Environment");

    // 7. Verify demo data is still there
    await page.click('a:has-text("Questionnaires")');
    await expect(page.locator("body")).toContainText("Demo Questionnaire");

    // 8. Persistence Check: Logout and login
    await page.click('button[aria-label="User menu"]');
    await page.click('button:has-text("Log out")');
    await page.waitForURL(/\/login/);

    // Login again (simulate session restoration)
    await context.addCookies([
      { name: "td_session", value: token, domain: "localhost", path: "/", httpOnly: true },
      { name: "td_active_uid", value: userId, domain: "localhost", path: "/" }
    ]);
    
    // Should land in Demo (since it was the last active)
    await page.goto("/app");
    await expect(page.locator("body")).toContainText("Acme Cloud Security Demo");

    // Switch to Real again to set it as last active
    await page.click('button:has-text("Acme Cloud Security Demo")');
    await page.click('button:has-text("Real Workspace Inc")');
    await page.waitForURL(/\/app/);

    // 9. Cookie Clearance Fallback
    // Clear the x-workspace-id cookie but keep the session
    await context.addCookies([{ name: "x-workspace-id", value: "", domain: "localhost", path: "/", expires: 0 }]);
    
    // Refresh page - should still land in Real Workspace Inc due to User.lastActiveWorkspaceId
    await page.reload();
    await expect(page.locator("body")).toContainText("Real Workspace Inc");
  });
});
