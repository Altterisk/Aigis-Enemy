import { expect, test } from "@playwright/test";

test("enemy list renders and filters by search", async ({ page }) => {
  await page.goto("/#/enemies");
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();
  await expect(page.locator(".hub-list-toolbar__count")).toContainText("enemies");

  const before = await page.locator(".hub-list-toolbar__count").innerText();
  await page.getByPlaceholder("Search id / type / tag").fill("ゴブリン");
  await expect(page.locator(".hub-list-toolbar__count")).not.toHaveText(before);
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();
});

test("enemy tile opens the enemy detail page", async ({ page }) => {
  await page.goto("/#/enemies");
  await page.locator(".enemy-grid .enemy-tile").first().click();
  await expect(page).toHaveURL(/#\/enemies\/\d+$/);
  await expect(page.getByRole("heading", { name: /Enemy #\d+/ })).toBeVisible();
});

test("enemy filters live in the URL and survive back/forward", async ({ page }) => {
  await page.goto("/#/enemies");
  await page.locator(".hub-list-toolbar select").first().selectOption("magical");
  await expect(page).toHaveURL(/dmg=magical/);
  await page.locator(".enemy-grid .enemy-tile").first().click();
  await expect(page).toHaveURL(/#\/enemies\/\d+$/);
  await page.goBack();
  await expect(page.locator(".hub-list-toolbar select").first()).toHaveValue("magical");
});

test("enemy list fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/#/enemies");
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
