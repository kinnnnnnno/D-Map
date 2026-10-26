import { test, expect } from "@playwright/test";
import { chooseRegions } from "./helpers/regions";
test.beforeEach(async({page})=>{
  await page.route("https://tile.openstreetmap.org/**", route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route("https://fonts.googleapis.com/**",route=>route.abort());
});
test("Phase 2.2 実SQLiteのAPIとReact連携",async({page,request})=>{
  const response=await request.get("/api/events/");
  expect(response.status()).toBe(200);
  expect(await response.json()).toHaveLength(15);
  await page.goto("/");
  await expect(page.locator(".map-result-count")).toHaveText("13件を表示");
  await chooseRegions(page,["東京都","神奈川県"]);
  await expect(page.locator(".map-result-count")).toHaveText("15件を表示");
});
test("読み込み中と失敗・再試行・0件を区別",async({page})=>{
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/events",async route=>{await pending; await route.fulfill({status:503,json:{error:"停止"}});});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.getByText("イベントを読み込み中です。",{exact:true})).toBeVisible();
  await expect(page.locator(".empty")).toHaveCount(0);
  release();
  await expect(page.getByRole("alert")).toContainText("取得できません");
  await page.unroute("**/api/events");
  await page.route("**/api/events",route=>route.fulfill({json:[]}));
  await page.getByRole("button",{name:"再試行",exact:true}).click();
  await expect(page.locator(".empty")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
