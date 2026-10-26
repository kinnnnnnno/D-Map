import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(()=>vi.unstubAllGlobals());
it("更新前にCSRFを取得し、同一オリジンCookieと共に送る",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({csrfToken:"signed-token"})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({message:"ok"})});
  vi.stubGlobal("fetch",fetch);
  await api("/profile","PUT",{dancerName:"架空"});
  expect(fetch.mock.calls[1]).toEqual(["/api/profile",expect.objectContaining({credentials:"same-origin",method:"PUT",headers:{"X-CSRFToken":"signed-token","Content-Type":"application/json"}})]);
});
it("サーバーの認可エラーを利用者へ返す",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>({error:"管理者のみ操作できます。"})}));
  await expect(api("/groups")).rejects.toThrow("管理者のみ");
});
it("204応答はJSONを読まない",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({csrfToken:"token"})}).mockResolvedValueOnce({ok:true,status:204});
  vi.stubGlobal("fetch",fetch);
  expect(await api("/events/1","DELETE")).toBeUndefined();
});
it("住所検索APIの404は再起動・接続先を案内する",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({csrfToken:"token"})})
    .mockResolvedValueOnce({ok:false,status:404,json:async()=>({error:"The requested URL was not found on the server."})});
  vi.stubGlobal("fetch",fetch);
  await expect(api("/geocode","POST",{query:"東京都渋谷区"})).rejects.toThrow("Flaskをこのプロジェクトの最新ソースで再起動");
});
