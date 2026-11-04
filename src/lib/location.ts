import { prefectures } from "../data/prefectures";
export interface Location { latitude: number; longitude: number }
export type PlaceAccuracy = "building" | "town" | "municipality" | "unknown";
export interface PlaceCandidate extends Location { label: string; prefecture?: string | null; accuracy?: PlaceAccuracy; townFallback?: boolean }
export function accuracyLabel(accuracy?: PlaceAccuracy): string {
  return ({ building: "番地・建物レベル", town: "街区・町丁目レベル", municipality: "市区町村レベル", unknown: "精度不明" })[accuracy ?? "unknown"];
}
export function accuracyNotice(accuracy?: PlaceAccuracy, townFallback?: boolean): string {
  if (accuracy === "municipality") return "この検索結果は市区町村の代表点です。実際の開催場所へピンを移動してください。";
  if (accuracy === "town") return "この検索結果は町丁目付近の位置です。実際の開催場所を地図上で確認してください。";
  if (townFallback) return "番地を除いた検索結果です。範囲の精度は不明です。実際の開催場所を地図上で確認してください。";
  return "分類はサービスの所在地情報に基づき、番地の一致や建物・会場入口の正確な位置を保証しません。地図で照合してください。";
}
export interface SelectedPlace extends Location {
  source: "search" | "manual" | "existing";
  inputAddress: string;
  matchedAddress: string | null;
  matchedPrefecture: string | null;
  confirmed: boolean;
  confirmedPrefecture: string | null;
  estimatedAddress?: string | null;
  estimatedPrefecture?: string | null;
  accuracy?: PlaceAccuracy;
  townFallback?: boolean;
}
export function addressPrefecture(address: string): string | null {
  const names = prefectures.filter(([name]) => address.includes(name)).map(([name]) => name);
  return names.length === 1 ? names[0] : null;
}
/** 住所、候補、明示的な補完、推定住所の順で補う。座標から県境を推測しない。 */
export function resolvePrefecture(address: string, value: SelectedPlace | null, supplement = "") {
  const fromAddress = addressPrefecture(address);
  if (fromAddress) return { name: fromAddress, source: "入力住所から判定" };
  if (value?.inputAddress === address && value.matchedPrefecture) return { name: value.matchedPrefecture, source: "検索候補から判定" };
  if (prefectures.some(([name]) => name === supplement)) return { name: supplement, source: "利用者の補完（要確認）" };
  if (value?.inputAddress === address && value.estimatedPrefecture) return { name: value.estimatedPrefecture, source: "手動ピンの推定住所から判定（要確認）" };
  return { name: "", source: "都道府県を特定できません" };
}
export function selectPlace(point: Location, address: string, source: SelectedPlace["source"], candidate?: PlaceCandidate): SelectedPlace {
  return { latitude: point.latitude, longitude: point.longitude, source, inputAddress: address, matchedAddress: candidate?.label ?? null,
    matchedPrefecture: candidate?.prefecture ?? null, accuracy: candidate?.accuracy ?? "unknown", townFallback: candidate?.townFallback === true, confirmed: false, confirmedPrefecture: null };
}
export function locationWarnings(value: SelectedPlace | null, address: string, prefecture: string): string[] {
  const names = prefectures.filter(([name]) => address.includes(name)).map(([name]) => name);
  const inputPrefecture = names.length === 1 ? names[0] : null;
  const warnings: string[] = [];
  if (inputPrefecture && inputPrefecture !== prefecture) warnings.push(`入力住所は${inputPrefecture}ですが、都道府県は${prefecture}です。`);
  if (value?.matchedPrefecture && value.matchedPrefecture !== prefecture) warnings.push(`検索候補の所在地は${value.matchedPrefecture}ですが、都道府県は${prefecture}です。`);
  if (inputPrefecture && value?.matchedPrefecture && inputPrefecture !== value.matchedPrefecture) warnings.push("入力住所と検索候補の都道府県が一致しません。");
  if (value?.estimatedPrefecture && value.estimatedPrefecture !== prefecture) warnings.push(`手動ピンの推定住所は${value.estimatedPrefecture}です。住所・都道府県とピンの位置を再確認してください。`);
  return warnings;
}
export function canConfirmPlace(value: SelectedPlace | null, address: string, prefecture: string): value is SelectedPlace {
  return !!value && !requiresManualLocation(value) && validLocation(value) && !!address.trim() && prefectures.some(([name]) => name === prefecture) && value.inputAddress === address && !locationWarnings(value, address, prefecture).length;
}
/** 代表点・精度不明の検索結果を、そのまま開催場所として確定させない。 */
export function requiresManualLocation(value: SelectedPlace): boolean {
  return value.source === "search" && (value.accuracy !== "building" || value.townFallback === true);
}
export function canSavePlace(value: SelectedPlace | null, address: string, prefecture: string): value is SelectedPlace {
  return canConfirmPlace(value, address, prefecture) && value.confirmed && value.confirmedPrefecture === prefecture;
}
export function validLocation(value: Location): boolean {
  return Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
/** キーボードでも約50mずつ動かせる。極付近では経度の補正を制限する。 */
export function moveLocation(value: Location, direction: "north" | "south" | "east" | "west"): Location {
  const latitude = Math.max(-85, Math.min(85, value.latitude + (direction === "north" ? 1 : direction === "south" ? -1 : 0) * 50 / 111320));
  const delta = (direction === "east" ? 1 : direction === "west" ? -1 : 0) * 50 / (111320 * Math.max(.1, Math.cos(latitude * Math.PI / 180)));
  return { latitude, longitude: ((value.longitude + delta + 540) % 360) - 180 };
}
export function parseCandidates(data: unknown): PlaceCandidate[] {
  if (!Array.isArray(data)) throw new Error("検索結果の形式が正しくありません。");
  return data.filter((item): item is PlaceCandidate => !!item && typeof item === "object" &&
    typeof item.label === "string" && typeof item.latitude === "number" && typeof item.longitude === "number" && validLocation(item))
    .map(item => ({ latitude: item.latitude, longitude: item.longitude, label: item.label,
      prefecture: prefectures.some(([name]) => name === item.prefecture) ? item.prefecture : null,
      accuracy: ["building", "town", "municipality"].includes(item.accuracy ?? "") ? item.accuracy : "unknown", townFallback: item.townFallback === true }));
}
