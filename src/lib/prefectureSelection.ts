import { prefectures, type Prefecture } from "../data/prefectures";

export function togglePrefecture(selected: readonly Prefecture[], name: Prefecture): Prefecture[] {
  const next = new Set(selected);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return prefectures.map(([prefecture]) => prefecture).filter(prefecture => next.has(prefecture));
}

export function findPrefectures(query: string) {
  const text = query.normalize("NFKC").trim();
  return prefectures.filter(([name]) => name.includes(text));
}

export function prefectureSummary(selected: readonly Prefecture[]): string {
  if (!selected.length) return "全国";
  if (selected.length <= 2) return selected.join("・");
  return `${selected[0]} ほか${selected.length - 1}（${selected.length}都道府県）`;
}
