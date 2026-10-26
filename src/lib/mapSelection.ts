export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
export function popupPanOffset(popup: Rect, viewport: Rect, padding = 20): Point {
  const left = viewport.left + padding, right = viewport.right - padding;
  const top = viewport.top + padding, bottom = viewport.bottom - padding;
  return {
    x: popup.left < left ? popup.left - left : Math.max(0, popup.right - right),
    y: popup.top < top ? popup.top - top : Math.max(0, popup.bottom - bottom),
  };
}
/** ピン全体と余白が地図内にあり、ズーム等の操作UIに隠れていないか。 */
export function isMarkerVisible(point: Point, size: { x: number; y: number }, occluders: readonly Rect[] = []): boolean {
  const marker = { left: point.x - 30, right: point.x + 30, top: point.y - 60, bottom: point.y + 12 };
  if (marker.left < 12 || marker.top < 12 || marker.right > size.x - 12 || marker.bottom > size.y - 12) return false;
  return !occluders.some(rect => marker.left < rect.right && marker.right > rect.left && marker.top < rect.bottom && marker.bottom > rect.top);
}
