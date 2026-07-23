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

test("dialogue renders the supplied game portrait refs", async ({ page }) => {
  await page.goto("/#/stages/8983");
  await page.locator(".stage-tabs button", { hasText: "Dialogue" }).click();

  for (const [speaker, unitId, icon] of [
    ["キュウビ", 465, "465.png"],
    ["ラタトスク", 1375, "1375_aw1.png"],
  ] as const) {
    const line = page.locator(".dlg-line", { has: page.locator(".dlg-name", { hasText: speaker }) }).first();
    await expect(line.locator(".dlg-face")).toHaveAttribute("src", new RegExp(`unit-icon/${icon}$`));
    await expect(line.locator(".dlg-face-link")).toHaveAttribute("href", `#/units/${unitId}`);
  }
});
