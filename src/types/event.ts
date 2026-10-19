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
] as const;
export interface DanceEvent {
  id: string;
  title: string;
  type: (typeof eventTypes)[number];
  genre: (typeof genres)[number];
  startAt: string;
  endAt: string;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
  feeYen: number;
  organizerName: string;
  participationRule: string;
  description: string;
  visibility: "public" | "group";
}
export interface SearchFilters {
  date: string;
  startTime: string;
  endTime: string;
  genre: string;
  type: string;
}
