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
  const tab = page.getByRole("tab", { name: /Dialogue/ });
  test.skip(await tab.count() === 0, "stage 1 has no dialogue in this export");
  await tab.click();
  await expect(page.locator(".dlg")).toBeVisible();
});

test("dialogue renders the supplied game portrait refs", async ({ page }) => {
  await page.goto("/#/stages/8983");
  await page.getByRole("tab", { name: /Dialogue/ }).click();

  for (const [speaker, unitId, icon] of [
    ["キュウビ", 465, "465.png"],
    ["ラタトスク", 1375, "1375_aw1.png"],
  ] as const) {
    const line = page.locator(".dlg-line", { has: page.locator(".dlg-name", { hasText: speaker }) }).first();
    await expect(line.locator(".dlg-face")).toHaveAttribute("src", new RegExp(`unit-icon/${icon}$`));
    await expect(line.locator(".dlg-face-link")).toHaveAttribute("href", `#/units/${unitId}`);
  }
});

test("stage list keeps search and category in the URL", async ({ page }) => {
  await page.goto("/#/stages?cat=all&q=1");
  await expect(page.locator(".hub-list-toolbar select")).toHaveValue("all");
  await expect(page.getByPlaceholder("Search stage / event / quest id")).toHaveValue("1");
  await page.locator(".stage-row li a").first().click();
  await expect(page).toHaveURL(/#\/stages\/\d+/);
  await page.goBack();
  await expect(page.locator(".hub-list-toolbar select")).toHaveValue("all");
});

test("stage list fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/#/stages?cat=all");
  await expect(page.locator(".stage-row li a").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("stage tabs live in the URL and breadcrumbs lead back", async ({ page }) => {
  await page.goto("/#/stages/8983?tab=dialogue");
  await expect(page.getByRole("tab", { name: /Dialogue/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".dlg")).toBeVisible();
  await page.getByRole("tab", { name: /Enemies/ }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await page.locator(".hub-crumbs a", { hasText: "Stages" }).click();
  await expect(page).toHaveURL(/#\/stages$/);
});

test("fixture / clone enemies carry a marker badge and are counted apart", async ({ page }) => {
  await page.goto("/#/stages/1021");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".badge.marker").first()).toBeVisible();
  await page.goto("/#/stages?cat=all&q=%E7%8E%8B%E9%83%BD%E9%99%A5%E8%90%BD%EF%BC%92");
  await expect(page.getByRole("link", { name: /王都陥落２/ }).first()).toContainText("+ 9 markers");
});

test("enemy effect details are written out instead of raw game keys", async ({ page }) => {
  await page.goto("/#/stages/10028");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".eff-cond", { hasText: /^ ?blocks / }).first()).toBeVisible();
  await expect(page.locator(".eff-cond", { hasText: "近接物理" })).toHaveCount(0);
});

test("parked enemies and flag-gated transforms name what happens", async ({ page }) => {
  await page.goto("/#/stages/45006");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "never moves" }).first()).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "stays put until stage flag 100 is set" })).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "when stage flag 50 is set → transform into form 2" }).first()).toBeVisible();
});

test("in-game color markup in stage names renders as colored text", async ({ page }) => {
  await page.goto("/#/stages/7540");
  const title = page.locator(".stage-header").getByText("第三陣 飛行部隊の増援").first();
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.locator(".stage-header")).not.toContainText("%c[");
});
