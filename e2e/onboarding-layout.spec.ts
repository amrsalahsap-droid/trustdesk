import { test, expect } from "@playwright/test";

test.describe("Onboarding Layout Regression Tests", () => {
  test("should show marketing rail on initial steps and hide it on review", async ({ page }) => {
    // 1. Initial step (DETAILS)
    await page.goto("/onboarding");
    
    // Fill first step - Marketing rail SHOULD be visible
    await expect(page.locator('aside:has-text("Trust Intelligence")')).toBeVisible();
    await expect(page.locator('text=Create your workspace')).toBeVisible();

    // 2. Fill details and move to next step
    await page.fill('input[name="workspaceName"]', "Layout Test Corp");
    await page.fill('input[name="website"]', "https://layout-test.com");
    await page.click('button:has-text("Next")');

    // 3. Analyzing state (simulated by not having the response yet)
    // Sidebar SHOULD still be visible during analysis
    await expect(page.locator('aside:has-text("Trust Intelligence")')).toBeVisible();
    await expect(page.locator('text=Analyzing Intelligence')).toBeVisible();

    // 4. Intercept the intelligence API to provide deterministic foundation data
    await page.route("**/api/onboarding/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          profile: { companyName: "Layout Test Corp", website: "layout-test.com" },
          signals: { businessDomain: { value: "Tech" } },
          orchestration: {
            summary: {
              foundation: {
                securityPillarsIdentifiedCount: 5,
                totalRelevantTopicsCount: 5,
                generatedTopicKeys: ["t1"],
                sourceRiskAreaKeys: ["r1"]
              }
            }
          }
        })
      });
    });

    // 5. Wait for the transition to REVIEW step
    await page.waitForSelector('text=Readiness Summary', { timeout: 15000 });

    // 6. Marketing rail SHOULD NOT be visible on Review screen
    // We check that the aside is either gone or hidden
    await expect(page.locator('aside:has-text("Trust Intelligence")')).not.toBeVisible();
    
    // 7. Verify full-width container class if possible
    const mainContent = page.locator('main');
    await expect(mainContent).toHaveClass(/w-full/);

    // 8. Go back to details and check if rail reappears
    await page.click('button:has-text("Back")');
    await expect(page.locator('aside:has-text("Trust Intelligence")')).toBeVisible();
  });
});
