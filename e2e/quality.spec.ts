import { expect, test, type Page } from "./fixtures/test";
import { waitForMapStable } from "./helpers/mapStability";

test.beforeEach(async ({ page }) => {
  // JSTでは10/19、LAでは10/18となる瞬間に固定し、端末日付への依存を検出します。
  // Dateを止めるとLeafletのパンが完了しないため、基準日時を設定して時計は進めます。
  await page.clock.install({ time: new Date("2026-10-18T15:30:00Z") });
  // E2Eは外部タイル配信・フォントに依存させません。実際のOSM表示は別途ブラウザで確認。
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5eadf"/></svg>',
    }),
  );
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
});
const dateButton = (page: Page) =>
  page.getByRole("button", { name: /日付 日本時間/ });
async function chooseDate(page: Page, date = "2026年10月24日") {
  await dateButton(page).click();
  await page.getByRole("button", { name: date, exact: true }).click();
}
async function expand(page: Page) {
  await page.getByRole("button", { name: "地図を拡大", exact: false }).click();
  await expect(
    page.getByRole("dialog", { name: "地図拡大モード" }),
  ).toBeVisible();
}
async function showMobileSearch(page: Page) {
  const toggle = page.getByRole("button", {
    name: "検索条件を開く",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
}
async function expectMapCovered(page: Page) {
  // DOMの大きさだけでなく、Leafletが新しい表示領域の四隅へタイルを配置したか確認。
  await expect
    .poll(() =>
      page.locator(".map").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const tiles = Array.from(
          element.querySelectorAll(".leaflet-tile-loaded"),
        ).map((tile) => tile.getBoundingClientRect());
        return [
          [rect.left + 2, rect.top + 2],
          [rect.right - 2, rect.top + 2],
          [rect.left + 2, rect.bottom - 2],
          [rect.right - 2, rect.bottom - 2],
        ].map(([x, y]) =>
          tiles.some(
            (tile) =>
              tile.left <= x &&
              tile.right >= x &&
              tile.top <= y &&
              tile.bottom >= y,
          ),
        );
      }),
    )
    .toEqual([true, true, true, true]);
}
async function revealIndividualMarkers(page: Page) {
  await expect(page.locator(".map")).toHaveAttribute("data-zoom", /^\d+$/);
  // Phase 1.2では近接地点が集約されるので、個別ピンの既存検証は拡大してから行います。
  for (
    let attempt = 0;
    attempt < 8 && (await page.locator(".cluster-pin").count()) > 0;
    attempt++
  ) {
    const previousZoom = await page.locator(".map").getAttribute("data-zoom");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.locator(".map")).not.toHaveAttribute(
      "data-zoom",
      previousZoom!,
    );
    await expect.poll(() => page.locator(".map").evaluate(element => element.classList.contains("leaflet-zoom-anim"))).toBe(false);
  }
  await expect(page.locator(".cluster-pin")).toHaveCount(0);
  // 近接イベントの追加により高倍率まで拡大するため、焦点を当てて対象ピンへパンします。
  await page.getByRole("button", { name: /同じ場所のイベント：/ }).focus();
}

test("UI-001 JSTの過去日を無効化し、今日・明日・月末・翌年をカレンダーで選べる", async ({
  page,
}) => {
  await dateButton(page).click();
  await expect(
    page.getByRole("button", { name: "2026年10月18日", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "2026年10月19日", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "今日を選択" }).click();
  await expect(dateButton(page)).toContainText("2026 / 10 / 19");
  await chooseDate(page, "2026年10月20日");
  await expect(dateButton(page)).toContainText("2026 / 10 / 20");
  await chooseDate(page, "2026年10月31日");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await dateButton(page).click();
  await page.getByRole("button", { name: "翌年へ" }).click();
  await expect(
    page.getByRole("table", { name: "2027年10月", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "前年へ" }).click();
  await page.getByRole("button", { name: "翌月へ" }).click();
  await page.getByRole("button", { name: "翌月へ" }).click();
  await page
    .getByRole("button", { name: "2026年12月31日", exact: true })
    .click();
  await expect(dateButton(page)).toContainText("2026 / 12 / 31");
});
test("UI-001 うるう年に2月29日があり、2月30日を生成しない", async ({
  page,
}) => {
  await dateButton(page).click();
  await page.getByRole("button", { name: "翌年へ" }).click();
  await page.getByRole("button", { name: "翌年へ" }).click();
  for (let i = 0; i < 8; i++)
    await page.getByRole("button", { name: "前月へ" }).click();
  await expect(
    page.getByRole("button", { name: "2028年02月29日", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "2028年02月30日", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "2028年02月29日", exact: true })
    .click();
  await expect(dateButton(page)).toContainText("2028 / 02 / 29");
});
test("UI-001 15分選択・日付単独・時間片側・深夜検索が即時反映される", async ({
  page,
}) => {
  await chooseDate(page);
  await expect(page.locator(".event-card")).toHaveCount(4);
  const start = page.getByLabel("開始時間", { exact: true }),
    end = page.getByLabel("終了時間", { exact: true });
  await expect(start.locator("option")).toHaveCount(97);
  await expect(start.locator("option").last()).toHaveText("23:45");
  await start.selectOption("23:45");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await end.selectOption("00:15");
  await expect(page.locator(".event-card")).toContainText(
    "MIDNIGHT POP SESSION",
  );
  await end.selectOption("23:45");
  await expect(page.getByRole("alert")).toContainText("異なる");
  await expect(page.locator(".event-pin")).toHaveCount(0);
  await start.selectOption("");
  await end.selectOption("01:00");
  await chooseDate(page, "2026年10月25日");
  await expect(page.locator(".event-card")).toContainText(
    "MIDNIGHT POP SESSION",
  );
  await page.getByRole("button", { name: "日付をクリア" }).click();
  await expect(page.getByRole("alert")).toContainText("日付");
  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.locator(".event-card")).toHaveCount(10);
});
test("UI-001 カレンダーを矢印・Enter・Escapeで操作できる", async ({ page }) => {
  await dateButton(page).click();
  await expect(
    page.getByRole("button", { name: "2026年10月19日", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "2026年10月20日", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dateButton(page)).toContainText("2026 / 10 / 20");
  await expect(dateButton(page)).toBeFocused();
  await dateButton(page).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "日付カレンダー" })).toHaveCount(
    0,
  );
});
test("UI-002 凡例とピンの色・文字が一致し番号がない", async ({ page }) => {
  await revealIndividualMarkers(page);
  const legend = page.getByLabel("ジャンル別マーカーの凡例");
  for (const key of ["breaking", "hiphop", "pop", "lock", "other"]) {
    const pin = page.locator('.event-pin[data-genre="' + key + '"]').first();
    const legendSymbol = legend.locator(
      '[data-genre="' + key + '"] .legend-symbol',
    );
    await expect(pin.locator("b")).toHaveText(await legendSymbol.innerText());
    expect(
      await pin
        .locator(".pin-face")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(
      await legendSymbol.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
  }
  await expect(page.locator(".event-pin")).toHaveCount(12);
  expect(
    (await page.locator(".event-pin b").allTextContents()).every(
      (text) => !/[0-9]/.test(text),
    ),
  ).toBe(true);
});
test("UI-002 同地点の全イベントを確認し、ピンと一覧の選択が連動する", async ({
  page,
}) => {
  await revealIndividualMarkers(page);
  await page.getByRole("button", { name: /同じ場所のイベント：/ }).click();
  const popup = page.locator(".location-popup");
  await expect(popup).toContainText("放課後 HIP HOP PRACTICE");
  await expect(popup).toContainText("HOUSE MUSIC, GOOD PEOPLE");
  await popup
    .locator('[data-event-id="2"]')
    .getByRole("button", { name: "このイベントを選択" })
    .click();
  await expect(page.locator('.event-card[data-event-id="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".event-pin.is-selected")).toHaveCount(1);
  await expect(page.locator(".event-pin.is-selected b")).toHaveText("他");
  await page.locator('.event-card[data-event-id="5"]').click();
  await expect(page.getByRole("dialog")).toContainText("MIDNIGHT POP SESSION");
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await expect(page.locator('.event-pin[data-genre="pop"]')).toHaveClass(
    /is-selected/,
  );
});
test("UI-002 絞り込みで同地点の別イベントやgroupが残らない", async ({
  page,
}) => {
  await page.getByLabel("ジャンル", { exact: true }).selectOption("HIP HOP");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.locator(".event-pin")).toHaveCount(1);
  await expect(page.locator(".pin-shared-badge")).toHaveCount(0);
  await page.getByRole("button", { name: /HIPHOP：/ }).click();
  await expect(page.locator(".location-popup")).not.toContainText(
    "HOUSE MUSIC",
  );
  await expect(page.locator(".location-popup")).not.toContainText("サークル内");
  await page.getByLabel("イベント種別", { exact: true }).selectOption("バトル");
  await expect(page.locator(".event-pin")).toHaveCount(0);
  await expect(page.getByText("条件に合うイベントがありません")).toBeVisible();
});
test("UI-003 拡大中に検索し、条件・選択・描画領域を維持して戻れる", async ({
  page,
}) => {
  await revealIndividualMarkers(page);
  await page.getByRole("button", { name: /同じ場所のイベント：/ }).click();
  const marker = page.locator(".event-pin.is-selected");
  await expect(marker).toHaveCount(1);
  await expectMapCovered(page);
  // クラスだけでは連続パンの終了を判断できない。移動・サイズ変更の安定後に測る。
  await waitForMapStable(marker);
  const before = await marker.evaluate((element) => {
    const pin = element.getBoundingClientRect(),
      map = element.closest(".map")!.getBoundingClientRect();
    return {
      x: pin.left + 22 - map.left - map.width / 2,
      y: pin.top + 44 - map.top - map.height / 2,
    };
  });
  await expand(page);
  await waitForMapStable(marker);
  await expect
    .poll(() =>
      marker.evaluate((element, previous) => {
        const pin = element.getBoundingClientRect(),
          map = element.closest(".map")!.getBoundingClientRect();
        return (
          Math.abs(pin.left + 22 - map.left - map.width / 2 - previous.x) < 3 &&
          Math.abs(pin.top + 44 - map.top - map.height / 2 - previous.y) < 3
        );
      }, before),
    )
    .toBe(true);
  await showMobileSearch(page);
  await expect(page.getByLabel("ジャンル", { exact: true })).toBeVisible();
  await page.getByLabel("ジャンル", { exact: true }).selectOption("HIP HOP");
  await expect(page.locator(".event-pin")).toHaveCount(1);
  await expect(marker).toHaveCount(1);
  await page.getByRole("button", { name: /通常表示に戻る/ }).click();
  await expect(page.getByLabel("ジャンル", { exact: true })).toHaveValue(
    "HIP HOP",
  );
  await expect(page.locator('.event-card[aria-pressed="true"]')).toHaveCount(1);
  const size = await page.locator(".map").evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  expect(size.width).toBeGreaterThan(200);
  expect(size.height).toBeGreaterThan(300);
  await expectMapCovered(page);
});
test("UI-003 画面領域いっぱいに拡大しEscapeで終了、フォーカスを戻す", async ({
  page,
}) => {
  await expand(page);
  const bounds = await page
    .getByRole("dialog", { name: "地図拡大モード" })
    .boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(page.viewportSize()!.width);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("dialog", { name: "地図拡大モード" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "地図拡大モード" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /地図を拡大/ })).toBeFocused();
});
test("UI-003 カレンダーのEscapeは拡大モードを維持し、Tab移動が外へ抜けない", async ({
  page,
}) => {
  await expand(page);
  await showMobileSearch(page);
  await dateButton(page).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "日付カレンダー" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog", { name: "地図拡大モード" }),
  ).toBeVisible();
  // 通常時の背景はinert、拡大ワークスペースの先頭でShift+Tabすると末尾へ循環します。
  await page.getByRole("dialog", { name: "地図拡大モード" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page
      .locator(".workspace-expanded")
      .evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "地図拡大モード" }),
  ).toHaveCount(0);
});
test("UI-003 レスポンシブ検索パネルと地図サイズの再計算", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  await expand(page);
  if (mobile)
    await expect(
      page.getByRole("complementary", { name: "イベント検索条件" }),
    ).toBeHidden();
  await showMobileSearch(page);
  await chooseDate(page);
  await page.getByLabel("開始時間", { exact: true }).selectOption("23:45");
  await expect(page.locator(".event-pin")).toHaveCount(1);
  if (mobile) {
    await page.getByRole("button", { name: "検索条件を閉じる" }).click();
    await expect(
      page.getByRole("complementary", { name: "イベント検索条件" }),
    ).toBeHidden();
  }
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(page.locator(".map")).toHaveJSProperty("clientWidth", 472);
  await expectMapCovered(page);
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});
