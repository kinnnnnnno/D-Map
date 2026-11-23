import { expect, type Locator } from "@playwright/test";

/** DOM observation only: Leaflet can remove its pan class while a second pan is active. */
export async function waitForMapStable(marker: Locator) {
  await expect.poll(() => marker.evaluate((element) => new Promise<boolean>((resolve) => {
    const map = element.closest<HTMLElement>(".map");
    if (!map) { resolve(false); return; }
    const sample = () => {
      const bounds = map.getBoundingClientRect();
      const pin = element.getBoundingClientRect();
      return {
        center: map.dataset.center,
        zoom: map.dataset.zoom,
        pane: map.querySelector<HTMLElement>(".leaflet-map-pane")?.style.transform,
        geometry: [bounds.x, bounds.y, bounds.width, bounds.height,
          pin.x, pin.y, pin.width, pin.height],
        animating: map.classList.contains("leaflet-zoom-anim") || !!map.querySelector(".leaflet-pan-anim"),
      };
    };
    const anchor = sample();
    const since = performance.now();
    let frames = 0;
    function frame(now: number) {
      const current = sample();
      const valid = element.isConnected && map!.isConnected && !!current.center && !!current.zoom &&
        current.geometry[2] > 0 && current.geometry[3] > 0 && !current.animating;
      // Compare against the window's anchor, not just the preceding frame: slow drift resets it too.
      const unchanged = current.center === anchor.center && current.zoom === anchor.zoom &&
        current.pane === anchor.pane && current.geometry.every((value, i) => Math.abs(value - anchor.geometry[i]) < 0.05);
      if (!valid || !unchanged) {
        // Return to Playwright's existing bounded poll; never extend its timeout.
        resolve(false);
        return;
      }
      frames++;
      // Observe 24 consecutive frames AND 300ms without a change. This is not a sleep:
      // every frame is checked, and any movement restarts the entire observation window.
      // 300ms also rejects short gaps within the existing 250ms popup-pan sequence.
      if (frames >= 24 && now - since >= 300) { resolve(true); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })), { message: "地図の中心・サイズ・対象ピンが連続フレームで安定する" }).toBe(true);
}
