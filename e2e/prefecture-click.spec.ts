import { expect, test } from "./fixtures/test";
import { chooseRegions } from "./helpers/regions";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-18T15:30:00Z") });
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
});
for (const target of ["都道府県名", "下向き矢印"] as const) {
  test(`UI-012 ${target}をクリックしてメニューを開き、地域とページを切り替える`, async ({ page }) => {
    const region = page.getByRole("button", { name: "都道府県を選択", exact: true });
    await expect(region).toContainText("東京都");
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    const box = (await region.boundingBox())!;
    await region.click({ position: { x: target === "下向き矢印" ? box.width - 8 : 20, y: box.height / 2 } });
    const dialog = page.getByRole("dialog", { name: "都道府県を選択", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(48);
    await dialog.getByRole("checkbox", { name: "全国", exact: true }).check();
    const kanagawa = dialog.getByRole("checkbox", { name: "神奈川県", exact: true });
    await kanagawa.focus();
    await page.keyboard.press("Space");
    await expect(kanagawa).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(region).toBeFocused();
    await expect(region).toContainText("神奈川県");
    await expect(page.locator(".map-result-count")).toHaveText("2件を表示");
    await expect(page.locator(".event-card")).toHaveCount(2);
    const center = await page.locator(".map").getAttribute("data-center");
    await chooseRegions(page, ["東京都"]);
    await expect(page.locator(".map-result-count")).toHaveText("13件を表示");
    await expect(page.locator(".map")).not.toHaveAttribute("data-center", center!);
    await expect(page.getByText("全13件中1〜10件を表示", { exact: true })).toBeVisible();
    await chooseRegions(page, []);
    await expect(region).toContainText("全国");
    await expect(page.locator(".map-result-count")).toHaveText("15件を表示");
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    await expect(page.locator(".event-card")).toHaveCount(5);
  });
}
test("UI-012 拡大モードでもクリック・タップで開いて選択できる", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: /地図を拡大/ }).click();
  const region = page.getByRole("button", { name: "都道府県を選択", exact: true });
  if (testInfo.project.name.startsWith("mobile")) await region.tap(); else await region.click();
  const dialog = page.getByRole("dialog", { name: "都道府県を選択", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "全国", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "神奈川県", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "地図拡大モード", exact: true })).toBeVisible();
  await expect(page.locator(".map-result-count")).toHaveText("2件を表示");
  await page.getByRole("button", { name: /通常表示に戻る/ }).click();
  await expect(page.locator(".event-card")).toHaveCount(2);
});
