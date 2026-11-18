import { expect, test } from "@playwright/test";

test("team builder suggests units for a target and adds one to the formation", async ({ page }) => {
  await page.goto("/team?t=2901&pool=all");
  const cands = page.locator(".team-cand");
  await expect(cands.first()).toBeVisible();
  await expect(page.locator(".team-panel, .hub-panel", { hasText: "Formation (1/15)" })).toBeVisible();
  await cands.first().getByRole("button", { name: "add" }).click();
  await expect(page.locator(".team-member")).toHaveCount(2);
  await expect(page.locator(".team-overall__list li").first()).toBeVisible();
});

test("a stage sets the deploy limit; past it new units join the formation only", async ({ page }) => {
  await page.goto("/team?t=2901&pool=all&q=1");
  await expect(page.getByText("deploy limit 8")).toBeVisible();
  await page.goto("/team?t=2901&pool=all&cap=1");
  await expect(page.getByText("deployed 1/1")).toBeVisible();
  // units over the limit only bring sortie buffs, so they rank lower: open the whole list
  await expect(page.locator(".team-cand").first()).toBeVisible();
  const more = page.getByRole("button", { name: /more/ });
  while (await more.count()) await more.click();
  await expect(page.locator(".team-cand", { hasText: "formation only" }).first()).toBeVisible();
});
