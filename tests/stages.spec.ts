import { expect, test } from "@playwright/test";

test("stage index lists events with stage links", async ({ page }) => {
  await page.goto("/#/stages");
  const links = page.locator(".stage-row li a");
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThan(10);
});

test("stage detail loads from the index", async ({ page }) => {
  await page.goto("/#/stages/1");
  await expect(page.getByText("魔女の襲撃").first()).toBeVisible();
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
});

test("stage dialogue tab shows in-stage scenes when present", async ({ page }) => {
  await page.goto("/#/stages/1");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  const tab = page.locator(".stage-tabs button", { hasText: "Dialogue" });
  test.skip(await tab.count() === 0, "stage 1 has no dialogue in this export");
  await tab.click();
  await expect(page.locator(".dlg")).toBeVisible();
});
