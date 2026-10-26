import { describe, expect, it } from "vitest";
import { canConfirmPlace, canSavePlace, locationWarnings, moveLocation, parseCandidates, selectPlace, validLocation } from "./location";
describe("開催場所の内部状態", () => {
  it("有効な緯度経度だけを認める", () => {
    expect(validLocation({ latitude: 35, longitude: 139 })).toBe(true);
    for (const latitude of [NaN, Infinity, 91, -91]) expect(validLocation({ latitude, longitude: 139 })).toBe(false);
    expect(validLocation({ latitude: 35, longitude: 181 })).toBe(false);
  });
  it("検索候補から壊れた座標を除外する", () => {
    expect(parseCandidates([{ label: "架空施設", latitude: 35, longitude: 139 }, { label: "不正", latitude: 99, longitude: 139 }])).toHaveLength(1);
    expect(() => parseCandidates({})).toThrow();
  });
  it.each(["north", "south", "east", "west"] as const)("%sへのキーボード調整", direction => {
    const point = { latitude: 35, longitude: 139 }, moved = moveLocation(point, direction);
    expect(validLocation(moved)).toBe(true);
    expect(moved).not.toEqual(point);
    if (direction === "north") expect(moved.latitude).toBeGreaterThan(point.latitude);
    if (direction === "south") expect(moved.latitude).toBeLessThan(point.latitude);
    if (direction === "east") expect(moved.longitude).toBeGreaterThan(point.longitude);
    if (direction === "west") expect(moved.longitude).toBeLessThan(point.longitude);
  });
  it("日付変更線・極付近でも座標の範囲を保つ", () => {
    expect(validLocation(moveLocation({ latitude: 85, longitude: 180 }, "east"))).toBe(true);
  });
});

describe("住所と位置の確定", () => {
  const address="東京都渋谷区テスト1-2-3", point={latitude:35.658,longitude:139.701};
  it("検索候補を選ぶだけでは保存しない",()=>{
    const value=selectPlace(point,address,"search",{...point,label:address,prefecture:"東京都"});
    expect(canConfirmPlace(value,address,"東京都")).toBe(true);
    expect(canSavePlace(value,address,"東京都")).toBe(false);
  });
  it("明示的な確定後だけ保存できる",()=>{
    const value={...selectPlace(point,address,"manual"),confirmed:true,confirmedPrefecture:"東京都"};
    expect(canSavePlace(value,address,"東京都")).toBe(true);
    expect(canSavePlace(value,address+"4","東京都")).toBe(false);
    expect(canSavePlace(value,address,"神奈川県")).toBe(false);
  });
  it("空住所・未選択・不正座標を確定しない",()=>{
    expect(canConfirmPlace(null,address,"東京都")).toBe(false);
    expect(canConfirmPlace(selectPlace(point,"","manual"),"","東京都")).toBe(false);
    expect(canConfirmPlace(selectPlace({latitude:NaN,longitude:139},address,"manual"),address,"東京都")).toBe(false);
  });
  it("検索候補と選択都道府県の矛盾を止める",()=>{
    const value=selectPlace(point,address,"search",{...point,label:"神奈川県横浜市の架空住所",prefecture:"神奈川県"});
    expect(locationWarnings(value,address,"東京都").join(" ")).toContain("検索候補の所在地は神奈川県");
    expect(canConfirmPlace(value,address,"東京都")).toBe(false);
  });
  it("手動選択でも入力住所と都道府県の矛盾を警告する",()=>{
    expect(locationWarnings(selectPlace(point,address,"manual"),address,"千葉県")).toHaveLength(1);
  });
  it("ドラッグなどの手動変更は検索結果・確定情報を引き継がない",()=>{
    const moved=selectPlace(point,address,"manual");
    expect(moved.matchedAddress).toBeNull(); expect(moved.matchedPrefecture).toBeNull(); expect(moved.confirmed).toBe(false);
  });
  it("推定住所付きの位置を移動すると推定住所も引き継がない",()=>{
    const previous={...selectPlace(point,address,"manual"),estimatedAddress:"旧推定住所",confirmed:true};
    const moved=selectPlace(moveLocation(previous,"east"),address,"manual");
    expect(moved.estimatedAddress).toBeUndefined();expect(moved.confirmed).toBe(false);
  });
  it("保存済みの位置も再確定する",()=>{
    expect(canSavePlace(selectPlace(point,address,"existing"),address,"東京都")).toBe(false);
  });
  it("住所詳細がない候補は都道府県・精度を断定しない",()=>{
    const [candidate]=parseCandidates([{...point,label:"架空施設",prefecture:"Unknown",accuracy:"exact"}]);
    expect(candidate.prefecture).toBeNull(); expect(candidate.accuracy).toBe("unknown");
  });
});
