import {test,expect} from '@playwright/test';
test('Phase3.1 参加予定人数・定員・取消を実APIで更新',async({page},info)=>{
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto('/');
  const token=(await (await page.request.get('/api/auth/session')).json()).csrfToken;
  const registration=await page.request.post('/api/auth/register',{headers:{'X-CSRFToken':token},data:{email:`attendance-${Date.now()}-${info.project.name}@example.invalid`,password:'test-password-123',dancerName:'架空参加者'}});
  expect(registration.status()).toBe(201);
  const csrf=(await (await page.request.get('/api/auth/session')).json()).csrfToken;
  const response=await page.request.post('/api/events',{headers:{'X-CSRFToken':csrf},data:{title:'参加枠の架空テスト',type:'練習会',genre:'KRUMP',startAt:'2030-05-01T15:00:00+09:00',endAt:'2030-05-01T18:00:00+09:00',prefecture:'東京都',venueName:'架空会場',address:'東京都新宿区（架空）',latitude:35.69,longitude:139.7,feeYen:0,organizerName:'架空',participationRule:'テスト用',description:'架空イベント',visibility:'public',capacity:1,walkIns:true}});
  expect(response.status()).toBe(201);const event=await response.json();
  try {
    await page.reload();
    await page.getByLabel('ジャンル',{exact:true}).selectOption('KRUMP');
    await page.locator(`.event-card[data-event-id="${event.id}"]`).click();
    const section=page.getByRole('region',{name:'参加予定',exact:true});
    await expect(section).toContainText('参加予定：0 / 1人（残り1枠）');
    await expect(section).toContainText('飛び入り参加OK');
    await section.getByRole('button',{name:'参加予定にする',exact:true}).click();
    await expect(section).toContainText('参加予定：1 / 1人（残り0枠）');
    await section.getByRole('button',{name:'参加予定を取り消す',exact:true}).click();
    await expect(section).toContainText('参加予定：0 / 1人（残り1枠）');
  }finally{
    const csrf=(await (await page.request.get('/api/auth/session')).json()).csrfToken;
    await page.request.delete(`/api/events/${event.id}`,{headers:{'X-CSRFToken':csrf}});
  }
});
