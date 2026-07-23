import { expect, test } from "@playwright/test";

test("enemy list renders and filters by search", async ({ page }) => {
  await page.goto("/#/enemies");
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();
  await expect(page.locator(".count")).toContainText("enemies");

  const before = await page.locator(".count").innerText();
  await page.getByPlaceholder("Search id / type / tag").fill("ゴブリン");
  await expect(page.locator(".count")).not.toHaveText(before);
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();
});

test("enemy tile opens the enemy detail page", async ({ page }) => {
  await page.goto("/#/enemies");
  await page.locator(".enemy-grid .enemy-tile").first().click();
  await expect(page).toHaveURL(/#\/enemies\/\d+$/);
  await expect(page.getByRole("heading", { name: /Enemy #\d+/ })).toBeVisible();
});
