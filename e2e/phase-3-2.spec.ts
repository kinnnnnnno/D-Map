import {test,expect,type APIRequestContext} from '@playwright/test';
async function send(request:APIRequestContext,path:string,data?:unknown,method='POST'){
  const token=(await (await request.get('/api/auth/session')).json()).csrfToken;
  return request.fetch(`/api${path}`,{method,headers:{'X-CSRFToken':token},data});
}
test('Phase3.2 年齢層/ジャンルグラフと同意取消後の非表示',async({page,browser},info)=>{
  test.setTimeout(180000);
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  // 統計の前提を確立する。初回の画面セッション取得と登録準備のCookie生成を競合させない。
  expect((await page.request.get('/api/auth/session')).status()).toBe(200);
  await page.goto('/');
  const unique=`${Date.now()}-${info.project.name}`;
  expect((await send(page.request,'/auth/register',{email:`stats-owner-${unique}@example.invalid`,password:'test-password-123',dancerName:'架空統計主催'})).status()).toBe(201);
  const response=await send(page.request,'/events',{title:'架空の統計テスト',type:'練習会',genre:'VOGUE',startAt:'2030-05-01T15:00:00+09:00',endAt:'2030-05-01T18:00:00+09:00',prefecture:'東京都',venueName:'架空会場',address:'東京都新宿区（架空）',latitude:35.69,longitude:139.7,feeYen:0,organizerName:'架空',participationRule:'検証のみ',description:'実在しないイベント',visibility:'public'});
  expect(response.status()).toBe(201);const event=await response.json();
  const contexts=[];
  try {
    for(let index=0;index<5;index++){
      const context=await browser.newContext({baseURL:'http://127.0.0.1:4173'});contexts.push(context);
      expect((await send(context.request,'/auth/register',{email:`stats-${unique}-${index}@example.invalid`,password:'test-password-123',dancerName:`架空統計${index}`,birthDate:'2000-05-02',ageStatsConsent:true,mainGenre:'BREAKING',subGenres:['POP','LOCK'],genreStatsConsent:true})).status()).toBe(201);
      expect((await send(context.request,`/events/${event.id}/participation`,{})).status()).toBe(201);
    }
    await page.reload();await page.getByLabel('ジャンル',{exact:true}).selectOption('VOGUE');
    await page.locator(`.event-card[data-event-id="${event.id}"]`).click();
    const age=page.getByRole('region',{name:'年齢層',exact:true});
    await expect(age).toContainText('集計対象：5人');
    await expect(age).toContainText('20代：5人（100%）');
    await expect(age).toContainText('平均年齢：29歳');
    await expect(age.getByRole('meter',{name:'20代の割合'})).toHaveAttribute('value','100');
    const genre=page.getByRole('region',{name:'ジャンル',exact:true});
    await expect(genre).toContainText('BREAKING：5人（100%）');
    await expect(genre).toContainText('1人1回答');
    const target=contexts[4].request;
    const profile=await (await target.get('/api/profile')).json();
    expect((await send(target,'/profile',{...profile,ageStatsConsent:false,genreStatsConsent:false},'PUT')).status()).toBe(200);
    await page.getByRole('button',{name:'統計を更新',exact:true}).click();
    await expect(age).toContainText('非表示');
    await expect(age.getByRole('meter')).toHaveCount(0);
    const data=await (await page.request.get(`/api/events/${event.id}/statistics`)).json();
    expect(data.age.available).toBe(false);expect(data.age).not.toHaveProperty('items');expect(data.age).not.toHaveProperty('targetCount');
  }finally{
    await send(page.request,`/events/${event.id}`,undefined,'DELETE');
    for(const context of contexts)await context.close();
  }
});
