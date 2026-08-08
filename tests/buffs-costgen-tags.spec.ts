import { expect, test } from "@playwright/test";

test("buff ranking renders groups and switches stat tabs", async ({ page }) => {
  await page.goto("/#/buffs");
  await expect(page.getByRole("heading", { name: "Buff ranking" })).toBeVisible();
  const groups = page.locator(".buff-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(0);

  await page.locator(".stat-tab").nth(1).click();
  await expect(page.locator(".buff-group").first()).toBeVisible();
});

test("a large buff group expands and collapses", async ({ page }) => {
  await page.goto("/#/buffs");
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

test("on-hit debuffs visibly rank by duration instead of reduction", async ({ page }) => {
  await page.goto("/#/buffs?stat=DEF_DEBUFF");
  const group = page.locator(".buff-group", { hasText: "Reduce enemy DEF on hit" });
  await expect(group).toContainText("Longest duration takes priority");
  await expect(group.locator(".buff-priority").first()).toContainText("priority:");
});

test("costgen adds a unit from the search dropdown", async ({ page }) => {
  await page.goto("/#/costgen");
  const search = page.getByPlaceholder("add unit (name / id)…");
  await search.fill("Jerome");
  const option = page.locator(".cg-search-drop button", { hasText: "Jerome" }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator(".cg-card", { hasText: "Jerome" })).toBeVisible();
  await expect(page.locator(".count")).toContainText("1/");
  await expect(page.locator(".cg-chart svg")).toBeVisible();
});

test("tag page lists mentions for a known tag", async ({ page }) => {
  await page.goto(`/#/tags/${encodeURIComponent("獣人")}`);
  await expect(page.locator("h2")).toBeVisible();
  await expect(page.locator(".tag-mentions").first()).toBeVisible();
});
