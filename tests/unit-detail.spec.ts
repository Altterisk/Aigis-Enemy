import { expect, test } from "@playwright/test";

test("unit header shows the EN name with the JP original underneath", async ({ page }) => {
  await page.goto("/units/10");
  const heading = page.locator("h2").first();
  await expect(heading).toContainText("#10");
  await expect(heading).toContainText("Bernard");
  await expect(heading.locator(".muted")).not.toBeEmpty();
});

test("unit detail opens on the stats tab and switches to the gallery", async ({ page }) => {
  await page.goto("/units/10");
  await expect(page.getByRole("tab", { name: "Stats" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.locator(".unit-stat-table tbody tr").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gallery" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Gallery" }).click();
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stats" })).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]tab=gallery/);
});

test("a ?tab= link opens that tab", async ({ page }) => {
  await page.goto("/units/10?tab=skills");
  await expect(page.getByRole("tab", { name: "Skills" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Base skill" })).toBeVisible();
});

test("a ?tab= naming a hidden or unknown tab falls back to stats", async ({ page }) => {
  await page.goto("/units/10?tab=nonsense");
  await expect(page.getByRole("tab", { name: "Stats" })).toHaveAttribute("aria-selected", "true");
});

test("Eterna SAW exposes its forced healing-priority rule", async ({ page }) => {
  await page.goto("/units/2864?tab=skills");
  await page.getByRole("button", { name: "Game details" }).first().click();
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
    await page.goto(`/units/${id}`);
    await expect(page.locator("h2").first()).toContainText(name);
  });
}

test("prince page groups his title forms", async ({ page }) => {
  await page.goto("/prince");
  await expect(page.getByRole("heading", { name: "Prince", exact: true })).toBeVisible();
  const keraunos = page.locator(".prince-form", { hasText: "Prince (Keraunos)" });
  await expect(keraunos.locator(".prince-level-link")).toHaveText(["Lv1", "Lv2", "Lv3", "Lv4"]);
  await expect(page.locator(".prince-stat-table")).toContainText("HP +10%");
});

test("a prince title card links its levels and the prince page", async ({ page }) => {
  await page.goto("/units/1380");
  const bar = page.locator(".prince-bar");
  await expect(bar).toContainText("Lv2 of 4");
  await expect(bar.locator(".prince-level-link.is-current")).toHaveText("Lv2");
  await expect(bar.getByRole("link", { name: "All Prince titles →" })).toHaveAttribute("href", "/prince");
});

test("the unit list leaves prince cards out", async ({ page }) => {
  await page.goto("/units?q=Keraunos");
  await expect(page.locator(".prince-list-link")).toBeVisible();
  await expect(page.locator(".unit-grid a[href='/units/552']")).toHaveCount(0);
});

test("a one-copy-only unit shows its formation restriction", async ({ page }) => {
  await page.goto("/units/2874");
  await expect(page.getByRole("heading", { name: "Formation restriction" })).toBeVisible();
  await expect(page.getByText("Only one may be in a team.")).toBeVisible();
});

test("a mutually exclusive pair links the other card", async ({ page }) => {
  await page.goto("/units/1620");
  const restriction = page.locator("section, .hub-panel").filter({ has: page.getByRole("heading", { name: "Formation restriction" }) });
  await expect(restriction.getByText("Cannot be in the same team as")).toBeVisible();
  await expect(restriction.getByRole("link", { name: "Lukifer (Platinum)" })).toBeVisible();
});

test("an unrestricted unit has no formation-restriction section", async ({ page }) => {
  await page.goto("/units/2873");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formation restriction" })).toHaveCount(0);
});

test("a per-shot missile list marks its empty slots", async ({ page }) => {
  // #2902's awakened ability fires a 15-slot list where 6 slots are blank
  // Missile.atb rows (#1517)
  await page.goto("/units/2902?tab=abilities");
  // the Readable view repeats the extend and missile facts
  const list = page.getByText(/15 shot slots: 9 fire, 6 empty/).first();
  await expect(list).toBeAttached();
  await expect(list).toContainText("∅");
  await expect(page.getByText(/missile 1517: empty slot: fires nothing/).first()).toBeAttached();
});

test("?tab=quotes opens the Quotes tab", async ({ page }) => {
  await page.goto("/units/1?tab=quotes");
  await expect(page.getByRole("tab", { name: "Quotes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Quotes & scenes" })).toBeVisible();
});

test("gallery lightbox steps with arrow keys and closes on Escape", async ({ page }) => {
  await page.goto("/units/10?tab=gallery");
  await page.locator(".gallery-thumb").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const first = await dialog.locator("h2, h3, .hub-modal__title").first().innerText();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("h2, h3, .hub-modal__title").first()).not.toHaveText(first);
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.locator("h2, h3, .hub-modal__title").first()).toHaveText(first);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("unit breadcrumbs return to the filtered list", async ({ page }) => {
  await page.goto("/units?rarity=Black");
  await page.locator(".unit-grid .unit-tile").first().click();
  await expect(page).toHaveURL(/\/units\/\d+$/);
  await page.locator(".hub-crumbs a", { hasText: "Units" }).click();
  await expect(page).toHaveURL(/\/units\?rarity=Black/);
});

test("unit page fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/units/10");
  await expect(page.locator(".unit-stat-table")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("infobox artist links to that artist's section on the artist list", async ({ page }) => {
  await page.goto("/units/2908");
  const artist = page.locator(".unit-infobox-rows a", { hasText: "内有一馬" });
  await expect(artist).toBeVisible();
  await artist.click();
  await expect(page).toHaveURL(/\/artists\?artist=/);
  const row = page.locator(".artist-table tr.focused");
  await expect(row.locator(".artist-name")).toContainText("内有一馬");
  await expect(row.locator(".artist-links a", { hasText: "Twitter" })).toHaveAttribute("href", /twitter\.com\/utiu_kazuma/);
  await expect(row.locator("a[href$='/units/2908']")).toBeInViewport();
  expect(await row.locator(".artist-units a").count()).toBeGreaterThan(1);
  await expect(page.locator(".artist-table tbody tr").last().locator(".artist-name")).toContainText("Unknown");
  expect(await page.locator(".artist-table tbody tr").count()).toBeGreaterThan(100);
});

test("artist search filters by artist or unit name", async ({ page }) => {
  await page.goto("/artists");
  const search = page.getByPlaceholder("Search artist / unit name");
  const names = page.locator(".artist-table .artist-name");
  await search.fill("ＳＡＬＬＹ");   // full-width upper case still finds "Sally"
  await expect(names.first()).toContainText("Sally");
  await search.fill("内有");
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(names.first()).toContainText("内有一馬");
  for (const t of await names.allTextContents()) expect(t).toContain("内有一馬");
  await search.fill("狼装の盗賊ベルナ");
  await expect(names).toHaveCount(1);
  await expect(names.first()).toContainText("内有一馬");
  await search.fill("");
  expect(await names.count()).toBeGreaterThan(100);
});

test("skill effects read as sentences, with the raw rows behind Game details", async ({ page }) => {
  await page.goto("/units/1455?tab=skills");
  const prose = page.locator(".prose-lines").first();
  await expect(prose).toContainText("For 5s (10s at max skill level):");
  await expect(prose).toContainText("its HP cannot drop to 0");
  await expect(prose).toContainText("when the skill ends, it is paralyzed");
  await expect(page.getByText("type 36 · target self")).toHaveCount(0);
  await page.getByRole("button", { name: "Game details" }).first().click();
  await expect(page.getByText(/type 36 · target self/).first()).toBeVisible();
});

test("same-value stat clauses merge into one", async ({ page }) => {
  await page.goto("/units/1104?tab=skills");
  await expect(page.locator(".prose-lines").first()).toContainText("multiplies its ATK and DEF by 1.6");
});

test("buff clauses carry their family tag", async ({ page }) => {
  await page.goto("/units/1104?tab=skills");
  const tags = page.locator(".prose-lines .prose-tag");
  await expect(tags.filter({ hasText: "Self" }).first()).toBeVisible();
  await expect(tags.filter({ hasText: "Type-C" }).first()).toBeVisible();
});

test("readable abilities group class tiers and fold condition variants", async ({ page }) => {
  await page.goto("/units/2935?tab=abilities");
  const lines = page.locator(".prose-lines li");
  await expect(lines.filter({ hasText: /^As Dragon Retainer \(AW2A\): automatically places a \S+ token every 10s \(5s if “Blue Dragon's Hospitality” is active; 2\.5s if/ })).toHaveCount(1);
  await expect(lines.filter({ hasText: "Lowers its deployment cost by 4 for each Dragon in the team (up to 5)" })).toHaveCount(1);
  const all = (await page.locator(".prose-lines").allInnerTexts()).join(" ");
  expect(all).not.toContain("class-change stage");
  expect(all).not.toContain("unit #2937");
  expect(all).not.toContain("ドラゴン");
});

test("the War God Blessing tab lists the blessings that can reach the unit", async ({ page }) => {
  // Safrea has the Dragon identity: the Dragon Shaman blessing reaches her
  await page.goto("/units/2935?tab=blessing");
  await expect(page.getByRole("heading", { name: /Class blessings/ })).toBeVisible();
  await expect(page.locator(".blessing-table").filter({ hasText: "ドラゴンシャーマンの祈り" })).toHaveCount(1);
  // Dark Knight is no Dragon: the same blessing is filtered out
  await page.goto("/units/308?tab=blessing");
  await expect(page.locator(".blessing-table").first()).toBeVisible();
  await expect(page.locator(".blessing-table").filter({ hasText: "ドラゴンシャーマンの祈り" })).toHaveCount(0);
});

test("possession buffs list the units whose 【所持効果】 can reach the unit", async ({ page }) => {
  // Rance #2897's possession effect is female-only
  await page.goto("/units/2935?tab=possession");
  await expect(page.locator(".possession-table a[href='/units/2897']")).toHaveCount(1);
  await page.goto("/units/308?tab=possession");
  await expect(page.locator(".possession-table").first()).toBeVisible();
  await expect(page.locator(".possession-table a[href='/units/2897']")).toHaveCount(0);
});

test("possession buffs sum the stat buffs per stat", async ({ page }) => {
  await page.goto("/units/2935?tab=possession");
  const totals = page.locator(".possession-totals");
  for (const stat of ["HP", "ATK", "DEF", "MR", "Range"]) await expect(totals).toContainText(stat);
  // utility effects (Tram's UP recovery) are not summed
  await expect(totals).not.toContainText("UP");
});

test("a plain trait filter becomes the recipients in readable ability text", async ({ page }) => {
  // IsPrince() || IsIdentitiy("ドラゴン"), ATK and cost rows joined into one sentence
  await page.goto("/units/2935?tab=abilities");
  await expect(page.locator("main")).toContainText("raises the ATK of the Prince and Dragon allies by 15% and lowers their deployment cost by 10");
  // IsIdentitiy("飛行")); -- the stray ")" does not leak into the text
  await page.goto("/units/2777?tab=abilities");
  await expect(page.locator("main")).toContainText("raises the ATK of Flying allies by 3% and their range by 10");
  await expect(page.locator("main")).not.toContainText("Flying))");
});

test("possession buffs drop placeholder exclusions and read melee + omni", async ({ page }) => {
  await page.goto("/units/2935?tab=possession");
  const table = page.locator(".possession-table");
  await expect(table).toContainText("raises the max HP of female allies by 3%");
  await expect(table).toContainText("raises the DEF of melee and omni allies by 3%");
  await expect(table).not.toContainText("Dummy (Battle)");
  await expect(table).not.toContainText("one of 9 units");
});
