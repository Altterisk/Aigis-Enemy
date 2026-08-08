import { expect, test } from "@playwright/test";

test("unit header shows the EN name with the JP original underneath", async ({ page }) => {
  await page.goto("/#/units/10");
  const heading = page.locator("h2").first();
  await expect(heading).toContainText("#10");
  await expect(heading).toContainText("Bernard");
  await expect(heading.locator(".muted")).not.toBeEmpty();
});

test("unit detail renders stats and gallery sections", async ({ page }) => {
  await page.goto("/#/units/10");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
  await expect(page.locator(".unit-stat-table tbody tr").first()).toBeVisible();
});

test("Eterna SAW exposes its forced healing-priority rule", async ({ page }) => {
  await page.goto("/#/units/2864");
  const rule = page.locator(".selection-rule--forced_priority").first();
  await expect(rule).toContainText("forced priority");
  await expect(rule).toContainText("group mode 23");
});

// regression for the hand-translated names that had no wiki page
const HAND_NAMED: [number, string][] = [
  [2850, "Xuhua (Swimsuit)"],
  [1646, "Hlidskjalf"],
  [2781, "Chibi Tsukiko"],
  [1724, "Allegro"],
];
for (const [id, name] of HAND_NAMED) {
  test(`hand-translated name #${id} = ${name}`, async ({ page }) => {
    await page.goto(`/#/units/${id}`);
    await expect(page.locator("h2").first()).toContainText(name);
  });
}

test("prince page lists his titles", async ({ page }) => {
  await page.goto("/#/units/1");
  await expect(page.locator(".prince-titles summary")).toContainText("Prince titles");
});
