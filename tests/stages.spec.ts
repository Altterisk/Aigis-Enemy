import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("stage index lists events with stage links", async ({ page }) => {
  await page.goto("/stages");
  await expect(page.locator(".portal-grid .portal-tile").first()).toBeVisible();
  await page.locator(".mission-card").first().click();
  await expect(page).toHaveURL(/m=\d+/);
  const links = page.locator(".stage-card-name a");
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThan(0);
});

test("stage portal opens a category, then a mission from its banner", async ({ page }) => {
  await page.goto("/stages");
  await page.locator(".portal-grid .portal-tile", { hasText: "Tower" }).click();
  await expect(page).toHaveURL(/cat=tower/);
  await expect(page.locator(".portal-head-title")).toHaveText("Tower");
  await page.locator(".mission-card").first().click();
  await expect(page).toHaveURL(/cat=tower&m=\d+/);
  await expect(page.locator(".stage-card-name a").first()).toBeVisible();
  await page.getByRole("button", { name: /← Tower/ }).click();
  await expect(page.locator(".mission-card").first()).toBeVisible();
  await page.getByRole("button", { name: /Mission portal/ }).click();
  await expect(page.locator(".portal-grid")).toBeVisible();
});

test("the advent tile lists every advent kind", async ({ page }) => {
  await page.goto("/stages?cat=advent");
  await expect(page.locator(".mission-card", { hasText: "魔神降臨(" }).first()).toBeVisible();
  for (const name of ["大神降臨", "魔神最終決戦", "影の帝国降臨"]) {
    await expect(page.locator(".mission-card", { hasText: name }).first()).toBeVisible();
  }
});

test("event history shows one year per page", async ({ page }) => {
  await page.goto("/stages?cat=history");
  await expect(page.getByRole("tab", { name: /^1年目の戦い/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".mission-card", { hasText: "魔女を救え！" })).toBeVisible();
  await page.getByRole("tab", { name: /^2年目の戦い/ }).click();
  await expect(page).toHaveURL(/year=2/);
  await expect(page.locator(".mission-card").first()).toBeVisible();
  await expect(page.locator(".mission-card", { hasText: "魔女を救え！" })).toHaveCount(0);
});

test("stage detail loads from the index", async ({ page }) => {
  await page.goto("/stages/1");
  await expect(page.getByText("魔女の襲撃").first()).toBeVisible();
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
});

test("stage dialogue tab shows in-stage scenes when present", async ({ page }) => {
  await page.goto("/stages/1");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  const tab = page.getByRole("tab", { name: /Dialogue/ });
  test.skip(await tab.count() === 0, "stage 1 has no dialogue in this export");
  await tab.click();
  await expect(page.locator(".dlg")).toBeVisible();
});

test("dialogue renders the supplied game portrait refs", async ({ page }) => {
  await page.goto("/stages/8983");
  await page.getByRole("tab", { name: /Dialogue/ }).click();

  for (const [speaker, unitId, icon] of [
    ["キュウビ", 465, "465.png"],
    ["ラタトスク", 1375, "1375_aw1.png"],
  ] as const) {
    const line = page.locator(".dlg-line", { has: page.locator(".dlg-name", { hasText: speaker }) }).first();
    await expect(line.locator(".dlg-face")).toHaveAttribute("src", new RegExp(`unit-icon/${icon}$`));
    await expect(line.locator(".dlg-face-link")).toHaveAttribute("href", `/units/${unitId}`);
  }
});

test("stage list keeps search and category in the URL", async ({ page }) => {
  await page.goto("/stages?cat=all&q=1");
  await expect(page.locator(".hub-list-toolbar select")).toHaveValue("all");
  await expect(page.getByPlaceholder("Search stage / event name (EN or JP) / quest id")).toHaveValue("1");
  await page.locator(".stage-card-name a").first().click();
  await expect(page).toHaveURL(/\/stages\/\d+/);
  await page.goBack();
  await expect(page.locator(".hub-list-toolbar select")).toHaveValue("all");
});

test("stage search finds an event by its English name and shows its first run", async ({ page }) => {
  await page.goto("/stages?q=hydose");
  const block = page.locator(".event-group");
  await expect(block).toHaveCount(1);
  await expect(block.locator("h3")).toContainText("Great God Hydose's Advent");
  await expect(block.locator(".event-alt")).toContainText("大神降臨ハイドース");
  await expect(block.locator(".event-run")).toContainText("first run 2025/4/3 – 4/10");
});

test("imperial war corps share one list", async ({ page }) => {
  await page.goto("/stages?cat=empire");
  await expect(page.locator(".cat-section")).toHaveCount(1);
  await expect(page.locator(".cat-section .cat-title")).toContainText("Great Imperial War");
  await expect(page.locator(".mission-card")).toHaveCount(12);
});

test("stage list fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/stages?cat=all");
  await expect(page.locator(".stage-card-name a").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("stage tabs live in the URL and breadcrumbs lead back", async ({ page }) => {
  await page.goto("/stages/8983?tab=dialogue");
  await expect(page.getByRole("tab", { name: /Dialogue/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".dlg")).toBeVisible();
  await page.getByRole("tab", { name: /Enemies/ }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await page.locator(".hub-crumbs a", { hasText: "Stages" }).click();
  await expect(page).toHaveURL(/\/stages$/);
});

test("fixture / clone enemies carry a marker badge and are counted apart", async ({ page }) => {
  await page.goto("/stages/1021");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".badge.marker").first()).toBeVisible();
  await page.goto("/stages?cat=all&q=%E7%8E%8B%E9%83%BD%E9%99%A5%E8%90%BD%EF%BC%92");
  const card = page.locator(".stage-card", { has: page.getByRole("link", { name: /王都陥落２/ }) }).first();
  await expect(card.locator(".stage-stat", { hasText: "Enemies" })).toContainText("+9");
});

test("enemy effect details are written out instead of raw game keys", async ({ page }) => {
  await page.goto("/stages/10028");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".eff-cond", { hasText: /^ ?blocks / }).first()).toBeVisible();
  await expect(page.locator(".eff-cond", { hasText: "近接物理" })).toHaveCount(0);
});

test("parked enemies and flag-gated transforms name what happens", async ({ page }) => {
  await page.goto("/stages/45006");
  await expect(page.locator(".enemy-cards > *").first()).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "never moves" }).first()).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "stays put until stage flag 100 is set" })).toBeVisible();
  await expect(page.locator(".trigger-badge", { hasText: "when stage flag 50 is set → transform into form 2" }).first()).toBeVisible();
});

test("HP-threshold changes of the same body are phases, not extra forms", async ({ page }) => {
  await page.goto("/stages/40019");
  const boss = page.locator(".enemy-card", { hasText: "Enemy #4 · form 3/3" });
  await expect(boss).toBeVisible();
  await expect(boss.locator(".variant-row .trigger-badge", { hasText: "at 25% HP" })).toBeVisible();
  await expect(page.getByText("form 4/4")).toHaveCount(0);
  const two = page.locator(".enemy-card", { hasText: "Enemy #8 · form 2/2" });
  await expect(two.locator(".variant-row .trigger-badge")).toHaveText(["at 75% HP", "at 25% HP"]);
});

test("4★ switch rescales enemy stats and popups start collapsed", async ({ page }) => {
  await page.goto("/stages/40019");
  await expect(page.locator(".popups-details")).not.toHaveAttribute("open", "");
  await expect(page.locator(".popups-details .popup").first()).toBeHidden();
  const hp = page.locator(".enemy-card", { hasText: "Enemy #4 · form 1/" }).locator("td.num").first();
  await expect(hp).toHaveText("1,000,000");
  await page.locator(".difficulty-pick button", { hasText: "4★" }).click();
  await expect(page).toHaveURL(/diff=4/);
  await expect(hp).toHaveText("1,125,000");
});

test("in-game color markup in stage names renders as colored text", async ({ page }) => {
  await page.goto("/stages/7540");
  const title = page.locator(".stage-header").getByText("第三陣 飛行部隊の増援").first();
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.locator(".stage-header")).not.toContainText("%c[");
});

test("map tab labels deployment spots and offers download and copy", async ({ page }) => {
  const stage = JSON.parse(fs.readFileSync("public/data/stage/11038.json", "utf-8"));
  const spots: { k: string }[] = stage.map.spots;
  const count = (k: string) => spots.filter((s) => s.k === k).length;
  await page.goto("/stages/11038?tab=map");
  await expect(page.getByRole("tab", { name: /Map/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(`Melee (${count("m")})`)).toBeVisible();
  await expect(page.getByText(`Ranged (${count("r")})`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  // map art is gitignored (served from the assets CDN), so a CI checkout has none
  if (fs.existsSync(`public/maps/${stage.map.image}.webp`)) {
    await expect(page.locator("canvas.stage-map-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PNG" })).toBeEnabled();
  } else {
    await expect(page.getByText("Map image unavailable.")).toBeVisible();
  }
});

test("map phases add the spots the battle creates later", async ({ page }) => {
  // stage 11011: clouds bring 8 ranged spots during the battle
  await page.goto("/stages/11011?tab=map");
  const phases = page.locator(".stage-map-phases button");
  await expect(phases.first()).toHaveText(/Start/);
  expect(await phases.count()).toBeGreaterThan(1);
  await expect(page.getByText(/^Ranged/)).toHaveCount(0);
  await phases.last().click();
  await expect(page.getByText("Ranged (8)")).toBeVisible();
});

test("damage tiles show their damage per second in the map key", async ({ page }) => {
  // stage 7563 (Nidhogg, 極級): lava spots deal 120 every second to the unit on them
  await page.goto("/stages/7563?tab=map");
  await expect(page.getByText("Damage tile (6)")).toBeVisible();
  await expect(page.locator(".stage-map-key--dmg")).toHaveText("120/s");
});

test("spot changes caused by enemies are numbered in a legend", async ({ page }) => {
  // stage 9516 (Leraje Lv.16): defeating enemies #1 and #4 opens ranged spots
  await page.goto("/stages/9516?tab=map");
  const toggle = page.locator(".stage-map-toggle", { hasText: "Triggered changes (2)" });
  await expect(toggle).toBeVisible();
  const items = page.locator(".stage-map-triggers li");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("when enemy #1 is defeated");
  await toggle.locator("input").uncheck();
  await expect(items).toHaveCount(0);
});

test("stage cards show map, costs, rewards, modifiers and drops", async ({ page }) => {
  // quest 2041 背水の陣３: EXP 80, gold 750, start cost 10, deploy 5, 3 enemies,
  // a no-healers term, drops Crystal / Ruby / Diamond and two spirits
  await page.goto("/stages?cat=all&q=2041");
  const card = page.locator(".stage-card", { has: page.getByRole("link", { name: /背水の陣３/ }) }).first();
  await expect(card.locator(".stage-card-map img")).toBeVisible();
  await expect(card.locator(".stage-card-desc")).toContainText("回復ユニットが出撃できない");
  const stat = (label: string) => card.locator(".stage-stat", { hasText: label }).locator(".stage-stat-value");
  await expect(stat("EXP")).toHaveText("80");
  await expect(stat("Gold")).toHaveText("750");
  await expect(stat("Start cost")).toHaveText("10");
  await expect(stat("Max deploy")).toHaveText("5");
  await expect(stat("Enemies")).toHaveText("3");
  await expect(card.locator(".stage-card-mods code")).toContainText("influence 24");
  await expect(card.locator(".drop-item[title='Diamond'] img")).toBeVisible();
  await expect(card.locator(".stage-drops a[href='/units/58']")).toBeVisible();
});

test("the drop slot no enemy carries is shown as the complete bonus", async ({ page }) => {
  // quest 1101 田園の門: Treasure4 = Crave (#8), carried by no enemy
  await page.goto("/stages?cat=all&q=1101");
  const card = page.locator(".stage-card", { has: page.getByRole("link", { name: /田園の門/ }) }).first();
  const bonus = card.locator(".stage-card-section", { hasText: "Complete bonus" });
  await expect(bonus.locator("a[href='/units/8']")).toBeVisible();
  await expect(bonus.locator(".drop-count")).toHaveCount(0);
  await expect(card.locator(".stage-card-section", { hasText: "Drops" }).locator("a[href='/units/8']")).toHaveCount(0);
});
