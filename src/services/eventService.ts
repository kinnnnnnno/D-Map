import { demoEvents } from "../data/events";
import type { DanceEvent } from "../types/event";
// Phase 2: replace this implementation with an API call. The server must enforce visibility.
export function getPublicEvents(): DanceEvent[] {
  return demoEvents.filter((event) => event.visibility === "public");
}

/** 本画面はAPIのみを使用。上の同期取得は既存テスト用ハーネスに限定する。 */
export async function fetchEvents(signal?: AbortSignal): Promise<DanceEvent[]> {
  const response = await fetch("/api/events", { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("イベントを取得できませんでした。時間をおいて再試行してください。");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("イベントの応答形式が不正です。");
  return data as DanceEvent[];
}
