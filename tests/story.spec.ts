import { expect, test } from "@playwright/test";

test("story portal opens a category, history by year, and search", async ({ page }) => {
  await page.goto("/story");
  await expect(page.locator(".portal-grid .portal-tile").first()).toBeVisible();
  await expect(page.locator(".cat-title", { hasText: "Now running" })).toBeVisible();
  await page.locator(".portal-grid .portal-tile", { hasText: "Episodes" }).click();
  await expect(page).toHaveURL(/cat=episode/);
  await expect(page.locator(".portal-head-title")).toHaveText("Episodes");
  await expect(page.locator(".story-card", { hasText: "第二回人気闘兵決定戦" })).toBeVisible();
  await page.getByRole("button", { name: /← Story portal/ }).click();
  await page.locator(".portal-grid .portal-tile", { hasText: "Event History" }).click();
  await expect(page.locator(".year-tab").first()).toBeVisible();
  await expect(page.locator(".story-card").first()).toBeVisible();
  await page.getByRole("button", { name: /← Story portal/ }).click();
  await page.getByRole("searchbox").fill("ぷるぷる");
  await expect(page.locator(".story-card", { hasText: "真夏のぷるぷるビーチ" })).toBeVisible();
});

test("an event page links battle dialogue and reads a scene", async ({ page }) => {
  await page.goto("/story/m200570");
  await expect(page.locator("h2")).toContainText("真夏のぷるぷるビーチ");
  const quest = page.locator(".story-quest", { hasText: "スライム化する海" });
  await quest.getByRole("button", { name: "Read" }).click();
  await expect(quest.locator(".story-read")).toContainText("スライムになってしまっているようだ");
  await quest.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/stages\/8970\?tab=dialogue$/);
});

test("the scene viewer shows lines, advances, logs and closes", async ({ page }) => {
  await page.goto("/story/m200570");
  await page.locator(".story-quest", { hasText: "スライム化する海" }).getByRole("button", { name: "▶ Play" }).click();
  await expect(page).toHaveURL(/play=ev008970/);
  const viewer = page.getByRole("dialog");
  // English mode names speakers from the speaker record (ヴィディア, 太上老君)
  await expect(viewer.locator(".hub-scene-say.is-on .hub-scene-name")).toHaveText("Vidya");
  await expect(viewer.locator(".hub-scene-controls__count")).toHaveText("1 / 16");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".hub-scene-controls__count")).toHaveText("2 / 16");
  await expect(viewer.locator(".hub-scene-say.is-on .hub-scene-name")).toHaveText("Daode Tianzun");
  // every line is in the page up front for page translators; only one shows
  await expect(viewer.locator(".hub-scene-say")).toHaveCount(16);
  await expect(viewer.locator(".hub-scene-say.is-on")).toHaveCount(1);
  await viewer.getByRole("button", { name: "Text: all lines" }).click();
  await expect(viewer.locator(".hub-scene-say")).toHaveCount(1);
  await expect(viewer.locator(".hub-scene-say.is-on .hub-scene-name")).toHaveText("Daode Tianzun");
  await viewer.getByRole("button", { name: "Text: per line" }).click();
  await viewer.getByRole("button", { name: "Log" }).click();
  await expect(viewer.locator(".sv-log-line")).toHaveCount(2);
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page).not.toHaveURL(/play=/);
});

test("episodes are titled from the game's own text", async ({ page }) => {
  await page.goto("/story/ep1");
  await expect(page.locator("h2")).toContainText("第二回人気闘兵決定戦");
  await expect(page.locator(".story-scene-name").first()).toContainText("シルバー部門");
});

test("translated event dialogue shows English over the Japanese, Japanese mode keeps Japanese", async ({ page }) => {
  // m920001 魔女を救え！ has a machine translation in data/tl; stage 3 is one of its stages
  await page.goto("/stages/3?tab=dialogue");
  const line = page.locator(".dlg-line", { hasText: "この数の魔物を倒すなんて" }).first();
  await expect(line.locator(".dlg-name")).toHaveText("Cloris");
  await expect(line.locator(".dlg-text [title='machine translated']")).toContainText("monsters");
  await expect(line.locator(".dlg-text .speech-jp")).toContainText("この数の魔物を倒すなんて");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(line.locator(".dlg-text [title='machine translated']")).toHaveCount(0);
});
