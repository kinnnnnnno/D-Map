import { createDemoEvents, restrictedDemoEvents } from "./events";
/** Phase 1の7公開+1非公開ケース。元の境界テストを拡張データに依存させない。 */
export const legacyEvents = [
  ...createDemoEvents(new Date("2026-10-18T15:30:00Z")).filter(event => Number(event.id) <= 7),
  ...restrictedDemoEvents,
];
