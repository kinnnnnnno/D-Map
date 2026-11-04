import { describe, expect, it } from "vitest";
import { addressPrefecture, canConfirmPlace, canSavePlace, locationWarnings, moveLocation, parseCandidates, resolvePrefecture, selectPlace, validLocation } from "./location";
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
    expect(canConfirmPlace(value,address,"東京都")).toBe(false);
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

describe("BUG-024 候補の精度はサービス分類を保持する", () => {
  it.each(["building", "town", "municipality", "unknown"] as const)("%s を選択後も保持し、移動時は解除する", accuracy => {
    const [candidate] = parseCandidates([{ label: "架空住所", latitude: 35, longitude: 139, accuracy, townFallback: true }]);
    const selected = selectPlace(candidate, "東京都テスト1-2-3", "search", candidate);
    expect(selected.accuracy).toBe(accuracy); expect(selected.townFallback).toBe(true);
    const moved = selectPlace(moveLocation(selected, "east"), selected.inputAddress, "manual");
    expect(moved.accuracy).toBe("unknown"); expect(moved.townFallback).toBe(false);
    expect(moved.confirmed).toBe(false);
  });
});

describe("UI-025 都道府県の自動判定と補完", () => {
  const point={latitude:35.69,longitude:139.7};
  it.each(["東京都", "神奈川県", "千葉県", "埼玉県"])("住所の正式名称 %s を認識", name=>{
    expect(addressPrefecture(`〒123-4567 ${name}テスト1-2-3`)).toBe(name);
  });
  it("不明・曖昧な住所は推測しない",()=>{
    expect(addressPrefecture("横浜市の架空会場")).toBeNull();
    expect(addressPrefecture("東京都と神奈川県の境界")).toBeNull();
    expect(resolvePrefecture("架空住所",null).name).toBe("");
  });
  it("住所を優先し矛盾した検索候補は確定できない",()=>{
    const value=selectPlace(point,"東京都テスト","search",{...point,label:"神奈川県の候補",prefecture:"神奈川県"});
    expect(resolvePrefecture(value.inputAddress,value).name).toBe("東京都");
    expect(canConfirmPlace(value,value.inputAddress,"東京都")).toBe(false);
  });
  it("住所に県がない場合は検索候補から判定し、古い候補は採用しない",()=>{
    const value=selectPlace(point,"架空住所","search",{...point,label:"候補",prefecture:"神奈川県"});
    expect(resolvePrefecture("架空住所",value).name).toBe("神奈川県");
    expect(resolvePrefecture("別の住所",value).name).toBe("");
  });
  it("正式名称の補完が必要で、手動ピンの推定住所と矛盾したら停止",()=>{
    const value={...selectPlace(point,"架空住所","manual"),estimatedPrefecture:"神奈川県"};
    expect(resolvePrefecture("架空住所",value).name).toBe("神奈川県");
    expect(resolvePrefecture("架空住所",value,"東京都").name).toBe("東京都");
    expect(canConfirmPlace(value,"架空住所","東京都")).toBe(false);
    expect(canConfirmPlace(selectPlace(point,"架空住所","manual"),"架空住所","")).toBe(false);
    expect(resolvePrefecture("架空住所",null,"東京").name).toBe("");
  });
});

describe("BUG-027 低精度検索候補の直接確定を防ぐ", () => {
  const address = "神奈川県架空市テスト区検証町7-8-9";
  const point = { latitude: 35.000001, longitude: 139.000002 };
  it.each(["town", "municipality", "unknown"] as const)("%s は確定フラグがあっても直接保存しない", accuracy => {
    const value = selectPlace(point, address, "search", { ...point, label: "検証用候補", accuracy });
    expect(canConfirmPlace(value, address, "神奈川県")).toBe(false);
    expect(canSavePlace({ ...value, confirmed: true, confirmedPrefecture: "神奈川県" }, address, "神奈川県")).toBe(false);
    const manual = selectPlace(moveLocation(value, "east"), address, "manual");
    expect(canConfirmPlace(manual, address, "神奈川県")).toBe(true);
    expect(canSavePlace(manual, address, "神奈川県")).toBe(false);
  });
  it("建物分類でも番地を除いた検索は直接確定しない", () => {
    expect(canConfirmPlace(selectPlace(point, address, "search", { ...point, label: "候補", accuracy: "building", townFallback: true }), address, "神奈川県")).toBe(false);
  });
  it("番地を除いていない建物分類は明示確定を必要とする", () => {
    const value = selectPlace(point, address, "search", { ...point, label: "候補", accuracy: "building" });
    expect(canConfirmPlace(value, address, "神奈川県")).toBe(true);
    expect(canSavePlace(value, address, "神奈川県")).toBe(false);
  });
});
