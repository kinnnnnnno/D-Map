import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const bug027: { runs: { input: string; flaskJson: { latitude: number; longitude: number }[] }[] } = JSON.parse(readFileSync("docs/fixtures/bug027-synthetic-trace.json", "utf8"));

async function openEditor(page: Page, project: string) {
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  await page.goto("/");
  const token = (await (await page.request.get("/api/auth/session")).json()).csrfToken;
  const registration = await page.request.post("/api/auth/register", { headers: { "X-CSRFToken": token }, data: { email: `location-${Date.now()}-${project}@example.invalid`, password: "test-password-123", dancerName: "場所指定の架空利用者" } });
  expect(registration.status()).toBe(201);
  await page.reload();
  await page.getByRole("button", { name: "場所指定の架空利用者 / アカウント", exact: true }).click();
  await page.getByRole("button", { name: "イベント管理", exact: true }).click();
  await page.getByRole("button", { name: "イベント作成", exact: true }).click();
  return page.getByRole("dialog", { name: "イベント作成", exact: true });
}

test("UI-016 住所検索・候補のキーボード選択・調整・保存・編集", async ({ page }, info) => {
  let searches = 0;
  await page.route("**/api/geocode", async route => { searches++; expect(route.request().postDataJSON()).toEqual({ query: "東京都渋谷区テスト1-2-3" }); await route.fulfill({ json: [{ label: "東京都渋谷区テスト1-2-3（架空施設）", latitude: 35.69, longitude: 139.7, prefecture: "東京都", accuracy: "unknown" }] }); });
  const editor = await openEditor(page, info.project.name);
  await expect(editor.locator('input[name="latitude"],input[name="longitude"]')).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
  await editor.getByLabel("開催場所の住所", { exact: true }).fill("東京都渋谷区テスト1-2-3");
  expect(searches).toBe(0);
  await editor.getByRole("button", { name: "住所を検索", exact: true }).focus();
  // CSRF取得→検索応答と、応答後の描画を別々に検証する。固定時間は待たない。
  const [searchResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/api/geocode") && response.request().method() === "POST"),
    editor.getByRole("button", { name: "住所を検索", exact: true }).press("Enter"),
  ]);
  expect(searchResponse.status()).toBe(200);
  await expect(editor.locator(".location-map")).toHaveAttribute("data-latitude", "35.69");
  await expect(editor.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
  const result = editor.getByRole("list", { name: "開催場所の検索候補" }).getByRole("button");
  await result.focus(); await result.press("Enter");
  const map = editor.locator(".location-map");
  await expect(map).toHaveAttribute("data-latitude", "35.69");
  await expect(map.locator(".location-pin")).toBeVisible();
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).toContainText("照合用の所在地住所：東京都渋谷区テスト1-2-3");
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).toContainText("精度不明");
  await expect.poll(()=>map.evaluate(element=>{
    const rect=element.getBoundingClientRect(),pin=element.querySelector(".location-pin")!.getBoundingClientRect();
    return Math.abs(pin.left+22-rect.left-rect.width/2)<3&&Math.abs(pin.top+40-rect.top-rect.height/2)<3;
  })).toBe(true);
  await editor.getByRole("button", { name: "東へ約50m", exact: true }).click();
  const longitude = Number(await map.getAttribute("data-longitude"));
  expect(longitude).toBeGreaterThan(139.7);
  const title = `場所指定の架空イベント${Date.now()}`;
  for (const [label, value] of [["イベント名", title], ["開始日時（日本時間）", "2030-05-01T15:00"], ["終了日時（日本時間）", "2030-05-01T18:00"], ["施設名・会場名", "架空施設"], ["参加条件", "テスト用"], ["説明", "実在しないイベント"]]) await editor.getByLabel(label, { exact: true }).fill(value);
  await expect(editor.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "この位置で確定する", exact: true }).click();
  const saved = page.waitForResponse(response => response.url().endsWith("/api/events") && response.request().method() === "POST");
  await editor.getByRole("button", { name: "保存する", exact: true }).click();
  const response = await saved; expect(response.status()).toBe(201); const event = await response.json();
  try {
    expect(event.latitude).toBe(35.69); expect(event.longitude).toBeCloseTo(longitude, 7);
    await expect(editor).not.toBeVisible();
    const row = page.getByRole("dialog", { name: "アカウント", exact: true }).getByRole("listitem").filter({ hasText: title });
    await row.getByRole("button", { name: "編集", exact: true }).click();
    const editing = page.getByRole("dialog", { name: "イベント編集", exact: true });
    await expect(editing.locator(".location-map")).toHaveAttribute("data-longitude", String(event.longitude));
    await expect(editing.locator(".location-pin")).toBeVisible();
    await expect(editing.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
    await editing.getByRole("button", { name: "北へ約50m", exact: true }).click();
    await editing.getByRole("button", { name: "この位置で確定する", exact: true }).click();
    await editing.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(editing).not.toBeVisible();
    const updated = await (await page.request.get(`/api/events/${event.id}`)).json();
    expect(updated.latitude).toBeGreaterThan(event.latitude);
    await page.getByRole("button", { name: "アカウントを閉じる", exact: true }).click();
    await page.getByLabel("ジャンル", { exact: true }).selectOption("HIP HOP");
    await page.locator(`.event-card[data-event-id="${event.id}"]`).click();
    await expect(page.locator(".venue-map")).toHaveAttribute("data-latitude", String(updated.latitude));
    await expect(page.locator(".venue-map")).toHaveAttribute("data-longitude", String(updated.longitude));
    await expect(page.locator(".venue-pin")).toBeVisible();
  } finally {
    const csrf = (await (await page.request.get("/api/auth/session")).json()).csrfToken;
    await page.request.delete(`/api/events/${event.id}`, { headers: { "X-CSRFToken": csrf } });
  }
});

test("UI-019 逆検索は推定住所として表示し、移動・失敗後も確定できる",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  let failure=false;
  await page.route("**/api/reverse-geocode",route=>failure?route.fulfill({status:502,json:{error:"offline"}}):route.fulfill({json:{label:"東京都の架空推定住所",latitude:35,longitude:139,prefecture:"東京都",accuracy:"estimated"}}));
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都の架空会場住所");
  const map=editor.locator(".location-map");
  await map.focus();await map.press("Enter");
  const coordinates=await map.getAttribute("data-latitude");
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).toContainText("地図から指定した位置（住所未取得）");
  await editor.getByRole("button",{name:"推定住所を取得",exact:true}).click();
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).toContainText("推定住所：東京都の架空推定住所");
  await expect(map).toHaveAttribute("data-latitude",coordinates!);
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await editor.getByRole("button",{name:"東へ約50m",exact:true}).click();
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).not.toContainText("推定住所：東京都の架空推定住所");
  failure=true;
  await editor.getByRole("button",{name:"推定住所を取得",exact:true}).click();
  await expect(editor.getByText("推定住所を取得できませんでした。地図の位置を確認して確定できます。",{exact:true})).toBeVisible();
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeEnabled();
});

test("UI-020/021 解除は住所を保持し、キーボードで再指定できる",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  await expect(editor.getByRole("button",{name:"地図の中心を開催場所にする",exact:true})).toHaveCount(0);
  const address=editor.getByLabel("開催場所の住所",{exact:true}),map=editor.locator(".location-map");
  await address.fill("東京都の架空住所");await map.focus();await map.press("Enter");
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await editor.getByRole("button",{name:"選択を解除",exact:true}).click();
  await expect(address).toHaveValue("東京都の架空住所");
  await expect(map.locator(".location-pin")).toHaveCount(0);
  await expect(map).not.toHaveAttribute("data-latitude");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await map.focus();await map.press("ArrowRight");await map.press("Enter");
  await expect(map.locator(".location-pin")).toBeVisible();
  await editor.getByRole("button",{name:"南へ約50m",exact:true}).press("Enter");
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).press("Enter");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeEnabled();
});

test("UI-022 複数候補は選択後にピン表示し、解除後は候補も消える",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  await page.route("**/api/geocode",route=>route.fulfill({json:[{label:"東京都の架空候補A",latitude:35.65,longitude:139.7,prefecture:"東京都"},{label:"東京都の架空候補B",latitude:35.7,longitude:139.8,prefecture:"東京都"}]}));
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都の架空住所");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  const choices=editor.getByRole("list",{name:"開催場所の検索候補"}).getByRole("button");
  await expect(choices).toHaveCount(2);
  await expect(editor.locator(".location-pin")).toHaveCount(0);
  await choices.nth(1).click();
  await expect(editor.locator(".location-map")).toHaveAttribute("data-longitude","139.8");
  await editor.getByRole("button",{name:"選択を解除",exact:true}).click();
  await expect(editor.getByRole("list",{name:"開催場所の検索候補"})).toHaveCount(0);
});

test("UI-019/021 逆検索中に解除しても遅い応答でピンを戻さない",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  let release:()=>void=()=>{},started:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{started=resolve;});
  await page.route("**/api/reverse-geocode",async route=>{started();await gate;await route.fulfill({json:{label:"古い架空推定住所",latitude:35,longitude:139,prefecture:"東京都"}});});
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都の架空住所");
  const map=editor.locator(".location-map");await map.focus();await map.press("Enter");
  await editor.getByRole("button",{name:"推定住所を取得",exact:true}).click();await pending;
  await editor.getByRole("button",{name:"選択を解除",exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith("/api/reverse-geocode"));release();await response;
  await expect(map.locator(".location-pin")).toHaveCount(0);
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).not.toContainText("古い架空推定住所");
  await expect(editor.getByLabel("開催場所の住所",{exact:true})).toHaveValue("東京都の架空住所");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
});

test("UI-016 候補なし・通信失敗でも地図クリックと中心選択が使える", async ({ page, isMobile }, info) => {
  let fail = false;
  await page.route("**/api/geocode", route => fail ? route.fulfill({ status: 502, json: { error: "住所検索に接続できません。地図から指定してください。" } }) : route.fulfill({ json: [] }));
  const editor = await openEditor(page, info.project.name);
  await editor.getByLabel("開催場所の住所", { exact: true }).fill("東京都渋谷区テスト1-2-3");
  await editor.getByRole("button", { name: "住所を検索", exact: true }).click();
  await expect(editor.getByText("候補がありません。住所を詳しくするか、地図から指定してください。", { exact: true })).toBeVisible();
  fail = true;
  await editor.getByRole("button", { name: "住所を検索", exact: true }).click();
  await expect(editor.getByText("住所検索に接続できません。地図から指定してください。", { exact: true })).toBeVisible();
  const map = editor.locator(".location-map");
  if (isMobile) await map.tap({ position: { x: 150, y: 130 } });
  else await map.click({ position: { x: 150, y: 130 } });
  await expect(map).toHaveAttribute("data-latitude", /\d/);
  const before = await map.getAttribute("data-latitude");
  const marker = map.locator(".location-pin");
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  if (!box) throw new Error("開催場所マーカーがありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 30, { steps: 8 }); await page.mouse.up();
  await expect(map).not.toHaveAttribute("data-latitude", before!);
  await expect(editor.getByRole("region",{name:"選択地点の確認"})).toContainText("手動選択した地点");
  await editor.locator(".location-map").focus();
  await editor.locator(".location-map").press("Enter");
  await expect(editor.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "この位置で確定する", exact: true }).press("Enter");
  await expect(editor.getByRole("button", { name: "保存する", exact: true })).toBeEnabled();
});

test("UI-018 都道府県矛盾を警告し、住所変更で古い位置を破棄する",async({page},info)=>{
  await page.route("**/api/geocode",route=>route.fulfill({json:[{label:"神奈川県横浜市テスト1-2-3（架空）",latitude:35.45,longitude:139.64,prefecture:"神奈川県",accuracy:"unknown"}]}));
  const editor=await openEditor(page,info.project.name);
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト1-2-3");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  await editor.getByRole("list",{name:"開催場所の検索候補"}).getByRole("button").click();
  await expect(editor.getByRole("alert").filter({hasText:"検索候補の所在地は神奈川県"})).toBeVisible();
  await expect(editor.getByRole("button",{name:"この位置で確定する",exact:true})).toBeDisabled();
  await expect(editor.getByRole("combobox",{name:"都道府県",exact:true})).toHaveCount(0);
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("神奈川県横浜市テスト1-2-3");
  await expect(editor.locator(".location-pin")).toHaveCount(0);
  await expect(editor.getByRole("status",{name:"開催場所の都道府県"})).toContainText("神奈川県");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  await expect(editor.getByRole("button",{name:"この位置で確定する",exact:true})).toBeDisabled();
  await editor.getByRole("button",{name:"東へ約50m",exact:true}).click();
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeEnabled();
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト4-5-6");
  await expect(editor.locator(".location-pin")).toHaveCount(0);
  await expect(editor.locator(".location-map")).not.toHaveAttribute("data-latitude");
  await expect(editor.getByRole("list",{name:"開催場所の検索候補"})).toHaveCount(0);
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await expect(editor.getByRole("button",{name:"この位置で確定する",exact:true})).toBeDisabled();
});

test("BUG-017 住所検索の404を日本語で案内し、手動指定へ進める",async({page},info)=>{
  await page.route("**/api/geocode",route=>route.fulfill({status:404,json:{error:"The requested URL was not found on the server."}}));
  const editor=await openEditor(page,info.project.name);
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト1-2-3");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  await expect(editor.getByText(/住所検索APIが見つかりません/)).toBeVisible();
  await expect(editor.getByText("The requested URL was not found on the server.",{exact:true})).toHaveCount(0);
  await editor.locator(".location-map").focus();
  await editor.locator(".location-map").press("Enter");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeEnabled();
});

test("UI-018 検索中の住所変更後に古い候補を採用しない",async({page},info)=>{
  let release:()=>void=()=>{},started:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;}),requestStarted=new Promise<void>(resolve=>{started=resolve;});
  await page.route("**/api/geocode",async route=>{started();await gate;await route.fulfill({json:[{label:"古い架空住所",latitude:35.69,longitude:139.7,prefecture:"東京都"}]});});
  const editor=await openEditor(page,info.project.name);
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト1-2-3");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  await requestStarted;
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都新宿区テスト4-5-6");
  release();
  await expect(editor.getByRole("button",{name:"住所を検索",exact:true})).toBeEnabled();
  await expect(editor.getByRole("list",{name:"開催場所の検索候補"})).toHaveCount(0);
  await expect(editor.locator(".location-pin")).toHaveCount(0);
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
});

test("BUG-024 日本式住所・町丁目候補の警告と建物分類を表示する", async ({page}, info) => {
  const editor = await openEditor(page, info.project.name);
  let searches = 0;
  await page.route("**/api/geocode", async route => {
    searches++;
    expect(route.request().postDataJSON()).toEqual({query:"東京都渋谷区テスト１－２－３"});
    await route.fulfill({json:[
      {label:"東京都の架空町丁目",prefecture:"東京都",latitude:35.69,longitude:139.7,accuracy:"town",townFallback:true},
      {label:"東京都の架空建物1-2-3",prefecture:"東京都",latitude:35.68,longitude:139.71,accuracy:"building"}
    ]});
  });
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト１－２－３");
  expect(searches).toBe(0);
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  const candidates=editor.getByRole("list",{name:"開催場所の検索候補"});
  await expect(candidates).toContainText("街区・町丁目レベル");
  await expect(candidates).toContainText("番地・建物レベル");
  await candidates.getByRole("button").first().click();
  const review=editor.getByRole("region",{name:"選択地点の確認"});
  await expect(review).toContainText("この検索結果は町丁目付近の位置です");
  await expect(editor.locator(".location-map")).toHaveAttribute("data-latitude","35.69");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await expect(editor.getByRole("button",{name:"この位置で確定する",exact:true})).toBeDisabled();
  await candidates.getByRole("button").nth(1).focus();
  await candidates.getByRole("button").nth(1).press("Enter");
  await expect(review).toContainText("番地・建物レベル");
  await expect(review).toContainText("正確な位置を保証しません");
  await expect(editor.locator(".location-map")).toHaveAttribute("data-longitude","139.71");
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await editor.getByRole("button",{name:"東へ約50m",exact:true}).click();
  await expect(review).toContainText("精度不明");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("東京都渋谷区テスト4-5-6");
  await expect(editor.locator(".location-pin")).toHaveCount(0);
});

test("BUG-027 架空JSONで全角・半角ともLeaflet座標が一致し、町丁目候補は直接確定できない", async ({page}, info) => {
  // 公開用の完全な架空応答。実測値の匿名化コピーや外部APIの精度検証ではない。
  const editor = await openEditor(page, info.project.name);
  for (const run of bug027.runs) {
    await page.route("**/api/geocode", async route => {
      expect(route.request().postDataJSON()).toEqual({ query: run.input });
      await route.fulfill({ json: run.flaskJson });
    });
    await editor.getByLabel("開催場所の住所", {exact:true}).fill(run.input);
    const [searchResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/geocode") && response.request().method() === "POST"),
      editor.getByRole("button", {name:"住所を検索",exact:true}).click(),
    ]);
    expect(searchResponse.status()).toBe(200);
    const map = editor.locator(".location-map"), candidate = run.flaskJson[0];
    await expect(map).toHaveAttribute("data-latitude", String(candidate.latitude));
    await expect(map).toHaveAttribute("data-longitude", String(candidate.longitude));
    await expect(map).toHaveAttribute("data-marker-latitude", String(candidate.latitude));
    await expect(map).toHaveAttribute("data-marker-longitude", String(candidate.longitude));
    await expect.poll(() => map.evaluate(element => {
      const rect = element.getBoundingClientRect(), pin = element.querySelector(".location-pin")!.getBoundingClientRect();
      return Math.abs(pin.left+22-rect.left-rect.width/2)<3 && Math.abs(pin.top+40-rect.top-rect.height/2)<3;
    })).toBe(true);
    await expect(editor.getByRole("alert").filter({hasText:"この候補はそのまま確定できません"})).toBeVisible();
    await expect(editor.getByRole("button",{name:"この位置で確定する",exact:true})).toBeDisabled();
    await editor.getByRole("button",{name:"東へ約50m",exact:true}).click();
    await expect(map).not.toHaveAttribute("data-marker-longitude", String(candidate.longitude));
    await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
    await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
    await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeEnabled();
    await page.unroute("**/api/geocode");
  }
});

test("UI-025 判定不能の補完・手動ピンと推定住所の矛盾・住所変更を扱う",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  const address=editor.getByLabel("開催場所の住所",{exact:true});
  const confirm=editor.getByRole("button",{name:"この位置で確定する",exact:true});
  await expect(editor.locator('select[name="prefecture"]')).toHaveCount(0);
  await address.fill("施設向かいの架空広場");
  await editor.locator(".location-map").focus();await editor.locator(".location-map").press("Enter");
  await expect(confirm).toBeDisabled();
  const supplement=editor.getByLabel("都道府県を補完（判定できない場合）",{exact:true});
  await supplement.fill("東京");await expect(confirm).toBeDisabled();
  await supplement.fill("東京都");await expect(confirm).toBeEnabled();
  await page.route("**/api/reverse-geocode",route=>route.fulfill({json:{label:"神奈川県の架空推定住所",latitude:35,longitude:139,prefecture:"神奈川県",accuracy:"estimated"}}));
  await editor.getByRole("button",{name:"推定住所を取得",exact:true}).click();
  await expect(editor.getByRole("alert").filter({hasText:"手動ピンの推定住所"})).toBeVisible();
  await expect(confirm).toBeDisabled();
  await supplement.fill("");
  await expect(editor.getByRole("status",{name:"開催場所の都道府県"})).toContainText("神奈川県");
  await confirm.click();
  await address.fill("別の架空住所");
  await expect(editor.getByRole("status",{name:"開催場所の都道府県"})).toContainText("未判定");
  await expect(editor.locator(".location-pin")).toHaveCount(0);
  await expect(confirm).toBeDisabled();
});

test("UI-025 候補から県を補い、候補を切り替えても一覧を保持する",async({page},info)=>{
  const editor=await openEditor(page,info.project.name);
  await page.route("**/api/geocode",route=>route.fulfill({json:[
    {label:"神奈川県の架空候補",latitude:35.45,longitude:139.64,prefecture:"神奈川県"},
    {label:"東京都の架空候補",latitude:35.69,longitude:139.7,prefecture:"東京都"}
  ]}));
  await editor.getByLabel("開催場所の住所",{exact:true}).fill("架空施設の住所");
  await editor.getByRole("button",{name:"住所を検索",exact:true}).click();
  const options=editor.getByRole("list",{name:"開催場所の検索候補"}).getByRole("button");
  await options.first().click();
  await expect(editor.getByRole("status",{name:"開催場所の都道府県"})).toContainText("神奈川県");
  await expect(options).toHaveCount(2);
  await options.nth(1).focus();await options.nth(1).press("Enter");
  await expect(editor.getByRole("status",{name:"開催場所の都道府県"})).toContainText("東京都");
  await expect(editor.locator(".location-map")).toHaveAttribute("data-longitude","139.7");
  await expect(editor.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
});
