import { describe, expect, it } from "vitest";
import { paginate } from "./pagination";

describe("UI-008/009 一覧だけをページ分割", () => {
  it.each([[7,1,7],[10,1,10],[11,2,1],[15,2,5],[21,3,1]])(
    "%i件は%iページ、最終ページ%i件", (count, total, last) => {
      const items = Array.from({length: count}, (_, i) => i);
      const first = paginate(items, 1), final = paginate(items, total);
      expect(first.totalPages).toBe(total);
      expect(first.items).toHaveLength(Math.min(10, count));
      expect(final.items).toHaveLength(last);
      expect([...first.items, ...(total > 1 ? paginate(items, 2).items : []), ...(total > 2 ? final.items : [])]).toEqual(items);
      expect(items).toHaveLength(count);
    });
  it("減少・0件・範囲外のページを補正", () => {
    expect(paginate([1,2], 3)).toMatchObject({page:1,first:1,last:2});
    expect(paginate([], 3)).toMatchObject({page:1,totalPages:1,items:[],first:0,last:0});
    expect(paginate([1], -1).page).toBe(1);
  });
});
