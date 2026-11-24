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
  const summons: { key: string; banner_id: number; open: string; close: string; units: number[] }[] = JSON.parse(
    fs.readFileSync("public/data/current_summons.json", "utf-8"));
  const jst = (t: string) => Date.parse(`${t.replace(/\//g, "-").replace(" ", "T")}+09:00`);
  const live = summons.filter((s) => s.units.length && jst(s.open) <= Date.now() && (!s.close || Date.now() <= jst(s.close)));
  test.skip(!live.length, "no rate-up running");
  // banners are gitignored (served from the assets CDN), so a CI checkout has none
  const withArt = live.filter((s) =>
    fs.existsSync(`public/banners/summon_${s.banner_id ? `b${s.banner_id}` : s.key}.png`));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Current rate-up" })).toBeVisible();
  await expect(page.locator(".home-summon")).toHaveCount(live.length);
  await expect(page.locator(".home-summon img.home-summon-banner")).toHaveCount(withArt.length);
  for (const id of live.flatMap((s) => s.units)) {
    await expect(page.locator(`.home-summon a[href="/units/${id}"]`)).toBeVisible();
  }
});

test("unit list puts the newest release first, not the highest id", async ({ page }) => {
  const units: { id: number; npc?: boolean; implementation_date?: string | null }[] =
    await (await page.request.get("/data/units.json")).json();
  await page.goto("/units");
  await expect(page.locator(".unit-grid .unit-tile").first()).toBeVisible();
  const ids = await page.locator(".unit-grid .unit-tile-sub").evaluateAll((els) =>
    els.slice(0, 20).map((e) => Number(/#(\d+)/.exec(e.textContent ?? "")?.[1])));
  const date = new Map(units.map((u) => [u.id, u.implementation_date || ""]));
  const dates = ids.map((id) => date.get(id)!);
  expect(dates).toEqual([...dates].sort().reverse());
  // within one release day, highest id first
  for (let i = 1; i < ids.length; i++) if (dates[i] === dates[i - 1]) expect(ids[i]).toBeLessThan(ids[i - 1]);
  // every unit released after the 20th tile's day is in those 20, low ids included
  const cutoff = dates[dates.length - 1];
  for (const u of units) if (!u.npc && (u.implementation_date || "") > cutoff) expect(ids).toContain(u.id);
});

// Each page's data rendering has its own spec; this one only checks the header links route,
// so it does not wait on the large list downloads (enemies.json is ~7 MB).
test("header navigation reaches every page", async ({ page }) => {
  await page.goto("/");
  const nav = [
    ["Units", "/units"], ["Prince", "/prince"], ["Collection", "/collection"], ["Enemies", "/enemies"], ["Stages", "/stages"],
    ["Story", "/story"], ["Buffs", "/buffs"], ["Cost Gen", "/costgen"], ["DPS", "/dps"], ["Weather", "/weather"],
  ] as const;
  for (const [name, path] of nav) {
    const link = page.getByRole("link", { name, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main")).toHaveText(/\S/);
  }
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

test("changelog page lists releases with unit links", async ({ page }) => {
  await page.goto("/changelog");
  await expect(page.getByRole("heading", { name: "What's new" })).toBeVisible();
  const first = page.locator(".hub-release").first();
  await expect(first).toBeVisible();
  await expect(page.locator(".hub-release", { hasText: "2026-10-22" }).getByRole("link", { name: "Diana (Shadow)" })).toBeVisible();
});

test("what's new popup shows once for a returning visitor and never for a first visit", async ({ page }) => {
  await page.goto("/units");
  await expect(page.locator(".hub-modal")).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem("aigis.seen", JSON.stringify({ seen: { "changelog:2000-01-01": true } })));
  await page.reload();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("What's new");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
