import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// Real client screenshots (not committed to web/): unit list, base-unit
// select, gacha result. Recognition runs fully in the page, so this is the
// only test of the canvas path (createImageBitmap -> ImageData -> matcher).
const FIXTURE_DIR = path.resolve("..", "Temp", "test");
const fixtures = fs.existsSync(FIXTURE_DIR)
  ? fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".png")).map((f) => path.join(FIXTURE_DIR, f))
  : [];

test("screenshot import recognizes icons and auto-adds owned units", async ({ page }) => {
  test.skip(fixtures.length === 0, "no screenshots in Temp/test");
  test.setTimeout(420_000);

  await page.goto("/#/collection");
  await expect(page.locator(".collection-progress-row").first()).toContainText("0 /");

  await page.locator(".collection-scan summary").click();
  await page.locator(".collection-scan input[type=file]").setInputFiles(fixtures);

  const note = page.locator(".collection-scan .collection-message");
  await expect(note).toContainText(/Added \d+ units? automatically/, { timeout: 360_000 });

  const text = (await note.innerText()).match(/Added (\d+) units? automatically/);
  const added = Number(text?.[1] ?? 0);
  expect(added).toBeGreaterThanOrEqual(30); // 3 screenshots, ~40+ distinct units

  // auto-added units count toward overall progress without a review step
  // (compare loosely: support/prince cards group differently than raw ids)
  const progress = await page.locator(".collection-progress-row strong").first().innerText();
  expect(Number(progress.split("/")[0].replace(/\D/g, ""))).toBeGreaterThanOrEqual(30);

  // uncertain suggestions (if any) are listed unchecked
  const boxes = page.locator(".collection-scan-tile input[type=checkbox]");
  const uncertain = await boxes.count();
  for (let i = 0; i < uncertain; i += 1) {
    await expect(boxes.nth(i)).not.toBeChecked();
  }

  // reviewing an uncertain match: tick it, apply, and it leaves the list
  if (uncertain > 0) {
    await boxes.first().check();
    await page.getByRole("button", { name: /add 1 selected as owned/ }).click();
    await expect(page.locator(".collection-scan-tile input[type=checkbox]")).toHaveCount(uncertain - 1);
  }
});
