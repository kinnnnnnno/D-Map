import { demoEvents } from "../data/events";
import type { DanceEvent } from "../types/event";
// Phase 2: replace this implementation with an API call. The server must enforce visibility.
export function getPublicEvents(): DanceEvent[] {
  return demoEvents.filter((event) => event.visibility === "public");
}
