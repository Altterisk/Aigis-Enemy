import { expect, test } from "@playwright/test";

test("root redirects to the unit list", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/units$/);
  await expect(page.locator("h1")).toHaveText("Aigis Database");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
});

test("header navigation reaches every page", async ({ page }) => {
  await page.goto("/#/units");

  await page.getByRole("link", { name: "Collection", exact: true }).click();
  await expect(page.locator(".collection-page h2").first()).toHaveText("Collection");

  await page.getByRole("link", { name: "Enemies", exact: true }).click();
  await expect(page.locator(".enemy-grid .enemy-tile").first()).toBeVisible();

  await page.getByRole("link", { name: "Stages", exact: true }).click();
  await expect(page.locator(".stage-row li").first()).toBeVisible();

  await page.getByRole("link", { name: "Buffs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Buff ranking" })).toBeVisible();

  await page.getByRole("link", { name: "Cost Gen", exact: true }).click();
  await expect(page.getByPlaceholder("add unit (name / id)…")).toBeVisible();

  await page.getByRole("link", { name: "Units", exact: true }).click();
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
});
