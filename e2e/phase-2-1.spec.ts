import { expect, test, type Page } from "./fixtures/test";
import { chooseRegions } from "./helpers/regions";

test.beforeEach(async ({page}) => {
  await page.clock.install({time: new Date("2026-10-18T15:30:00Z")});
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5eadf"/></svg>'}));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
});
async function total(page: Page, count: number) {
  await expect(page.locator(".map-result-count")).toHaveText(`${count}件を表示`);
  await expect.poll(() => page.locator(".event-pin").evaluateAll(elements=>elements.reduce((sum,e)=>sum+Number(e.getAttribute("data-event-count")),0))).toBe(count);
}

test("UI-007 拡大モードと詳細を同時に破棄してもbodyのロックを残さない", async ({page}) => {
  await page.goto("/e2e/fixtures/map-harness.html?dataset=app", {waitUntil:"domcontentloaded"});
  const original = await page.locator("body").evaluate(e=>({overflow:e.style.overflow,position:e.style.position}));
  await page.getByRole("button", {name:/地図を拡大/}).click();
  await page.locator(".event-pin").first().focus();
  await page.keyboard.press("Enter");
  await page.locator(".location-popup").getByRole("button", {name:"詳細を見る",exact:true}).first().click();
  await expect(page.locator(".detail-dialog")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("position","fixed");
  await page.evaluate(()=>window.dispatchEvent(new Event("test:unmount")));
  await expect(page.locator("#root")).toBeEmpty();
  expect(await page.locator("body").evaluate(e=>({overflow:e.style.overflow,position:e.style.position}))).toEqual(original);
});

test("UI-007 背景固定・内部スクロール・フォーカス循環・Escape・背景クリック", async ({page}) => {
  await page.setViewportSize({width:page.viewportSize()!.width,height:500});
  const opener = page.locator('.event-card[data-event-id="4"]');
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  const before = await page.evaluate(()=>({x:scrollX,y:scrollY}));
  await opener.click();
  const dialog = page.getByRole("dialog",{name:"LOCK & SHARE",exact:true});
  await expect(dialog).toHaveAttribute("aria-modal","true");
  await expect(page.getByRole("button",{name:"詳細を閉じる"})).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("position","fixed");
  expect(await page.locator("body").evaluate(e=>e.style.top)).toBe(`${-before.y}px`);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button",{name:"一覧に戻る",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button",{name:"詳細を閉じる"})).toBeFocused();
  const rect = (await dialog.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.wheel(0,450);
  await expect.poll(()=>dialog.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator("body")).toHaveCSS("position","fixed");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual(before);
  await expect(page.locator("body")).toHaveCSS("position","static");
  await opener.click();
  await page.mouse.click(2,2);
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("UI-008/009 ページ切替でも全ピン・地図・条件・タイルを維持", async ({page}) => {
  await total(page,13);
  await expect(page.locator(".event-card")).toHaveCount(10);
  await expect(page.getByText("全13件中1〜10件を表示",{exact:true})).toBeVisible();
  const initialZoom = Number(await page.locator(".map").getAttribute("data-zoom"));
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  await expect(page.locator(".map")).toHaveAttribute("data-zoom",String(initialZoom + 1));
  await expect.poll(()=>page.locator(".map").evaluate(e=>e.classList.contains("leaflet-zoom-anim"))).toBe(false);
  const before = await page.locator(".map").evaluate(e=>{
    e.querySelector<HTMLElement>(".leaflet-map-pane")!.dataset.identity="retained";
    e.querySelectorAll<HTMLElement>(".event-pin,.leaflet-tile").forEach(el=>el.dataset.identity="retained");
    return {center:e.getAttribute("data-center"),zoom:e.getAttribute("data-zoom"),tiles:e.querySelectorAll(".leaflet-tile").length};
  });
  let tileRequests=0;
  page.on("request",request=>{if(request.url().startsWith("https://tile.openstreetmap.org/")) tileRequests++;});
  await page.getByRole("button",{name:"次へ",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".event-card")).toHaveCount(3);
  await expect(page.getByText("全13件中11〜13件を表示",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"見つかった練習 13件"})).toBeFocused();
  await expect(page.getByRole("button",{name:"次へ",exact:true})).toBeDisabled();
  await total(page,13);
  await expect(page.locator(".map")).toHaveAttribute("data-center",before.center!);
  await expect(page.locator(".map")).toHaveAttribute("data-zoom",before.zoom!);
  await expect(page.locator(".leaflet-map-pane")).toHaveAttribute("data-identity","retained");
  expect(await page.locator('.event-pin:not([data-identity="retained"])').count()).toBe(0);
  expect(await page.locator('.leaflet-tile[data-identity="retained"]').count()).toBe(before.tiles);
  expect(tileRequests).toBe(0);
  await expect(page.getByRole("button",{name:"都道府県を選択",exact:true})).toContainText("東京都");
  await expect(page.getByLabel("ジャンル",{exact:true})).toHaveValue("all");
  await page.getByRole("button",{name:/地図を拡大/}).click();
  await expect(page.getByRole("dialog",{name:"地図拡大モード"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("全13件中11〜13件を表示",{exact:true})).toBeVisible();
  await page.getByLabel("ジャンル",{exact:true}).selectOption("JAZZ");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.getByText("全1件中1〜1件を表示",{exact:true})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"イベント一覧のページ"})).toHaveCount(0);
});

test("UI-010/011 全国15件・東京13件・神奈川2件・空地域とキーボード選択", async ({page}) => {
  await chooseRegions(page,["神奈川県"]);
  await total(page,2);
  await expect(page.locator(".event-card")).toHaveCount(2);
  await page.getByLabel("ジャンル",{exact:true}).selectOption("JAZZ");
  await total(page,1);
  await expect(page.locator(".event-card")).toContainText("YOKOHAMA JAZZ LAB");
  await page.getByRole("button",{name:"条件をリセット"}).click();
  await expect(page.getByRole("button",{name:"都道府県を選択",exact:true})).toContainText("神奈川県");
  await total(page,2);
  await chooseRegions(page,[]);
  await total(page,15);
  await page.getByRole("button",{name:"次へ",exact:true}).click();
  await expect(page.locator(".event-card")).toHaveCount(5);
  const beforeEmpty = await page.locator(".map").getAttribute("data-center");
  await chooseRegions(page,["北海道"]);
  await total(page,0);
  await expect(page.locator(".event-card")).toHaveCount(0);
  await expect(page.getByText("条件に合うイベントがありません",{exact:true})).toBeVisible();
  await expect(page.locator(".map")).toHaveAttribute("data-center",beforeEmpty!);
  await chooseRegions(page,["東京都"]);
  await expect(page.getByText("全13件中1〜10件を表示",{exact:true})).toBeVisible();
  const genre=page.getByLabel("ジャンル",{exact:true});
  await expect(genre.locator('option[value="all"]')).toHaveText("すべてのジャンル");
  await genre.selectOption({value:"ALL STYLE"});
  await total(page,1);
  await expect(page.locator(".event-card")).toContainText("SMALL CIRCLE BATTLE");
  await genre.selectOption("all");
  await total(page,13);
});

test("UI-009 拡大地図で別ページのイベントを選択・詳細確認", async ({page}) => {
  await page.getByRole("button",{name:/地図を拡大/}).click();
  const pins=page.locator(".event-pin");
  let found=false;
  for(let index=0;index<await pins.count();index++) {
    await pins.nth(index).focus();
    await page.keyboard.press("Enter");
    const target=page.locator('.location-popup [data-event-id="14"]');
    if(await target.count()) {
      await target.getByRole("button",{name:"詳細を見る",exact:true}).click();
      found=true; break;
    }
  }
  expect(found).toBe(true);
  await expect(page.getByRole("dialog",{name:"LOCK EVENING",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog",{name:"地図拡大モード"})).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow","hidden");
  await page.getByRole("button",{name:/通常表示に戻る/}).click();
  await expect(page.locator('.event-card[data-event-id="14"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.getByText("全13件中11〜13件を表示",{exact:true})).toBeVisible();
});
