import type { Prefecture } from "../data/prefectures";
export const eventTypes = [
  "練習会",
  "セッション",
  "ワークショップ",
  "バトル",
] as const;
export const genres = [
  "HIP HOP",
  "HOUSE",
  "BREAKING",
  "LOCK",
  "POP",
  "WAACK",
  "ALL STYLE",
  "KRUMP",
  "JAZZ",
  "VOGUE",
  "FREESTYLE",
] as const;
/** 検索解除専用値。イベントのジャンルには使用しない。 */
export const ALL_GENRES = "all" as const;
export type GenreFilter = (typeof genres)[number] | typeof ALL_GENRES;
export interface DanceEvent {
  id: string;
  title: string;
  type: (typeof eventTypes)[number];
  genre: (typeof genres)[number];
  startAt: string;
  endAt: string;
  venueName: string;
  address: string;
  /** 旧データは住所から補完。新しいデータ・APIでは正式名称を明示する。 */
  prefecture?: Prefecture;
  latitude: number;
  longitude: number;
  feeYen: number;
  organizerName: string;
  participationRule: string;
  description: string;
  visibility: "public" | "group";
  groupId?: number | null;
  creatorId?: number | null;
  status?: "scheduled" | "cancelled";
  isDemo?: boolean;
  capacity?: number | null;
  walkIns?: boolean;
  attendanceCount?: number;
  remainingSlots?: number | null;
  attending?: boolean;
}
export interface SearchFilters {
  date: string;
  startTime: string;
  endTime: string;
  genre: GenreFilter;
  type: string;
  prefectures: Prefecture[];
}
export interface EventSelection {
  id: string;
  source: "list" | "map";
  /** 同じイベントの再選択も別の操作として扱う。 */
  sequence: number;
}
