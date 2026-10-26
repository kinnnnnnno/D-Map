import { afterEach, expect, it, vi } from "vitest";
import { fetchEvents } from "./eventService";
import { createDemoEvents } from "../data/events";
afterEach(() => vi.unstubAllGlobals());
it("APIから15件を取得しCookieを同一オリジンに限定", async () => {
  const data=createDemoEvents(new Date("2026-10-18T15:30:00Z"));
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>data});
  vi.stubGlobal("fetch",fetch);
  expect(await fetchEvents()).toEqual(data);
  expect(fetch).toHaveBeenCalledWith("/api/events",expect.objectContaining({credentials:"same-origin"}));
});
it("HTTP失敗を0件と混同しない",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));
  await expect(fetchEvents()).rejects.toThrow("取得できません");
});
it("成功した空配列は0件",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>[]}));
  expect(await fetchEvents()).toEqual([]);
});
it("配列でない応答を拒否",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({})}));
  await expect(fetchEvents()).rejects.toThrow("応答形式");
});
