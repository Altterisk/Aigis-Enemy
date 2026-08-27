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
  [2858, "FM/DHMZ Shark"],
  [2859, "Chibi Iyo"],
  [2860, "Chibi Satin"],
  [2862, "Martan (Yukata)"],
  [2863, "Lich (Yukata)"],
  [2864, "Eterna (Yukata)"],
  [2867, "Chibi Ricardo"],
  [1646, "Hlidskjalf"],
  [2781, "Chibi Tsukiko"],
  [1724, "Allegro"],
  [2868, "Kerudra (Black)"],
  [2869, "Kerudra (Platinum)"],
  [2870, "Karviya"],
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

test("a one-copy-only unit shows its formation restriction", async ({ page }) => {
  await page.goto("/#/units/2874");
  await expect(page.getByRole("heading", { name: "Formation restriction" })).toBeVisible();
  await expect(page.getByText("Only one may be in a team.")).toBeVisible();
});

test("a mutually exclusive pair links the other card", async ({ page }) => {
  await page.goto("/#/units/1620");
  await expect(page.getByText("Cannot be in the same team as")).toBeVisible();
  await expect(page.getByRole("link", { name: "Lukifer (Platinum)" })).toBeVisible();
});

test("an unrestricted unit has no formation-restriction section", async ({ page }) => {
  await page.goto("/#/units/2873");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formation restriction" })).toHaveCount(0);
});
