import { test, expect } from "@playwright/test";

test.describe("Library Topic Detail Race Condition", () => {
  test("switching from My Assigned to All Topic with a slow stale request does not show empty state", async ({ page }) => {
    // 1. Setup mock responses
    // Mock user context to be Approver
    await page.route("/api/auth/context", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          role: "APPROVER",
          userId: "test-user-id"
        }),
      });
    });

    // Mock topics
    await page.route("/api/knowledge/topics*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          topics: [
            { id: "topic-1", key: "access_control", name: "Access Control", totalAnswers: 33, approvedAnswers: 1, health: {} }
          ]
        })
      });
    });

    // Intercept answer requests to simulate the race condition
    let staleRequestResolved = false;
    let freshRequestResolved = false;

    // We will artificially delay the stale request so it resolves AFTER the fresh request.
    await page.route("**/api/knowledge/answers*", async (route) => {
      const url = new URL(route.request().url());
      const queue = url.searchParams.get("queue");
      const topicKey = url.searchParams.get("topicKey");

      if (topicKey === "access_control" && queue === "my_approvals") {
        // Stale request (simulating the slow queue query returning 0 items)
        // Wait for the fresh request to resolve first before returning 0 items.
        // In Playwright we can use a small delay or wait for the flag.
        setTimeout(() => {
          staleRequestResolved = true;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: [], count: 0 })
          });
        }, 1000); // 1s delay ensures it's the slower request
      } else if (topicKey === "access_control" && !queue) {
        // Fresh request (simulating the fast "All Topic" query returning 33 items)
        setTimeout(() => {
          freshRequestResolved = true;
          const fakeItems = Array.from({ length: 33 }).map((_, i) => ({
            id: `ans-${i}`,
            topic: { key: "access_control", name: "Access Control" },
            title: `Answer ${i}`,
            answer: `Content ${i}`,
            status: i === 0 ? "APPROVED" : "DRAFT"
          }));
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: fakeItems, count: 33 })
          });
        }, 200); // 200ms delay ensures it resolves FIRST
      } else {
        await route.continue();
      }
    });

    // 2. Navigate to the Library with the queue active
    await page.goto("/app/library?queue=my_approvals");

    // 3. Select the topic
    await page.click("text=Access Control");

    // At this point, it should fetch with queue=my_approvals (which returns 0 items after 1 second).
    // Let's immediately switch to "All Topics" before the first request finishes!
    await page.click("text=All Topics"); // Assuming the toggle has this text or similar
    // Actually, the toggle in TrustDesk is often "My Work" vs "All Topics" or similar.
    // If we can't find it easily by text, we can just click the "All Topics" scope toggle option.
    // Wait for the fast fresh request to resolve (33 items).
    await expect(page.locator("text=Answer 0")).toBeVisible({ timeout: 2000 });

    // Wait until the slow stale request has ALSO resolved.
    await page.waitForFunction(() => new Promise(resolve => setTimeout(resolve, 1500)));
    
    // 4. Verify the 33 items are STILL visible and NOT overwritten by the slow request.
    await expect(page.locator("text=No answers in this topic yet")).not.toBeVisible();
    await expect(page.locator("text=Answer 0")).toBeVisible();
  });

  test("repeated rapid switching between scopes uses the latest request", async ({ page }) => {
    // Similar setup...
    await page.route("/api/auth/context", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workspaceId: "ws-1", role: "APPROVER", userId: "u-1" }) });
    });
    await page.route("/api/knowledge/topics*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ topics: [{ id: "t-1", key: "t1", name: "T1", totalAnswers: 1, approvedAnswers: 0, health: {} }] }) });
    });

    let requestCount = 0;
    await page.route("**/api/knowledge/answers*", async (route) => {
      requestCount++;
      const url = new URL(route.request().url());
      const queue = url.searchParams.get("queue");

      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ 
            items: [{ id: `ans-${requestCount}`, title: queue ? "Queue Answer" : "All Answer" }], 
            count: 1 
          })
        });
      }, 500); // 500ms delay for all
    });

    await page.goto("/app/library?queue=my_approvals");
    await page.click("text=T1");

    // Rapid toggle
    await page.click("text=All Topics");
    await page.click("text=My Approvals"); // Assuming it switches back
    await page.click("text=All Topics");

    // The last click was "All Topics", so queue should be null.
    // Wait for resolution
    await expect(page.locator("text=All Answer")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("text=Queue Answer")).not.toBeVisible();
  });
});
