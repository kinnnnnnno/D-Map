import type { DanceEvent } from "../types/event";
export const markerStyles = [
  { key: "breaking", label: "BREAK", symbol: "B", color: "#245a9b" },
  { key: "hiphop", label: "HIPHOP", symbol: "H", color: "#98500e" },
  { key: "pop", label: "POP", symbol: "P", color: "#74459a" },
  { key: "lock", label: "LOCK", symbol: "L", color: "#23644e" },
  { key: "other", label: "その他", symbol: "他", color: "#505b65" },
] as const;
export type MarkerStyle = (typeof markerStyles)[number];
export function getMarkerStyle(genre: string): MarkerStyle {
  const normalized = genre.replace(/\s/g, "").toUpperCase();
  if (normalized === "BREAK" || normalized === "BREAKING")
    return markerStyles[0];
  if (normalized === "HIPHOP") return markerStyles[1];
  if (normalized === "POP") return markerStyles[2];
  if (normalized === "LOCK") return markerStyles[3];
  return markerStyles[4];
}
export interface EventLocation {
  key: string;
  latitude: number;
  longitude: number;
  events: DanceEvent[];
}
/** 座標をキーにO(n)で集約。公開・検索済みのデータだけを渡します。 */
export function groupEventLocations(events: DanceEvent[]): EventLocation[] {
  const locations = new Map<string, EventLocation>();
  for (const event of events) {
    if (event.visibility !== "public") continue;
    const key = `${event.latitude},${event.longitude}`;
    const location = locations.get(key);
    if (location) location.events.push(event);
    else
      locations.set(key, {
        key,
        latitude: event.latitude,
        longitude: event.longitude,
        events: [event],
      });
  }
  return [...locations.values()];
}
