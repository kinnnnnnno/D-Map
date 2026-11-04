import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async({page})=>{
  await page.route("https://tile.openstreetmap.org/**",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route("https://fonts.googleapis.com/**",route=>route.abort());
  await page.goto("/");
});
async function register(page:Page,email:string,name:string){
  await page.getByRole("button",{name:"ログイン・登録",exact:true}).click();
  await page.getByRole("button",{name:"ユーザー登録",exact:true}).click();
  await page.getByLabel("メールアドレス",{exact:true}).fill(email);
  await page.getByLabel("パスワード（12〜128文字）",{exact:true}).fill("test-password-123");
  await page.getByLabel("ダンサーネーム",{exact:true}).fill(name);
  const [registration] = await Promise.all([
    page.waitForResponse(response=>response.url().endsWith("/api/auth/register")&&response.request().method()==="POST"),
    page.getByRole("button",{name:"登録する",exact:true}).click(),
  ]);
  expect(registration.status()).toBe(201);
  await expect(page.getByRole("button",{name:"プロフィールを保存",exact:true})).toBeVisible();
}
test("Phase3.0 登録・プロフィール編集・ログアウト・ログイン",async({page},info)=>{
  const email=`profile-${Date.now()}-${info.project.name}@example.invalid`;
  await register(page,email,"架空プロフィール");
  await page.getByLabel("ダンサーネーム",{exact:true}).fill("変更した架空名");
  await page.getByLabel("生年（任意）",{exact:true}).fill("2000");
  await page.getByLabel("年齢統計への参加に同意する",{exact:false}).check();
  const [profileSave] = await Promise.all([
    page.waitForResponse(response=>response.url().endsWith("/api/profile")&&response.request().method()==="PUT"),
    page.getByRole("button",{name:"プロフィールを保存",exact:true}).click(),
  ]);
  expect(profileSave.status()).toBe(200);
  await expect(page.getByText("プロフィールを保存しました。",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"ログアウト",exact:true}).click();
  await page.getByLabel("メールアドレス",{exact:true}).fill(email);
  await page.getByLabel("パスワード（12〜128文字）",{exact:true}).fill("test-password-123");
  const [authentication] = await Promise.all([
    page.waitForResponse(response=>response.url().endsWith("/api/auth/login")&&response.request().method()==="POST"),
    page.getByRole("button",{name:"ログインする",exact:true}).click(),
  ]);
  expect(authentication.status()).toBe(200);
  await expect(page.getByLabel("ダンサーネーム",{exact:true})).toHaveValue("変更した架空名");
  await expect(page.getByLabel("生年（任意）",{exact:true})).toHaveValue("2000");
});
test("Phase3.0 グループ作成・招待・限定イベント作成・部外者遮断",async({page,browser},info)=>{
  const unique=`${Date.now()}-${info.project.name}`;
  await register(page,`group-${unique}@example.invalid`,"架空管理者");
  await page.getByRole("button",{name:"グループ",exact:true}).click();
  await page.getByLabel("新しいグループ名",{exact:true}).fill(`架空グループ${unique}`);
  await page.getByRole("button",{name:"グループ作成",exact:true}).click();
  await page.getByRole("button",{name:`架空グループ${unique}（管理者）`,exact:true}).click();
  await expect(page.getByRole("region",{name:"グループのメンバー"})).toContainText("架空管理者");
  await page.getByRole("button",{name:"招待を作成",exact:true}).click();
  const code=await page.getByLabel("発行した招待コード").innerText();
  expect(code.length).toBeGreaterThan(30);
  await page.getByRole("button",{name:"イベント管理",exact:true}).click();
  await page.getByRole("button",{name:"イベント作成",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"イベント作成",exact:true});
  await editor.getByLabel("イベント名",{exact:true}).fill(`限定の架空練習${unique}`);
  await editor.getByLabel("開始日時（日本時間）",{exact:true}).fill("2030-05-01T15:00");
  await editor.getByLabel("終了日時（日本時間）",{exact:true}).fill("2030-05-01T18:00");
  for(const [label,value] of [["施設名・会場名","架空フロア"],["開催場所の住所","東京都新宿区（架空）"],["参加条件","テスト用"],["説明","架空の限定練習です"]]) await editor.getByLabel(label,{exact:true}).fill(value);
  await editor.locator(".location-map").focus();
  await editor.locator(".location-map").press("Enter");
  await editor.getByRole("button",{name:"この位置で確定する",exact:true}).click();
  await editor.getByLabel("公開範囲",{exact:true}).selectOption("group");
  await editor.getByRole("button",{name:"保存する",exact:true}).click();
  await expect(editor).not.toBeVisible();
  const rows=await (await page.request.get("/api/events")).json();
  const event=rows.find((row:{title:string})=>row.title===`限定の架空練習${unique}`);
  expect(event).toBeTruthy();
  const outsider=await browser.newContext();
  try {
    const response=await outsider.request.get(`http://127.0.0.1:4173/api/events/${event.id}`);
    expect(response.status()).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("架空フロア");
  }finally{await outsider.close();}
  await page.getByRole("button",{name:"アカウントを閉じる",exact:true}).click();
  await page.getByLabel("ジャンル",{exact:true}).selectOption("HIP HOP");
  await expect(page.getByRole("button",{name:new RegExp(`限定の架空練習${unique}`)})).toBeVisible();
});
