import {test,expect,type APIRequestContext} from '@playwright/test';
async function send(request:APIRequestContext,path:string,data?:unknown,method='POST'){
  const csrf=(await (await request.get('/api/auth/session')).json()).csrfToken;
  return request.fetch(`/api${path}`,{method,data,headers:{'X-CSRFToken':csrf}});
}
test('Phase3 招待リンクから一般メンバーが参加し限定予定を検索・閲覧',async({page,browser},info)=>{
  const unique=`${Date.now()}-${info.project.name}`;
  await page.goto('/');
  expect((await send(page.request,'/auth/register',{email:`invite-admin-${unique}@example.invalid`,password:'test-password-123',dancerName:'架空招待管理者'})).status()).toBe(201);
  const group=await (await send(page.request,'/groups',{name:`架空招待グループ${unique}`})).json();
  const invite=await (await send(page.request,`/groups/${group.id}/invitations`)).json();
  const event=await (await send(page.request,'/events',{title:`架空メンバー練習${unique}`,type:'練習会',genre:'KRUMP',startAt:'2030-05-01T15:00:00+09:00',endAt:'2030-05-01T18:00:00+09:00',prefecture:'東京都',venueName:'架空限定会場',address:'東京都新宿区（架空）',latitude:35.69,longitude:139.7,feeYen:0,organizerName:'架空',participationRule:'テスト用',description:'架空のメンバー限定予定',visibility:'group',groupId:group.id})).json();
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173'});
  try {
    expect((await context.request.get(`/api/events/${event.id}`)).status()).toBe(404);
    expect((await send(context.request,'/auth/register',{email:`invite-member-${unique}@example.invalid`,password:'test-password-123',dancerName:'架空招待メンバー'})).status()).toBe(201);
    expect((await context.request.get(`/api/events/${event.id}`)).status()).toBe(404);
    const member=await context.newPage();
    await member.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
    await member.route('https://fonts.googleapis.com/**',route=>route.abort());
    await member.goto(invite.path);
    await expect(member.getByLabel('招待コード',{exact:true})).toHaveValue(invite.code);
    await member.getByRole('button',{name:'招待で参加',exact:true}).click();
    await expect(member.getByText('グループに参加しました。',{exact:true})).toBeVisible();
    await member.getByRole('button',{name:`架空招待グループ${unique}（メンバー）`,exact:true}).click();
    await expect(member.getByRole('region',{name:'グループのメンバー'})).toContainText('架空招待管理者');
    await expect(member.getByRole('region',{name:'グループのメンバー'})).toContainText('架空招待メンバー');
    expect((await context.request.get(`/api/events/${event.id}`)).status()).toBe(200);
    await member.getByRole('button',{name:'アカウントを閉じる',exact:true}).click();
    await member.getByLabel('ジャンル',{exact:true}).selectOption('KRUMP');
    await member.locator(`.event-card[data-event-id="${event.id}"]`).click();
    await expect(member.getByRole('dialog',{name:event.title,exact:true})).toContainText('架空限定会場');
    await member.keyboard.press('Escape');
    await member.getByRole('button',{name:'架空招待メンバー / アカウント',exact:true}).click();
    await member.getByRole('button',{name:'ログアウト',exact:true}).click();
    await expect(member.getByText('ログアウトしました。',{exact:true})).toBeVisible();
    expect((await context.request.get(`/api/events/${event.id}`)).status()).toBe(404);
    await member.getByRole('button',{name:'アカウントを閉じる',exact:true}).click();
    await expect(member.locator(`.event-card[data-event-id="${event.id}"]`)).toHaveCount(0);
  }finally{
    await send(page.request,`/events/${event.id}`,undefined,'DELETE');
    await context.close();
  }
});
