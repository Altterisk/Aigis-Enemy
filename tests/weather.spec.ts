import { expect, test } from "@playwright/test";

test("weather page lists every weather with its per-side effects", async ({ page }) => {
  await page.goto("/weather");
  await expect(page.getByRole("heading", { name: "Weather", exact: true })).toBeVisible();

  const rows = page.locator(".wx-table tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(20);

  // IceLightning hits enemies only: range 50% and movement speed 40%.
  const ice = page.locator(".wx-table tbody tr", { hasText: "IceLightning" });
  await expect(ice).toContainText("Range 50%");
  await expect(ice).toContainText("Movement speed 40%");
  await expect(ice.locator("td").nth(4)).toHaveText("—");
});

test("each weather shows its in-game banner", async ({ page }) => {
  await page.goto("/weather");
  const row = page.locator(".wx-table tbody tr", { hasText: "IceLightning" });
  const banner = row.locator(".wx-banner");
  // lazy-loaded: the image has no width until its row scrolls into view
  await row.scrollIntoViewIfNeeded();
  await expect(banner).toBeVisible();
  expect(await banner.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("no-op 100% rows never reach the table", async ({ page }) => {
  await page.goto("/weather");
  const mist = page.locator(".wx-table tbody tr", { hasText: "PoisonMist1" });
  await expect(mist.locator(".wx-chip")).toHaveCount(1);
  await expect(mist.locator(".wx-chip")).toContainText("Range 80%");
});

// HotWave has no WeatherConfig entry at all — the HP drain those stages apply
// is a stage modifier, not the weather.
test("a weather with no config entry shows nothing on either side", async ({ page }) => {
  await page.goto("/weather");
  const hot = page.locator(".wx-table tbody tr", { hasText: "HotWave1" });
  await expect(hot.locator("td").nth(3)).toHaveText("—");
  await expect(hot.locator("td").nth(4)).toHaveText("—");
});

test("the effect filter narrows the table", async ({ page }) => {
  await page.goto("/weather");
  await expect(page.locator(".wx-table tbody tr").first()).toBeVisible();
  const all = await page.locator(".wx-table tbody tr").count();
  await page.locator(".toolbar select").selectOption("3");
  const filtered = page.locator(".wx-table tbody tr");
  expect(await filtered.count()).toBeLessThan(all);
  await expect(filtered.first()).toContainText("LethargyMist");
});

test("the weather a skill generates links back to its unit", async ({ page }) => {
  await page.goto("/weather");
  await expect(page.getByRole("heading", { name: "Weather from a unit skill" })).toBeVisible();
  const link = page.locator(".wx-source-table a").first();
  await expect(link).toContainText("#2868");
  await link.click();
  await expect(page).toHaveURL(/\/units\/2868$/);
});

test("weathers show the game's help text, including help matched by icon and effects", async ({ page }) => {
  await page.goto("/weather");
  const blizzard = page.locator(".wx-table tr", { hasText: "BLIZZARD" }).first();
  await expect(blizzard.locator(".wx-help")).toContainText("悪天候：吹雪");
  await expect(blizzard.locator(".wx-help li").first()).toContainText("移動速度");
  const mist2 = page.locator(".wx-table tbody tr").filter({ has: page.locator(".wx-name b", { hasText: /^MIST2$/ }) });
  await expect(mist2.locator(".wx-help")).toContainText("悪天候：霧");
  await expect(mist2.locator(".wx-help")).toContainText("matched by icon and effects");
});
