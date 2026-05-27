
import { test, expect } from "@playwright/test";

test.describe("Onboarding Intelligence Regression Tests", () => {
  test("should display consistent metrics across all UI sections (Hero, Summary, Explorer, Footer)", async ({ page }) => {
    // 1. Intercept the intelligence API to provide deterministic foundation data
    await page.route("**/api/onboarding/analyze", async (route) => {
      // Small delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          profile: {
            companyName: "Consistency Corp",
            website: "consistency.com"
          },
          signals: {
            businessDomain: { value: "Cloud Infrastructure" },
            productType: { value: "B2B SaaS" }
          },
          orchestration: {
            summary: {
              foundation: {
                securityPillarsIdentifiedCount: 7,
                autoReadyTopicsCount: 3,
                reviewSuggestedTopicsCount: 2,
                needsEvidenceTopicsCount: 2,
                totalRelevantTopicsCount: 7,
                evidenceNeedsCount: 5,
                clarificationTasksCount: 4,
                citationsCount: 15,
                sourcePagesCount: 12,
                generatedTopicKeys: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
                sourceRiskAreaKeys: ["r1", "r2", "r3"]
              }
            }
          }
        })
      });
    });

    // 2. Start onboarding
    await page.goto("/onboarding");
    
    // Fill first step
    await page.fill('input[name="workspaceName"]', "Consistency Corp");
    await page.fill('input[name="website"]', "https://consistency.com");
    await page.click('button:has-text("Next")');

    // 3. Wait for analysis (simulated via route fulfillment)
    // The UI should transition to the REVIEW step
    await page.waitForSelector('text=Readiness Summary', { timeout: 15000 });

    // 4. Verify Hero metrics (Consistency Check)
    const hero = page.locator('div:has-text("Consistency Corp")').first();
    await expect(hero).toContainText('7 Pillars');
    await expect(hero).toContainText('3 Ready');
    await expect(hero).toContainText('4 Tasks');

    // 5. Verify Foundation Summary metrics
    const summary = page.locator('#workspace-foundation-card');
    // Using exact text matches for the stat values to ensure they are rendered correctly
    await expect(summary.locator('text=7').first()).toBeVisible(); // Pillars
    await expect(summary.locator('text=3').first()).toBeVisible(); // Ready
    await expect(summary.locator('text=4').last()).toBeVisible();  // Tasks (Clarification Tasks)

    // 6. Verify Explorer Teasers (Consistency Check)
    // We expect 3 Risk Evidence (from sourceRiskAreaKeys.length)
    // We expect 7 Trust Topics (from totalRelevantTopicsCount)
    // We expect 12 Source Pages (from sourcePagesCount)
    await expect(page.locator('div:has-text("Risk Evidence") >> text=3').first()).toBeVisible();
    await expect(page.locator('div:has-text("Trust Topics") >> text=7').first()).toBeVisible();
    await expect(page.locator('div:has-text("Source Pages") >> text=12').first()).toBeVisible();

    // 7. Verify Sticky Footer (ReviewActionBar)
    // Should show "7 Identified", "3 Verified", "4 Review", "15 Citations"
    const footer = page.locator('div:has-text("Workspace Status")').locator('..').locator('..').locator('..');
    await expect(footer).toContainText('7 Identified');
    await expect(footer).toContainText('3 Verified');
    await expect(footer).toContainText('4 Review');
    await expect(footer).toContainText('15 Citations');
  });

  test("should show mapping gap warning when risks exist but foundation is empty", async ({ page }) => {
    // Intercept with empty foundation but non-empty risk areas
    await page.route("**/api/onboarding/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          profile: {
            companyName: "Empty Foundation Corp",
            securityAndTrustModel: {
              procurementRiskAreas: [{ key: "risk1", label: "Risk 1", reason: "...", severity: "HIGH" }]
            }
          },
          orchestration: {
            summary: {
              foundation: {
                securityPillarsIdentifiedCount: 0,
                totalRelevantTopicsCount: 0,
                generatedTopicKeys: [],
                sourceRiskAreaKeys: ["risk1"],
                warnings: ["Risk areas detected but no trust topics generated."]
              }
            }
          }
        })
      });
    });

    await page.goto("/onboarding");
    await page.fill('input[name="workspaceName"]', "Empty Corp");
    await page.fill('input[name="website"]', "https://empty.com");
    await page.click('button:has-text("Next")');

    await page.waitForSelector('text=Readiness Summary');
    
    // Verify mapping gap warning is visible
    await expect(page.locator('text=Risk areas detected but no trust topics generated')).toBeVisible();
  });
});
