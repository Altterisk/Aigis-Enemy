import { expect, test } from "@playwright/test";

test("unit list renders tiles with English names", async ({ page }) => {
  await page.goto("/units");
  const tiles = page.locator(".unit-grid .unit-tile");
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThan(10);
});

test("search filters the list and reaches the unit page", async ({ page }) => {
  await page.goto("/units");
  await page.getByPlaceholder("Search id / name / class").fill("Bernard");
  const tile = page.locator(".unit-grid .unit-tile", { hasText: "Bernard" }).first();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/units\/\d+$/);
  await expect(page.locator(".unit-stat-table")).toBeVisible();
  await expect(page.getByText("Bernard").first()).toBeVisible();
});

test("unit detail loads directly by id", async ({ page }) => {
  await page.goto("/units/10");
  await expect(page.locator(".unit-stat-table")).toBeVisible();
  await expect(page.getByText("Bernard").first()).toBeVisible();
});

test("rarity URL filter narrows the list to Black units", async ({ page }) => {
  await page.goto("/units?rarity=Black");
  const attrs = page.locator(".unit-grid .unit-tile .enemy-tile-attr");
  await expect(attrs.first()).toBeVisible();
  for (let i = 0; i < Math.min(5, await attrs.count()); i += 1) {
    await expect(attrs.nth(i)).toContainText("Black");
  }
});

test("class filter narrows the list via the searchable select", async ({ page }) => {
  await page.goto("/units");
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
  await page.goto("/units");
  const firstName = await page.locator(".unit-tile-name").first().innerText();
  await page.locator(".hub-pager button", { hasText: "Next" }).first().click();
  await expect(page.locator(".unit-tile-name").first()).not.toHaveText(firstName);
  await expect(page.locator(".hub-pager").first()).toContainText("Page 2");
  await expect(page).toHaveURL(/[?&]page=1(&|$)/);
});

test("old 0-based ?page= links open the same page", async ({ page }) => {
  await page.goto("/units?page=2&rarity=Black");
  await expect(page.locator(".hub-pager").first()).toContainText("Page 3");
  await expect(page.locator(".unit-grid .unit-tile .enemy-tile-attr").first()).toContainText("Black");
});

test("back/forward restores unit filters", async ({ page }) => {
  await page.goto("/units?rarity=Black&q=a");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
  await page.locator(".unit-grid .unit-tile").first().click();
  await expect(page).toHaveURL(/\/units\/\d+$/);
  await page.goBack();
  await expect(page).toHaveURL(/rarity=Black/);
  await expect(page.getByPlaceholder("Search id / name / class")).toHaveValue("a");
});

test("filter panel toggles and the list fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/units");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
  const toggle = page.locator(".hub-filter-panel__toggle");
  const wasOpen = (await toggle.getAttribute("aria-expanded")) === "true";
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(!wasOpen));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
