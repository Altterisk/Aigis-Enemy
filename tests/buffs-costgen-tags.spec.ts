import { expect, test } from "@playwright/test";
import fs from "fs";

test("buff ranking renders groups and switches stat tabs", async ({ page }) => {
  await page.goto("/buffs");
  await expect(page.getByRole("heading", { name: "Buff ranking" })).toBeVisible();
  const groups = page.locator(".buff-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(0);

  await page.locator(".stat-tab").nth(1).click();
  await expect(page.locator(".buff-group").first()).toBeVisible();
});

test("buff categories sit in labelled rows with unit counts", async ({ page }) => {
  await page.goto("/buffs?stat=MR_DEBUFF");
  for (const label of ["Stats", "Debuffs", "Effects"]) {
    await expect(page.getByRole("group", { name: label })).toBeVisible();
  }
  const active = page.getByRole("group", { name: "Debuffs" }).locator(".stat-tab[aria-pressed=true]");
  await expect(active).toContainText("MR debuff");
  const count = Number(await active.locator(".hub-chip__count").textContent());
  expect(count).toBeGreaterThan(0);
});

test("a large buff group expands and collapses", async ({ page }) => {
  await page.goto("/buffs");
  const more = page.locator(".buff-more").first();
  await expect(more).toBeVisible();
  const group = page.locator(".buff-group", { has: more }).first();
  const collapsed = await group.locator("tbody tr").count();
  await more.click();
  await expect(more).toHaveText("collapse");
  expect(await group.locator("tbody tr").count()).toBeGreaterThan(collapsed);
  await more.click();
  await expect(more).toContainText("expand");
});

test("buff ranking filters rows by a concrete target affiliation and keeps it in the URL", async ({ page }) => {
  await page.goto("/buffs");
  await page.getByRole("button", { name: "receiver conditions ▼" }).click();
  const affiliation = page.locator(".filter-group", { hasText: "Affiliation" });
  await affiliation.locator("label").first().click();
  await expect(page).toHaveURL(/targetFaction=/);
  const value = new URL(page.url()).searchParams.get("targetFaction");
  await expect(page.locator(".buff-group").first()).toBeVisible();
  await expect(
    page.locator(".buff-table tbody tr").first().locator("td").nth(3)
      .locator(`a[href*="tag=${encodeURIComponent(value || "")}"]`)
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /receiver conditions/ }).click();
  await expect(affiliation.locator("input").first()).toBeChecked();
});

test("receiver chips split unconditional, conditional and token-only buffs", async ({ page }) => {
  await page.goto("/buffs");
  const receiver = page.locator(".hub-filter-row", { hasText: "Receiver" });
  await receiver.getByRole("button", { name: /^All allies\b(?! matching)/ }).click();
  await expect(page).toHaveURL(/targetScope=all(&|$)/);
  // unconditional "all" rows carry no "(condition)" after the target
  await expect(page.locator(".buff-table tbody tr td:nth-child(4)", { hasText: "(" })).toHaveCount(0);
  await page.goto("/buffs?targetScope=token");
  await expect(page.locator(".buff-table tbody tr").first()).toBeVisible();
  // Pupuru's ATK aura only reaches servant tokens
  await expect(page.locator(".buff-table a[href='/units/225']").first()).toBeVisible();
});

test("giving-unit filters limit rows to buffs from matching units", async ({ page }) => {
  const atkCount = async () => {
    const chip = page.locator(".stat-tab", { hasText: /^ATK/ }).first();
    await expect(chip).toBeVisible();
    return Number(((await chip.textContent()) || "").replace(/\D/g, ""));
  };
  await page.goto("/buffs");
  await expect(page.locator(".buff-table tbody tr").first()).toBeVisible();
  const all = await atkCount();
  await page.goto("/buffs?grarity=Black");
  await expect(page.locator(".buff-giver-filters input:checked")).toHaveCount(1);
  await expect(page.locator(".buff-table tbody tr").first()).toBeVisible();
  const black = await atkCount();
  expect(black).toBeGreaterThan(0);
  expect(black).toBeLessThan(all);
});

test("utility tab lists auto-skill givers, assassination and omni placement", async ({ page }) => {
  await page.goto("/buffs?stat=UTILITY");
  await expect(page.getByRole("group", { name: "Effects" }).locator(".stat-tab[aria-pressed=true]")).toContainText("Utility");
  await expect(page.locator(".buff-group", { hasText: "Target automatically uses skill" })).toBeVisible();
  await expect(page.locator(".buff-group", { hasText: "Omni placement" })).toContainText("Suzune");
  const multiplier = page.locator(".buff-group", { hasText: "Assassination modifier" });
  await expect(multiplier.locator(".buff-val").first()).toHaveText(/^x\d/);
});

test("placement tab lists deployment-spot buffs from tokens and deployment-spot units", async ({ page }) => {
  await page.goto("/buffs?stat=PLACEMENT");
  const spotAtk = page.locator(".buff-group", { hasText: "Deployment" }).filter({ hasText: "ATK" }).first();
  await expect(spotAtk).toContainText("Sanara (Black)");
  await expect(spotAtk).toContainText("unit on the spot");
  await expect(page.locator(".buff-group", { hasText: "Ivril (Black)" }).first()).toBeVisible();
});

test("on-hit debuffs visibly rank by duration instead of reduction", async ({ page }) => {
  await page.goto("/buffs?stat=DEF_DEBUFF");
  const group = page.locator(".buff-group", { hasText: "Reduce enemy DEF on hit" });
  await expect(group).toContainText("Longest duration takes priority");
  await expect(group.locator(".buff-priority").first()).toContainText("priority:");
});

test("costgen adds a unit from the search dropdown", async ({ page }) => {
  await page.goto("/costgen");
  const search = page.getByPlaceholder("add unit (name / id)…");
  await search.fill("Jerome");
  const option = page.locator(".cg-search-drop button", { hasText: "Jerome" }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator(".cg-card", { hasText: "Jerome" })).toBeVisible();
  await expect(page.locator(".count")).toContainText("1/");
  await expect(page.locator(".cg-chart svg")).toBeVisible();
});

test("costgen chart labels carry the unit icon and export to PNG", async ({ page }) => {
  await page.goto("/costgen");
  const search = page.getByPlaceholder("add unit (name / id)…");
  await search.fill("Jerome");
  await page.locator(".cg-search-drop button", { hasText: "Jerome" }).first().click();
  await expect(page.locator(".cg-chart svg")).toBeVisible();

  const icon = page.locator(".cg-chart svg image").first();
  await expect(icon).toHaveAttribute("href", /unit-icon\/\d+\.png/);
  expect((await icon.boundingBox())!.width).toBeGreaterThan(4);

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^up-gen-1-units-\d+s\.png$/);
  const bytes = fs.readFileSync((await download.path())!);
  expect(bytes.length).toBeGreaterThan(5000);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG magic
});

test("tag page lists mentions for a known tag", async ({ page }) => {
  await page.goto(`/tags/${encodeURIComponent("獣人")}`);
  await expect(page.locator("h2")).toBeVisible();
  await expect(page.locator(".tag-mentions").first()).toBeVisible();
  const classSection = page
    .locator(".tag-effect-section")
    .filter({ has: page.locator(":scope > summary", { hasText: /^Classes\b/ }) })
    .first();
  await expect(classSection).toBeVisible();
  await expect(classSection).not.toHaveAttribute("open", "");
  await classSection.locator("summary").click();
  await expect(classSection.locator("thead")).toContainText("Name");
  await expect(classSection.locator("thead")).toContainText("Effect");
  await expect(classSection.locator("thead")).toContainText("Owner unit");
  await expect(classSection.locator("tbody tr").first()).toContainText("Tsayu");
});

test("class-trait tag effects respect a carrier-specific CardID condition", async ({ page }) => {
  await page.goto(`/tags/${encodeURIComponent("サマー")}`);
  const classSection = page
    .locator(".tag-effect-section")
    .filter({ has: page.locator(":scope > summary", { hasText: /^Classes\b/ }) })
    .first();
  await classSection.locator("summary").click();
  await expect(classSection).toContainText("Vidya (Swimsuit)");
  await expect(classSection).not.toContainText("Vidya (Black)");
  await expect(classSection).not.toContainText("Vidya (Platinum)");
});

test("buff rows list every skill-stage tier of a boosted ability", async ({ page }) => {
  await page.goto("/buffs");
  const row = page.locator(".buff-table tr", { hasText: "Tristella (Black)" }).first();
  await expect(row.locator(".buff-tiers")).toContainText("base");
  await expect(row.locator(".buff-tiers")).toContainText("awakened skill stage 3");
});
