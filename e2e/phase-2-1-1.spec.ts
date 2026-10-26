import { expect, test, type Page } from "./fixtures/test";
import { chooseRegions } from "./helpers/regions";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-18T15:30:00Z") });
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
});
async function total(page: Page, count: number) {
  await expect(page.locator(".map-result-count")).toHaveText(`${count}件を表示`);
  await expect.poll(() => page.locator(".event-pin").evaluateAll(nodes => nodes.reduce((n, e) => n + Number(e.getAttribute("data-event-count")), 0))).toBe(count);
}
async function view(page: Page) {
  return page.locator(".map").evaluate(e => ({center:e.getAttribute("data-center"),zoom:e.getAttribute("data-zoom")}));
}

test("ジャンル名称修正：all・FREESTYLE・ALL STYLEを区別し、県/日時を維持", async ({ page }) => {
  await chooseRegions(page,["東京都","神奈川県"]);
  const genre=page.getByLabel("ジャンル",{exact:true});
  await expect(genre).toHaveValue("all");
  await expect(genre.locator('option[value="all"]')).toHaveText("すべてのジャンル");
  await expect(genre.locator('option[value="ALL STYLE"]')).toHaveText("ALL STYLE");
  await genre.selectOption("FREESTYLE");
  await total(page,2);
  await expect(page.locator('.event-card[data-event-id="12"]')).toBeVisible();
  await expect(page.locator('.event-card[data-event-id="16"]')).toBeVisible();
  await genre.selectOption("ALL STYLE");
  await total(page,1);
  await expect(page.locator('.event-card[data-event-id="7"]')).toBeVisible();
  await genre.selectOption({label:"すべてのジャンル"});
  await total(page,15);
  await page.getByRole("button",{name:/日付 日本時間/}).click();
  await page.getByRole("button",{name:"翌月へ",exact:true}).click();
  await page.getByRole("button",{name:"2026年11月01日",exact:true}).click();
  await total(page,8);
  await genre.selectOption("FREESTYLE");
  await total(page,2);
  await genre.selectOption("all");
  await total(page,8);
  await expect(page.getByRole("button",{name:"都道府県を選択",exact:true})).toContainText("東京都・神奈川県");
  await expect(page.getByRole("button",{name:/日付 日本時間/})).toContainText("2026 / 11 / 01");
});

test("UI-014 OR地域検索・全解除・ジャンル日時とのAND検索", async ({ page }) => {
  await total(page,13);
  await chooseRegions(page,["東京都","神奈川県"]);
  await total(page,15);
  await page.getByLabel("ジャンル",{exact:true}).selectOption("JAZZ");
  await total(page,2);
  await page.getByRole("button",{name:"条件をリセット",exact:true}).click();
  await total(page,15);
  await page.getByRole("button",{name:/日付 日本時間/}).click();
  await page.getByRole("button",{name:"翌月へ",exact:true}).click();
  await page.getByRole("button",{name:"2026年11月01日",exact:true}).click();
  await total(page,8);
  await page.getByLabel("ジャンル",{exact:true}).selectOption("JAZZ");
  await total(page,2);
  await page.getByRole("button",{name:"条件をリセット",exact:true}).click();
  await chooseRegions(page,["東京都","千葉県"]);
  await total(page,13);
  await chooseRegions(page,["神奈川県"]);
  await total(page,2);
  await page.getByRole("button",{name:"都道府県を選択",exact:true}).click();
  await page.getByRole("checkbox",{name:"神奈川県",exact:true}).uncheck();
  await expect(page.getByRole("checkbox",{name:"全国",exact:true})).toBeChecked();
  await page.getByRole("button",{name:"閉じる",exact:true}).click();
  await total(page,15);
});

test("UI-014 検索パネルの文字検索・キーボード・タッチ・拡大モード維持", async ({ page }, info) => {
  await page.getByRole("button",{name:/地図を拡大/}).click();
  const trigger=page.getByRole("button",{name:"都道府県を選択",exact:true});
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"都道府県を選択",exact:true});
  const search=dialog.getByLabel("都道府県を検索");
  await expect(search).toBeFocused();
  await search.fill("神奈");
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  const checkbox=dialog.getByRole("checkbox",{name:"神奈川県",exact:true});
  if(info.project.name.startsWith("mobile")) await checkbox.tap();
  else { await checkbox.focus(); await page.keyboard.press("Space"); }
  await total(page,15);
  await expect(dialog.getByRole("status")).toContainText("東京都・神奈川県");
  await search.fill("架空県");
  await expect(dialog.getByText("一致する都道府県がありません。",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"全選択解除",exact:true}).click();
  await expect(dialog.getByRole("checkbox",{name:"全国",exact:true})).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog",{name:"地図拡大モード",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await total(page,15);
});

test("UI-014 地域だけ範囲調整・ページは中心倍率保持・0件は地図維持", async ({ page }) => {
  await chooseRegions(page,["東京都","神奈川県"]);
  await total(page,15);
  const before=await view(page);
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  await expect(page.locator(".event-card")).toHaveCount(5);
  expect(await view(page)).toEqual(before);
  await total(page,15);
  await chooseRegions(page,["神奈川県"]);
  await total(page,2);
  expect(await view(page)).not.toEqual(before);
  const kanagawa=await view(page);
  await chooseRegions(page,["千葉県"]);
  await total(page,0);
  expect(await view(page)).toEqual(kanagawa);
  await chooseRegions(page,["東京都","神奈川県"]);
  await expect(page.getByText("全15件中1〜10件を表示",{exact:true})).toBeVisible();
});

test("UI-013 画面内の一覧選択は強調のみ・詳細とスクロール固定維持", async ({ page }) => {
  await page.getByLabel("ジャンル",{exact:true}).selectOption("HIP HOP");
  const before=await view(page);
  await page.locator('.event-card[data-event-id="1"]').click();
  await expect(page.locator(".detail-dialog")).toBeVisible();
  await expect(page.locator(".map")).toHaveAttribute("data-selection-pan","none");
  expect(await view(page)).toEqual(before);
  await expect(page.locator("body")).toHaveCSS("position","fixed");
  await page.keyboard.press("Escape");
  await expect(page.locator('.event-pin.is-selected')).toHaveCount(1);
});

for(const reduced of [false,true]) {
  test(`UI-013 画面外の一覧選択はズームを維持して移動（減らす設定${reduced}）`, async ({ page }) => {
    await page.emulateMedia({reducedMotion:reduced?"reduce":"no-preference"});
    // Leafletの公開キーボード操作で表示位置をずらす。内部インスタンスは操作しない。
    const map=page.locator(".map");
    await map.focus();
    for(let i=0;i<8;i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); }
    const before=await view(page);
    await page.locator('.event-card[data-event-id="4"]').click();
    await expect(page.locator(".detail-dialog")).toBeVisible();
    await expect(map).toHaveAttribute("data-selection-pan",reduced?"instant":"animated");
    await expect(map).not.toHaveAttribute("data-center",before.center!);
    await expect(map).toHaveAttribute("data-zoom",before.zoom!);
    await page.keyboard.press("Escape");
    const pin=page.locator(".event-pin.is-selected");
    await expect(pin).toHaveCount(1);
    await expect.poll(async () => {
      const a=(await map.boundingBox())!, b=(await pin.boundingBox())!;
      return b.x>a.x && b.y>a.y && b.x+b.width<a.x+a.width && b.y+b.height<a.y+a.height;
    }).toBe(true);
  });
}

test("UI-013 拡大地図・同地点/密集イベント選択は再フィットせず正しい詳細", async ({ page }) => {
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  const initial=await view(page);
  await page.locator('.event-card[data-event-id="14"]').click();
  await expect(page.getByRole("dialog",{name:"LOCK EVENING",exact:true})).toBeVisible();
  await expect(page.locator(".map")).toHaveAttribute("data-zoom",initial.zoom!);
  await page.keyboard.press("Escape");
  await expect(page.getByText("全13件中11〜13件を表示",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"都道府県を選択",exact:true})).toContainText("東京都");
  await expect(page.getByLabel("ジャンル",{exact:true})).toHaveValue("all");
  await page.getByRole("button",{name:/地図を拡大/}).click();
  const pins=page.locator(".event-pin");
  let found=false;
  for(let i=0;i<await pins.count();i++) {
    await pins.nth(i).focus(); await page.keyboard.press("Enter");
    const target=page.locator('.location-popup [data-event-id="2"]');
    if(await target.count()) {
      // ポップアップを収める最小パンが完了した後、イベントを選択する。
      await page.waitForTimeout(400);
      const before=await view(page);
      await target.getByRole("button",{name:"このイベントを選択",exact:true}).click();
      expect(await view(page)).toEqual(before);
      await target.getByRole("button",{name:"詳細を見る",exact:true}).click();
      await expect(page.getByRole("dialog",{name:"HOUSE MUSIC, GOOD PEOPLE",exact:true})).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog",{name:"地図拡大モード",exact:true})).toBeVisible();
      await expect(page.locator(".map")).toHaveAttribute("data-zoom",before.zoom!);
      found=true; break;
    }
  }
  expect(found).toBe(true);
});
