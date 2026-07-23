import { expect, test } from "@playwright/test";

test("collection grid renders with progress at zero", async ({ page }) => {
  await page.goto("/#/collection");
  await expect(page.locator(".collection-page h2").first()).toHaveText("Collection");
  await expect(page.locator(".collection-tile").first()).toBeVisible();
  await expect(page.locator(".collection-progress-row").first()).toContainText("0 /");
});

test("toggling a unit updates ownership and overall progress", async ({ page }) => {
  await page.goto("/#/collection");
  const tile = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group) .collection-tile-select").first();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".collection-progress-row").first()).toContainText("1 /");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".collection-progress-row").first()).toContainText("0 /");
});

test("restore code round-trips ownership", async ({ page }) => {
  await page.goto("/#/collection");
  const tile = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group) .collection-tile-select").first();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");

  await page.locator(".collection-transfer summary", { hasText: "Copy / restore" }).click();
  const code = await page.locator(".collection-transfer-grid textarea").first().inputValue();
  expect(code).toMatch(/^AIGC3\./);

  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");

  await page.locator(".collection-transfer-grid textarea").nth(1).fill(code);
  await page.getByRole("button", { name: "restore", exact: true }).click();
  await expect(page.locator(".collection-message")).toContainText("Restored 1 units");
  await expect(tile).toHaveAttribute("aria-pressed", "true");
});

test("select all / deselect all cover a whole section", async ({ page }) => {
  await page.goto("/#/collection");
  const group = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group)").first();
  const selectAll = group.getByRole("button", { name: "Select all", exact: true });
  const deselectAll = group.getByRole("button", { name: "Deselect all", exact: true });

  await selectAll.click();
  await expect(selectAll).toBeDisabled(); // everything shown is now selected
  await expect(group.locator(".collection-tile.owned").first()).toBeVisible();

  await deselectAll.click();
  await expect(deselectAll).toBeDisabled();
  await expect(page.locator(".collection-progress-row").first()).toContainText("0 /");
});

test("owned-only status filter hides unowned units", async ({ page }) => {
  await page.goto("/#/collection");
  const tile = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group) .collection-tile-select").first();
  await tile.click();
  await page.locator(".collection-tools select").nth(2).selectOption("owned");
  const tiles = page.locator(".collection-tile");
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBe(1);
});

test("a damaged restore code is rejected with a message", async ({ page }) => {
  await page.goto("/#/collection");
  await page.locator(".collection-transfer summary", { hasText: "Copy / restore" }).click();
  await page.locator(".collection-transfer-grid textarea").nth(1).fill("AIGC3.notarealcode");
  await page.getByRole("button", { name: "restore", exact: true }).click();
  await expect(page.locator(".collection-message")).toContainText(/damaged|invalid|incomplete/);
});
