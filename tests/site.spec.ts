import { expect, test } from "@playwright/test";

test("root redirects to the unit list", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/units$/);
  await expect(page.locator(".hub-bar__home")).toHaveText("Aigis Database");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
});

test("header navigation reaches every page", async ({ page }) => {
  await page.goto("/units");

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

test("old hash links move to the same path", async ({ page }) => {
  await page.goto("/#/units/101?tab=quotes");
  await expect(page).toHaveURL(/\/units\/101\?tab=quotes$/);
  await expect(page.locator(".detail h2, h2").first()).toContainText("#101");
});

test("pages set their own title and canonical", async ({ page }) => {
  await page.goto("/units/101");
  await expect(page).toHaveTitle("Shizuka – Platinum Samurai · Aigis Database");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://aigis.altterisk.cc/units/101");

  await page.getByRole("link", { name: "Stages", exact: true }).click();
  await expect(page).toHaveTitle("Stages · Aigis Database");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://aigis.altterisk.cc/stages");
});

test("unknown paths show not found and are noindex", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
