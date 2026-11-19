import { expect, test } from "@playwright/test";

test("the language toggle switches the site to Japanese and is remembered", async ({ page }) => {
  await page.goto("/units/101");
  await expect(page.locator("h2").first()).toContainText("Shizuka");
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("link", { name: "ユニット" }).first()).toBeVisible();
  await expect(page.locator("h2").first()).toContainText("姫侍シズカ");
  await expect(page.getByRole("tab", { name: "スキル" })).toBeVisible();
  await page.reload();
  await expect(page.locator("h2").first()).toContainText("姫侍シズカ");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.locator("h2").first()).toContainText("Shizuka");
});
