import { expect, test } from "@playwright/test";
import { waitForMapStable } from "./helpers/mapStability";

test("地図の安定待機はクラスなしの連続パンと短い停止・サイズ変更を通過しない", async ({ page }) => {
  // Deterministic DOM fixture: no tiles, API, network or arbitrary timer sleeps.
  await page.setContent('<div class="map" data-center="35,139" data-zoom="17" style="position:relative;width:375px;height:500px"><div class="leaflet-map-pane"><div class="event-pin" style="position:absolute;left:20px;top:30px;width:44px;height:48px"></div></div></div>');
  await page.evaluate(() => {
    const map = document.querySelector<HTMLElement>(".map")!;
    const pin = map.querySelector<HTMLElement>(".event-pin")!;
    const pane = map.querySelector<HTMLElement>(".leaflet-map-pane")!;
    const read = pin.getBoundingClientRect.bind(pin);
    let started = false;
    // Start on the first actual observation, so a slow browser cannot skip the regression scenario.
    pin.getBoundingClientRect = () => {
      if (!started) {
        started = true;
        let frame = 0;
        map.dataset.phase = "first-short-pause";
        function animate() {
          frame++;
          if (frame <= 8) {
            map.dataset.phase = "first-short-pause";
          } else if (frame <= 20) {
            map.dataset.phase = "first-pan";
            pane.style.transform = `translateX(${frame - 8}px)`;
          } else if (frame <= 28) {
            map.dataset.phase = "second-short-pause";
          } else if (frame <= 40) {
            map.dataset.phase = "second-pan";
            pane.style.transform = `translateX(${frame - 16}px)`;
          } else {
            map.dataset.center = "35.001,139.001";
            map.style.height = "550px";
            map.dataset.phase = "settled";
            return;
          }
          requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
      }
      return read();
    };
  });
  await waitForMapStable(page.locator(".event-pin"));
  // Read immediately: an auto-waiting assertion here would hide an early return from the helper.
  expect(await page.locator(".map").getAttribute("data-phase")).toBe("settled");
  expect(await page.locator(".map").getAttribute("data-center")).toBe("35.001,139.001");
  await expect(page.locator(".leaflet-pan-anim")).toHaveCount(0);
});

test("既存Leafletの連続パンでクラスが消えても最終位置まで待つ", async ({ page }) => {
  // A separate local map, with no tile layer or external requests; production map code is untouched.
  await page.route("**/map-stability-blank", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("/map-stability-blank");
  await page.evaluate(async () => {
    const modulePath = "/node_modules/leaflet/dist/leaflet-src.esm.js";
    const L: typeof import("leaflet") = await import(modulePath);
    const div = document.createElement("div");
    div.className = "map";
    div.style.cssText = "position:relative;width:375px;height:500px";
    div.dataset.zoom = "17";
    document.body.append(div);
    const map = L.map(div, { zoomControl: false, attributionControl: false }).setView([35, 139], 17);
    const recordCenter = () => { const center = map.getCenter(); div.dataset.center = `${center.lat},${center.lng}`; };
    map.on("moveend", recordCenter);
    recordCenter();
    const marker = L.marker([35, 139], { icon: L.divIcon({ className: "event-pin", iconSize: [44, 48] }) }).addTo(map).getElement()!;
    // Without the app stylesheet, position the scratch marker as a real Leaflet pane child.
    marker.style.position = "absolute";
    const read = marker.getBoundingClientRect.bind(marker);
    let started = false;
    marker.getBoundingClientRect = () => {
      if (!started) {
        started = true;
        map.panBy([100, 0], { animate: true, duration: 0.25 });
        // Overlap in the same task: a slow frame must not let the first pan finish before the second starts.
        map.panBy([50, 0], { animate: true, duration: 0.25 });
        div.dataset.classMissingDuringPan = String(!div.querySelector(".leaflet-pan-anim"));
        div.dataset.phase = "second-pan";
        const pane = div.querySelector<HTMLElement>(".leaflet-map-pane")!;
        const startTransform = pane.style.transform;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          div.dataset.movedWithoutClass = String(pane.style.transform !== startTransform && !div.querySelector(".leaflet-pan-anim"));
        }));
        // Subscribe after panBy: stopping the first pan itself emits a moveend.
        map.once("moveend", () => { div.dataset.phase = "settled"; });
      }
      return read();
    };
  });
  await waitForMapStable(page.locator(".event-pin"));
  expect(await page.locator(".map").getAttribute("data-class-missing-during-pan")).toBe("true");
  expect(await page.locator(".map").getAttribute("data-moved-without-class")).toBe("true");
  expect(await page.locator(".map").getAttribute("data-phase")).toBe("settled");
});
