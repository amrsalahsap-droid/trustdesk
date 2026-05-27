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

test.describe("Questionnaire Answer Integrity (Day 2 Hardening)", () => {
  test.setTimeout(60000);
  let userId: string;
  let workspaceId: string;
  let questionnaireId: string;

  test.beforeAll(async () => {
    const email = `integrity-user-${Math.random().toString(36).substring(7)}@test.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Integrity User",
        passwordHash: "fake",
      },
    });
    userId = user.id;

    const ws = await prisma.workspace.create({
      data: {
        name: "Integrity Corp",
        slug: `integrity-${Math.random().toString(36).substring(7)}`,
        industry: ["Technology"],
      },
    });
    workspaceId = ws.id;

    await prisma.workspaceMembership.create({
      data: {
        userId,
        workspaceId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const q = await prisma.questionnaire.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        title: "Integrity Test",
        createdBy: { connect: { id: userId } },
      }
    });
    questionnaireId = q.id;
  });

  test.afterAll(async () => {
    await prisma.workspaceMembership.deleteMany({ where: { userId } });
    await prisma.questionnaireItem.deleteMany({ where: { workspaceId } });
    await prisma.questionnaire.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context }) => {
    const token = createSessionToken(userId);
    await context.addCookies([
      { name: "td_session", value: token, domain: "localhost", path: "/", httpOnly: true },
      { name: "td_active_uid", value: userId, domain: "localhost", path: "/" },
      { name: "x-workspace-id", value: workspaceId, domain: "localhost", path: "/" }
    ]);
  });

  test("should protect finalAnswer selections during re-matching", async ({ page, context }) => {
    // 1. Setup Questionnaire Item
    const item = await prisma.questionnaireItem.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        questionnaire: { connect: { id: questionnaireId } },
        question: "Encryption standard?",
        sortOrder: 0,
        importedAnswer: "AES-128",
        importedAnswerSource: "raw_import",
        suggestedAnswer: "AES-256 (AI Initial)",
        rowNumber: 1,
        confidence: "low",
      }
    });
    const itemId = item.id;

    await page.goto(`/app/questionnaires/${questionnaireId}/review`);
    
    // Open the drawer
    await page.click('text=Encryption standard?');
    await expect(page.locator('[aria-label="Answer source picker"]')).toBeVisible();

    // --- CASE 1: Accept Imported ---
    await expect(page.locator('text=Final answer: not selected yet')).toBeVisible();
    const updatePromise1 = page.waitForResponse(res => res.url().includes(`/api/questionnaires/${questionnaireId}/items/${itemId}`) && res.request().method() === 'PATCH');
    await page.getByLabel('Use imported answer').click();
    await updatePromise1;
    
    // Verify DB state directly
    const dbItem1 = await prisma.questionnaireItem.findUnique({ where: { id: itemId } });
    expect(dbItem1?.finalAnswerSelection).toBe("imported");
    expect(dbItem1?.reviewed).toBe(true);
    
    // Reload to ensure UI is in sync with DB
    await page.reload();
    await page.click('text=Encryption standard?');

    // Trigger re-match via API (simulating a style change that triggers re-match)
    await page.request.post(`/api/questionnaires/${questionnaireId}/regenerate`, {
      data: { tone: "professional" },
      headers: { "x-workspace-id": workspaceId }
    });
    
    // Verify DB after re-match: finalAnswer must NOT have changed
    const dbItem1b = await prisma.questionnaireItem.findUnique({ where: { id: itemId } });
    expect(dbItem1b?.finalAnswer).toBe("AES-128");
    expect(dbItem1b?.finalAnswerSelection).toBe("imported");
    
    await page.reload();
    await page.click('text=Encryption standard?');

    // --- CASE 2: Accept Suggested ---
    const updatePromise2 = page.waitForResponse(res => res.url().includes(`/api/questionnaires/${questionnaireId}/items/${itemId}`) && res.request().method() === 'PATCH');
    await page.getByLabel('Use AI suggestion').click();
    await updatePromise2;
    
    const dbItem2 = await prisma.questionnaireItem.findUnique({ where: { id: itemId } });
    expect(dbItem2?.finalAnswerSelection).toBe("suggested");
    const acceptedSuggested = dbItem2?.finalAnswer;
    expect(acceptedSuggested).toBeTruthy();
    
    await page.reload();
    await page.click('text=Encryption standard?');
    
    // Trigger re-match again
    await page.request.post(`/api/questionnaires/${questionnaireId}/regenerate`, {
      data: { tone: "concise" },
      headers: { "x-workspace-id": workspaceId }
    });
    
    const dbItem2b = await prisma.questionnaireItem.findUnique({ where: { id: itemId } });
    // Trust Rule: Accepting a suggestion accepts that SPECIFIC version. Re-match updates suggestedAnswer but NOT finalAnswer.
    expect(dbItem2b?.finalAnswer).toBe(acceptedSuggested);
    expect(dbItem2b?.finalAnswerSelection).toBe("suggested");
  });

  test("PATCH route should infer selection correctly", async ({ page }) => {
    // 1. Create a fresh item
    const item = await prisma.questionnaireItem.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        questionnaire: { connect: { id: questionnaireId } },
        question: "Inference Question",
        sortOrder: 1,
        importedAnswer: "Original Import",
        suggestedAnswer: "Original Suggestion",
        rowNumber: 2,
      }
    });

    // 2. PATCH matching imported text but no selection
    const res1 = await page.request.patch(`/api/questionnaires/${questionnaireId}/items/${item.id}`, {
      data: { finalAnswer: "Original Import" },
      headers: { "x-workspace-id": workspaceId }
    });
    const data1 = await res1.json();
    if (!res1.ok()) console.error('PATCH 1 failed:', data1);
    expect(data1.item.finalAnswerSelection).toBe("imported");

    // 3. PATCH matching suggested text but no selection
    const res2 = await page.request.patch(`/api/questionnaires/${questionnaireId}/items/${item.id}`, {
      data: { finalAnswer: "Original Suggestion" },
      headers: { "x-workspace-id": workspaceId }
    });
    const data2 = await res2.json();
    if (!res2.ok()) console.error('PATCH 2 failed:', data2);
    expect(data2.item.finalAnswerSelection).toBe("suggested");

    // 4. PATCH matching neither
    const res3 = await page.request.patch(`/api/questionnaires/${questionnaireId}/items/${item.id}`, {
      data: { finalAnswer: "Completely New Text" },
      headers: { "x-workspace-id": workspaceId }
    });
    const data3 = await res3.json();
    if (!res3.ok()) console.error('PATCH 3 failed:', data3);
    expect(data3.item.finalAnswerSelection).toBe("edited");

    // 5. PATCH inconsistent selection should fail
    const res4 = await page.request.patch(`/api/questionnaires/${questionnaireId}/items/${item.id}`, {
      data: { finalAnswer: "New Text", finalAnswerSelection: "imported" },
      headers: { "x-workspace-id": workspaceId }
    });
    expect(res4.status()).toBe(422);
  });
});
