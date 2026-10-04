import { expect, test } from "@playwright/test";

async function pickUnit(page: import("@playwright/test").Page, id: number) {
  await page.goto("/#/dps");
  await page.getByPlaceholder("pick unit (name / id)…").fill(String(id));
  await page.locator(".cg-search-drop button", { hasText: `#${id}` }).first().click();
  await expect(page.locator(".dps-result")).toBeVisible();
}

test("dps page computes a result for a picked unit and skill", async ({ page }) => {
  await pickUnit(page, 2901);
  await page.getByLabel("Skill").selectOption("base");
  await expect(page.locator(".dps-result tbody tr")).toHaveCount(2);
  const steps = page.locator(".dps-breakdown").nth(1);
  await expect(steps.locator("tr", { hasText: "Skill self ATK" })).toContainText("x2");
});

async function addBuffer(page: import("@playwright/test").Page, id: number) {
  await page.getByPlaceholder("add buffer (unit name / id)…").fill(String(id));
  await page.locator(".cg-search-drop button", { hasText: `#${id}` }).first().click();
  await expect(page.locator(".dps-buffer", { hasText: `#${id}` })).toBeVisible();
  return page.locator(".dps-buffer", { hasText: `#${id}` });
}

test("a buffer applies its buffs automatically and each row can be turned off", async ({ page }) => {
  await pickUnit(page, 2901); // female
  const atkCell = page.locator(".dps-result tbody tr").first().locator("td").nth(1);
  const before = await atkCell.innerText();
  const card = await addBuffer(page, 2475); // Vulcano (Bride): female / owner / prince
  await expect(atkCell).not.toHaveText(before);
  for (const box of await card.locator("tbody input[type=checkbox]").all()) await box.uncheck();
  await expect(atkCell).toHaveText(before);
});

test("buffer rows that cannot reach the unit are not applied", async ({ page }) => {
  await pickUnit(page, 308); // Dark Knight, male, not a prince
  const card = await addBuffer(page, 2475);
  await expect(card).toContainText("No buffs from this setup reach the selected unit.");
});

test("granted abilities: Murasame anti-ground and Sill's always-on modifier", async ({ page }) => {
  await pickUnit(page, 2901);
  await addBuffer(page, 2884);
  const steps = page.locator(".dps-breakdown").first();
  await expect(steps).toContainText("granted by Murasame");
  await page.getByLabel("Enemy is flying").check();
  await expect(steps).not.toContainText("granted by Murasame");
  await addBuffer(page, 2900);
  await expect(steps).toContainText("granted by Sill");
});

test("Rance's normal skill sets PAD on the buffed unit", async ({ page }) => {
  await pickUnit(page, 2901);
  const card = await addBuffer(page, 2897);
  await card.locator(".dps-buffer-head select").nth(1).selectOption("base");
  await expect(page.locator(".dps-breakdown").first()).toContainText("Set PAD");
  await expect(page.locator(".dps-breakdown").first()).toContainText("20f");
});

test("archer's flying bonus is a condition checkbox", async ({ page }) => {
  await pickUnit(page, 1099);
  await page.getByLabel("Class").selectOption({ index: 0 });
  const row = page.locator(".dps-own tr", { hasText: "Damage modifier on hit" }).first();
  await expect(row).toContainText("x1.5");
  await expect(row).toContainText("no");
  await expect(page.locator(".dps-breakdown").first()).not.toContainText("x1.5");
  await expect(page.getByLabel("Enemy has tag: 水面")).toBeVisible();
  await page.getByLabel("Enemy is flying").check();
  await expect(row).toContainText("yes");
  await expect(page.locator(".dps-breakdown").first()).toContainText("x1.5");
});

test("there is no enemy picker, only HP / DEF / MR inputs", async ({ page }) => {
  await pickUnit(page, 2901);
  await expect(page.getByPlaceholder("enemy id / race / tag…")).toHaveCount(0);
  await expect(page.getByPlaceholder("stage name / event / quest id…")).toHaveCount(0);
  await page.getByLabel("DEF", { exact: true }).fill("300");
  await expect(page.locator(".dps-breakdown").first()).toContainText("max(ATK - DEF");
});

test("lia's ally ATK placeholder reads the ally row, not her self row", async ({ page }) => {
  await page.goto("/#/units/2901");
  const row = page.locator("tr", { hasText: "女王様の鞭" }).first();
  await expect(row).toContainText("1.6");
});

test("HP-ratio conditions become sliders", async ({ page }) => {
  await pickUnit(page, 1539); // ability 1 tiers on GetEnemyHPRatio() <= 30/50/70/90
  const slider = page.locator(".cg-slider", { hasText: "Enemy HP %" }).locator("input[type=range]");
  await expect(slider).toBeVisible();
  await slider.fill("20");
  await expect(page.locator(".dps-breakdown").first()).toContainText("x2");
});

test("PAD reductions do not stack: only the strongest applies", async ({ page }) => {
  await pickUnit(page, 2901);
  await addBuffer(page, 2294); // Finesse (Black), bard -35%
  await addBuffer(page, 336); // Towa, -20% (ability 91, all allies)
  const steps = page.locator(".dps-breakdown").first();
  await expect(steps).toContainText("PAD -35%");
  await expect(steps).toContainText("reductions do not stack");
});

test("a buffer's skill-stage boost follows the chosen stage (Tristella bard ATK)", async ({ page }) => {
  await pickUnit(page, 2901);
  const card = await addBuffer(page, 2629); // Black Tristella, AW skill stages x1.2/x1.6/x2.0 on +50%
  const steps = page.locator(".dps-breakdown").first();
  await expect(steps).toContainText("x1.6");
  await card.locator(".dps-buffer-head select").nth(2).selectOption({ index: 2 });
  await expect(steps).toContainText("x2");
  await card.getByText("Skill active").click();
  await expect(steps).toContainText("x1.5");
});

test("Tilt's ATK per death is a death-count slider", async ({ page }) => {
  await pickUnit(page, 1705);
  const row = page.locator(".dps-own tr", { hasText: "ATK per death" }).first();
  await expect(row).toContainText("counts this unit's own deaths");
  const slider = row.locator("input[type=range]");
  await expect(slider).toHaveAttribute("max", "2");
  const atk = page.locator(".dps-result tbody tr").first().locator("td").nth(1);
  const before = await atk.innerText();
  await slider.fill("2");
  await expect(atk).not.toHaveText(before);
});

test("Silky's padded AW skill counts only the damaging hits", async ({ page }) => {
  await pickUnit(page, 2902);
  await page.getByLabel("Skill").first().selectOption("awakened");
  const steps = page.locator(".dps-breakdown").nth(1);
  await expect(steps.locator("tr", { hasText: "Hits per attack" }).locator("td").nth(1)).toHaveText("9");
  await expect(steps).toContainText("15 shots, 9 deal damage");
  await expect(page.locator(".dps-tile").nth(1)).toContainText("on 5");
});

test("Belladonna's AW skill is 2 damaging hits (4 shots, 2 empty, trailing blank ignored)", async ({ page }) => {
  await pickUnit(page, 2598);
  await page.getByLabel("Skill").first().selectOption("awakened");
  const steps = page.locator(".dps-breakdown").nth(1);
  await expect(steps.locator("tr", { hasText: "Hits per attack" }).locator("td").nth(1)).toHaveText("2");
  await expect(steps).toContainText("4 shots, 2 deal damage");
});

test("share link restores the whole setup", async ({ page, context }) => {
  await pickUnit(page, 2902);
  await page.getByLabel("Skill").first().selectOption("awakened");
  await page.getByLabel("DEF", { exact: true }).fill("500");
  const card = await addBuffer(page, 2629);
  await card.locator(".dps-buffer-head select").nth(2).selectOption({ index: 2 });
  const dps = await page.locator(".dps-tile-value").nth(1).innerText();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const url = page.url();
  expect(url).toContain("/dps?s=");

  const fresh = await context.newPage();
  await fresh.goto(url);
  await expect(fresh.locator(".dps-tile-value").nth(1)).toHaveText(dps);
  await expect(fresh.getByLabel("DEF", { exact: true })).toHaveValue("500");
  await expect(fresh.locator(".dps-buffer", { hasText: "#2629" })).toBeVisible();
  await expect(fresh.locator(".dps-breakdown").nth(1)).toContainText("Failnaught");
});
