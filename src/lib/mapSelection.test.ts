import { describe, expect, it } from "vitest";
import { isMarkerVisible, popupPanOffset } from "./mapSelection";
describe("UI-013 ピンの表示領域とポップアップの最小補正", () => {
  it("十分内側なら表示中", () => expect(isMarkerVisible({ x: 200, y: 180 }, { x: 400, y: 360 })).toBe(true));
  it.each([{ x: -10, y: 180 }, { x: 390, y: 180 }, { x: 200, y: 30 }, { x: 200, y: 355 }])("端で見切れる %o", point => {
    expect(isMarkerVisible(point, { x: 400, y: 360 })).toBe(false);
  });
  it("ズームUIに隠れるピンも移動対象", () => {
    expect(isMarkerVisible({ x: 80, y: 110 }, { x: 400, y: 360 }, [{ left: 50, top: 60, right: 90, bottom: 130 }])).toBe(false);
  });
  it("収まるポップアップでは移動0、はみ出す分だけ補正", () => {
    const view = { left: 0, top: 0, right: 400, bottom: 360 };
    expect(popupPanOffset({ left: 100, top: 80, right: 300, bottom: 300 }, view)).toEqual({ x: 0, y: 0 });
    expect(popupPanOffset({ left: -10, top: -20, right: 190, bottom: 200 }, view)).toEqual({ x: -30, y: -40 });
    expect(popupPanOffset({ left: 240, top: 200, right: 440, bottom: 380 }, view)).toEqual({ x: 60, y: 40 });
  });
});
