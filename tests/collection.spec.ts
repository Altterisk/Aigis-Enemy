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
  const code = await page.locator(".collection-transfer .hub-backup__label .hub-backup__code").inputValue();
  expect(code).toMatch(/^AIGC3\./);

  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");

  await page.getByPlaceholder("Paste an AIGC1, AIGC2, or AIGC3 code").fill(code);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
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
  await page.getByPlaceholder("Paste an AIGC1, AIGC2, or AIGC3 code").fill("AIGC3.notarealcode");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".hub-backup__status--error")).toContainText(/damaged|invalid|incomplete/);
});

test("JSON backup file round-trips and rejects other files", async ({ page }) => {
  await page.goto("/#/collection");
  const tile = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group) .collection-tile-select").first();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");

  await page.locator(".collection-transfer summary", { hasText: "Copy / restore" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export file", exact: true }).click();
  const file = await (await downloading).path();

  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");

  const picker = page.locator(".hub-backup input[type=file]");
  await picker.setInputFiles(file);
  await expect(tile).toHaveAttribute("aria-pressed", "true");

  await picker.setInputFiles({ name: "other.json", mimeType: "application/json", buffer: Buffer.from('{"format":"something.else","version":1,"data":{}}') });
  await expect(page.locator(".hub-backup__status--error")).toBeVisible();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
});

test("a collection saved before store versioning still loads", async ({ page }) => {
  await page.goto("/#/collection");
  const group = page.locator(".collection-group:not(.collection-prince-group):not(.collection-support-group)").first();
  const href = await group.locator(".collection-tile-name").first().getAttribute("href");
  const id = Number(href?.match(/(\d+)$/)?.[1]);
  await page.evaluate((unitId) => {
    localStorage.setItem("aigis-ui-store", JSON.stringify({ state: { collectionOwned: [unitId] }, version: 0 }));
  }, id);
  await page.reload();
  await expect(group.locator(".collection-tile-select").first()).toHaveAttribute("aria-pressed", "true");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aigis-ui-store") || "{}"));
  expect(saved.version).toBe(1);
  expect(saved.state.collectionOwned).toEqual([id]);
});
