import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("home shows current events and new units", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hub-bar__home")).toHaveText("Aigis Database");
  await expect(page.getByRole("heading", { name: "Current events" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New units" })).toBeVisible();
  const tile = page.locator(".home-unit-tile").first();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/units\/\d+$/);
});

test("home lists every running rate-up with its units", async ({ page }) => {
  const summons: { open: string; close: string; units: number[] }[] = JSON.parse(
    fs.readFileSync("public/data/current_summons.json", "utf-8"));
  const jst = (t: string) => Date.parse(`${t.replace(/\//g, "-").replace(" ", "T")}+09:00`);
  const live = summons.filter((s) => s.units.length && jst(s.open) <= Date.now() && (!s.close || Date.now() <= jst(s.close)));
  test.skip(!live.length, "no rate-up running");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Current rate-up" })).toBeVisible();
  await expect(page.locator(".home-summon")).toHaveCount(live.length);
  await expect(page.locator(".home-summon img.home-summon-banner")).toHaveCount(live.length);
  for (const id of live.flatMap((s) => s.units)) {
    await expect(page.locator(`.home-summon a[href="/units/${id}"]`)).toBeVisible();
  }
});

test("unit list puts the newest unit first", async ({ page }) => {
  await page.goto("/units");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
  const ids =await page.locator(".unit-grid .unit-tile-sub").evaluateAll((els) =>
    els.slice(0, 5).map((e) => Number(/#(\d+)/.exec(e.textContent ?? "")?.[1])));
  expect(ids).toEqual([...ids].sort((a, b) => b - a));
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
