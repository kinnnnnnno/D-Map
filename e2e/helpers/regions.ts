import { expect, type Page } from "@playwright/test";

export async function chooseRegions(page: Page, names: string[]) {
  await page.getByRole("button", { name: "都道府県を選択", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "都道府県を選択", exact: true });
  if (!names.length) await dialog.getByRole("checkbox", { name: "全国", exact: true }).check();
  else {
    // 全国への中間切替を挟まず、利用者と同じチェック操作で対象を入れ替える。
    for (const name of names) await dialog.getByRole("checkbox", { name, exact: true }).check();
    const checked = dialog.getByRole("checkbox", { checked: true });
    const labels = await checked.evaluateAll(nodes => nodes.map(node => node.parentElement!.textContent!.trim()));
    for (const name of labels) if (!names.includes(name)) await dialog.getByRole("checkbox", { name, exact: true }).uncheck();
  }
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
