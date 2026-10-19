import type { EventLocation } from "./markers";

export interface ProjectedPoint {
  x: number;
  y: number;
}
export interface MapGroup {
  key: string;
  locations: EventLocation[];
  eventCount: number;
  latitude: number;
  longitude: number;
}
export const clusterRadius = 56;

/** 表示距離でつながる地点を集約。画面位置を受け取るのでLeafletなしでも検証できます。
 * 空間ハッシュで周囲のセルだけを調べます。同一セルに大量の地点がある最悪時はO(n²)。
 */
export function clusterLocations(
  locations: EventLocation[],
  project: (location: EventLocation) => ProjectedPoint,
  radius = clusterRadius,
): MapGroup[] {
  if (!Number.isFinite(radius) || radius <= 0)
    throw new Error("半径は正の有限数にしてください。");
  const points = locations.map(project);
  const parents = locations.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const cells = new Map<string, number[]>();
  points.forEach((point, index) => {
    const x = Math.floor(point.x / radius),
      y = Math.floor(point.y / radius);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${x + dx},${y + dy}`) ?? []) {
          if (
            Math.hypot(point.x - points[other].x, point.y - points[other].y) <=
            radius
          )
            parents[find(index)] = find(other);
        }
      }
    const key = `${x},${y}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  });
  const groups = new Map<number, EventLocation[]>();
  locations.forEach((location, index) => {
    const root = find(index),
      group = groups.get(root);
    if (group) group.push(location);
    else groups.set(root, [location]);
  });
  return [...groups.values()].map((members) => ({
    // 検索順やズームが変わっても、同じ構成のグループは同じマーカーを再利用します。
    key: JSON.stringify(members.map((location) => location.key).sort()),
    locations: members,
    eventCount: members.reduce(
      (count, location) => count + location.events.length,
      0,
    ),
    latitude:
      members.reduce((sum, location) => sum + location.latitude, 0) /
      members.length,
    longitude:
      members.reduce((sum, location) => sum + location.longitude, 0) /
      members.length,
  }));
}
