export const PAGE_SIZE = 10;
/** 検索結果全件を変更せず、一覧表示分だけを切り出します。 */
export function paginate<T>(items: readonly T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(totalPages, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * PAGE_SIZE;
  return { page, totalPages, items: items.slice(offset, offset + PAGE_SIZE),
    first: items.length ? offset + 1 : 0, last: Math.min(offset + PAGE_SIZE, items.length) };
}
