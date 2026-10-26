import { expect, test, type Page } from "./fixtures/test";
import { denseEvents } from "./fixtures/denseEvents";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-18T15:30:00Z") });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5eadf"/></svg>',
    }),
  );
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
});
const harness = "/e2e/fixtures/map-harness.html";
async function assertTotal(page: Page, count: number) {
  await expect(page.locator(".map-result-count")).toHaveText(
    `${count}件を表示`,
  );
  await expect
    .poll(() =>
      page
        .locator(".event-pin")
        .evaluateAll((elements) =>
          elements.reduce(
            (sum, element) =>
              sum + Number(element.getAttribute("data-event-count")),
            0,
          ),
        ),
    )
    .toBe(count);
}
test("UI-004 近接10件と同座標5件を15件と明記し、遠方1件も失わない", async ({
  page,
}) => {
  // 15件の開閉と初回のローカルモジュール読み込みを含むため、単操作より長い上限です。
  test.setTimeout(180000);
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  await assertTotal(page, 16);
  const cluster = page.getByRole("button", {
    name: "近接イベント15件（数字はイベント件数）",
  });
  await expect(cluster).toBeVisible();
  await expect(cluster.locator("small")).toHaveText("イベント");
  await cluster.click();
  await expect(page.locator(".location-popup .location-event")).toHaveCount(15);
  for (const event of denseEvents.filter((event) => event.id !== "far-1")) {
    const item = page.locator(
      '.location-popup [data-event-id="' + event.id + '"]',
    );
    await expect(item).toContainText(event.title);
    await item.getByRole("button", { name: "詳細を見る", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(event.description);
    await page.getByRole("button", { name: "詳細を閉じる" }).click();
  }
  await page.getByRole("button", {name:"次へ",exact:true}).click();
  await page.locator('.event-card[data-event-id="far-1"]').click();
  await expect(page.getByRole("dialog")).toContainText("far-1の説明");
});
test("UI-004 同地点5件は全て個別に選択でき、ジャンル・一覧と対応する", async ({
  page,
}) => {
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  await page.getByLabel("イベント種別", { exact: true }).selectOption("練習会");
  await assertTotal(page, 5);
  await expect(page.locator(".cluster-pin")).toHaveCount(0);
  await expect(page.locator(".pin-shared-badge")).toHaveCount(1);
  await page.getByRole("button", { name: /同じ場所のイベント：/ }).click();
  for (const event of denseEvents.filter((event) =>
    event.id.startsWith("same-"),
  )) {
    await page
      .locator('.location-popup [data-event-id="' + event.id + '"]')
      .getByRole("button", { name: "このイベントを選択" })
      .click();
    await expect(
      page.locator('.event-card[data-event-id="' + event.id + '"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('.location-popup [data-event-id="' + event.id + '"]'),
    ).toHaveClass(/is-selected/);
    await expect(page.locator(".event-pin.is-selected")).toHaveCount(1);
  }
});
test("UI-004 ズーム・絞り込み・0件で件数と選択を保持・更新する", async ({
  page,
}) => {
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /近接イベント15件/ }).click();
  await page
    .locator('.location-popup [data-event-id="near-1"]')
    .getByRole("button", { name: "このイベントを選択" })
    .click();
  await expect(page.locator(".cluster-pin.is-selected")).toHaveCount(1);
  await page.getByRole("button", { name: "この範囲を拡大" }).click();
  await assertTotal(page, 16);
  await expect(
    page.locator('.event-card[data-event-id="near-1"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("ジャンル", { exact: true }).selectOption("HIP HOP");
  await assertTotal(page, 4);
  await expect(page.locator(".event-card")).toHaveCount(4);
  await page.getByLabel("イベント種別", { exact: true }).selectOption("バトル");
  await assertTotal(page, 0);
  await expect(page.locator(".event-pin")).toHaveCount(0);
  await expect(page.locator(".location-popup")).toHaveCount(0);
});
test("PERF-001 ズーム時にReactコミットと地図・同構成マーカーの再生成がない", async ({
  page,
}) => {
  await page.goto(harness, { waitUntil: "domcontentloaded" });
  await assertTotal(page, 16);
  const pane = page.locator(".leaflet-map-pane"),
    cluster = page.locator(".cluster-pin"),
    far = page.locator(".event-pin:not(.cluster-pin)");
  await pane.evaluate((element) => {
    (element as HTMLElement).dataset.identity = "original";
  });
  await cluster.evaluate((element) => {
    (element as HTMLElement).dataset.identity = "original";
  });
  await far.evaluate((element) => {
    (element as HTMLElement).dataset.identity = "original";
  });
  const commits = await page
    .locator("#map-metrics")
    .getAttribute("data-commits");
  const previousZoom = await page.locator(".map").getAttribute("data-zoom");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".map")).not.toHaveAttribute(
    "data-zoom",
    previousZoom!,
  );
  await expect
    .poll(() =>
      page
        .locator(".map")
        .evaluate(
          (element) => !element.classList.contains("leaflet-zoom-anim"),
        ),
    )
    .toBe(true);
  await assertTotal(page, 16);
  await expect(pane).toHaveAttribute("data-identity", "original");
  await expect(cluster).toHaveAttribute("data-identity", "original");
  await expect(far).toHaveAttribute("data-identity", "original");
  await expect(page.locator("#map-metrics")).toHaveAttribute(
    "data-commits",
    commits!,
  );
});

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
  );
}
test("UI-005 既存の＋－とモバイルのピンチ操作を維持する", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const map = page.locator(".map");
  await expect(map).toHaveAttribute("data-zoom", /^\d+$/);
  let before = await map.getAttribute("data-zoom");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(map).not.toHaveAttribute("data-zoom", before!);
  before = await map.getAttribute("data-zoom");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(map).not.toHaveAttribute("data-zoom", before!);
  if (testInfo.project.name.startsWith("mobile")) {
    await map.scrollIntoViewIfNeeded();
    const rect = (await map.boundingBox())!,
      x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const session = await page.context().newCDPSession(page);
    const points = (distance: number) => [
      { x: x - distance, y, id: 0 },
      { x: x + distance, y, id: 1 },
    ];
    before = await map.getAttribute("data-zoom");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(30),
    });
    for (const distance of [36, 44, 52, 60, 70])
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: points(distance),
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(map).not.toHaveAttribute("data-zoom", before!);
    await session.detach();
  }
  await assertTotal(page, 13);
});
for (const width of [375, 768, 1280, 1920])
  for (const expanded of [false, true]) {
    test(`UI-006 幅${width}px ${expanded ? "拡大" : "通常"}で件数・ズーム・凡例・検索が干渉しない`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 960 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      if (expanded)
        await page.getByRole("button", { name: /地図を拡大/ }).click();
      const selectors = [
        ".map-result-count",
        ".leaflet-control-zoom",
        ".map-legend",
        ".search-panel",
        ".map-header",
      ];
      const boxes = await Promise.all(
        selectors.map((selector) => page.locator(selector).boundingBox()),
      );
      for (const [a, b] of [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
        [2, 3],
        [4, 1],
      ]) {
        if (boxes[a] && boxes[b])
          expect(intersects(boxes[a]!, boxes[b]!)).toBe(false);
      }
      if (expanded && width === 375) {
        await page.getByRole("button", { name: "検索条件を開く" }).click();
        const panel = await page.locator(".search-panel").boundingBox();
        for (const selector of [
          ".map-header",
          ".leaflet-control-zoom",
          ".map-legend",
        ])
          expect(
            intersects(panel!, (await page.locator(selector).boundingBox())!),
          ).toBe(false);
      }
      await page
        .getByLabel("ジャンル", { exact: true })
        .selectOption("HIP HOP");
      await assertTotal(page, 1);
      await page
        .getByLabel("イベント種別", { exact: true })
        .selectOption("バトル");
      await assertTotal(page, 0);
      if (expanded && width === 375)
        await page.getByRole("button", { name: "検索条件を閉じる" }).click();
      const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
      if (width === 375 && testInfo.project.name.startsWith("mobile"))
        await zoomIn.tap();
      else await zoomIn.click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
