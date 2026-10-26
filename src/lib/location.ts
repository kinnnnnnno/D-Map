import { prefectures } from "../data/prefectures";
export interface Location { latitude: number; longitude: number }
export interface PlaceCandidate extends Location { label: string; prefecture?: string | null; accuracy?: "unknown" }
export interface SelectedPlace extends Location {
  source: "search" | "manual" | "existing";
  inputAddress: string;
  matchedAddress: string | null;
  matchedPrefecture: string | null;
  confirmed: boolean;
  confirmedPrefecture: string | null;
  estimatedAddress?: string | null;
  estimatedPrefecture?: string | null;
}
export function selectPlace(point: Location, address: string, source: SelectedPlace["source"], candidate?: PlaceCandidate): SelectedPlace {
  return { latitude: point.latitude, longitude: point.longitude, source, inputAddress: address, matchedAddress: candidate?.label ?? null,
    matchedPrefecture: candidate?.prefecture ?? null, confirmed: false, confirmedPrefecture: null };
}
export function locationWarnings(value: SelectedPlace | null, address: string, prefecture: string): string[] {
  const names = prefectures.filter(([name]) => address.includes(name)).map(([name]) => name);
  const inputPrefecture = names.length === 1 ? names[0] : null;
  const warnings: string[] = [];
  if (inputPrefecture && inputPrefecture !== prefecture) warnings.push(`入力住所は${inputPrefecture}ですが、都道府県は${prefecture}です。`);
  if (value?.matchedPrefecture && value.matchedPrefecture !== prefecture) warnings.push(`検索候補の所在地は${value.matchedPrefecture}ですが、都道府県は${prefecture}です。`);
  if (inputPrefecture && value?.matchedPrefecture && inputPrefecture !== value.matchedPrefecture) warnings.push("入力住所と検索候補の都道府県が一致しません。");
  return warnings;
}
export function canConfirmPlace(value: SelectedPlace | null, address: string, prefecture: string): value is SelectedPlace {
  return !!value && validLocation(value) && !!address.trim() && value.inputAddress === address && !locationWarnings(value, address, prefecture).length;
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
      prefecture: prefectures.some(([name]) => name === item.prefecture) ? item.prefecture : null, accuracy: "unknown" }));
}
