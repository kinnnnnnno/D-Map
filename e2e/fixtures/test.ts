import { test as base, expect } from "@playwright/test";
import { createDemoEvents } from "../../src/data/events";
export type { Page } from "@playwright/test";
/** 既存UIの回帰用。新しい実API統合テストはPlaywrightのbaseを直接使う。 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/events", route => route.fulfill({json:createDemoEvents(new Date("2026-10-18T15:30:00Z"))}));
    await use(page);
  },
});
export { expect };
