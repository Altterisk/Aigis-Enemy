import { expect, test } from "@playwright/test";

test("unit list renders tiles with English names", async ({ page }) => {
  await page.goto("/#/units");
  const tiles = page.locator(".unit-grid .unit-tile");
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThan(10);
});

test("search filters the list and reaches the unit page", async ({ page }) => {
  await page.goto("/#/units");
  await page.getByPlaceholder("Search id / name / class").fill("Bernard");
  const tile = page.locator(".unit-grid .unit-tile", { hasText: "Bernard" }).first();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/#\/units\/\d+$/);
  await expect(page.locator(".unit-stat-table")).toBeVisible();
  await expect(page.getByText("Bernard").first()).toBeVisible();
});

test("unit detail loads directly by id", async ({ page }) => {
  await page.goto("/#/units/10");
  await expect(page.locator(".unit-stat-table")).toBeVisible();
  await expect(page.getByText("Bernard").first()).toBeVisible();
});

test("rarity URL filter narrows the list to Black units", async ({ page }) => {
  await page.goto("/#/units?rarity=Black");
  const attrs = page.locator(".unit-grid .unit-tile .enemy-tile-attr");
  await expect(attrs.first()).toBeVisible();
  for (let i = 0; i < Math.min(5, await attrs.count()); i += 1) {
    await expect(attrs.nth(i)).toContainText("Black");
  }
});

test("class filter narrows the list via the searchable select", async ({ page }) => {
  await page.goto("/#/units");
  await page.getByPlaceholder("all classes").fill("Soldier");
  const option = page
    .locator(".searchable-select-option:not(.searchable-select-all)", { hasText: "Soldier" })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
  await expect(page.locator(".unit-grid .unit-tile .enemy-tile-attr").first()).toContainText("Soldier");
});

test("pager switches to the next page of tiles", async ({ page }) => {
  await page.goto("/#/units");
  const firstName = await page.locator(".unit-tile-name").first().innerText();
  await page.locator(".pager button", { hasText: "next" }).first().click();
  await expect(page.locator(".unit-tile-name").first()).not.toHaveText(firstName);
  await expect(page.locator(".pager").first()).toContainText("page 2");
});
