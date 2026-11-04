// 開発用の明示実行のみ。本番プロバイダーではなく、公開施設10件の比較に限定。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

if (!process.argv.includes("--live-public-data")) {
  throw new Error("外部公開データを使う場合だけ --live-public-data を指定してください。Nominatimへの通信はありません。");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lab = resolve(root, "backend/instance/geocoding-lab");
const { normalize, config, requestHandlers, version } = await import(pathToFileURL(resolve(lab, "node_modules/@geolonia/normalize-japanese-addresses/dist/main-node-esm.mjs")));
config.japaneseAddressesApi = "https://japanese-addresses-v2.geoloniamaps.com/api/ja";
const cache = resolve(lab, "data-cache");
await mkdir(cache, { recursive: true });
const network = [];
let last = 0, bytes = 0, stopped = false;
requestHandlers.http = async (url, options = {}) => {
  if (url.origin !== "https://japanese-addresses-v2.geoloniamaps.com") throw new Error("検証対象外のホストです。");
  const range = options.length !== undefined ? `bytes=${options.offset}-${options.offset + options.length - 1}` : "";
  const key = createHash("sha256").update(url.toString() + range).digest("hex");
  const path = resolve(cache, key + ".json");
  try {
    const hit = JSON.parse(await readFile(path, "utf8"));
    return new Response(Buffer.from(hit.body, "base64"), { status: hit.status });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (stopped || network.length >= 40 || bytes >= 20 * 1024 * 1024) throw new Error("検証用の通信上限または停止状態です。");
  await pause(Math.max(0, 1100 - (Date.now() - last)));
  const started = Date.now();
  const record = { path: url.pathname, range, status: null, bytes: 0, elapsedMs: null };
  network.push(record);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "d-map-geocoding-comparison/1.0 (10 public facilities; https://github.com/kinnnnnnno/D-Map)", ...(range ? { Range: range } : {}) }, signal: AbortSignal.timeout(15000) });
    record.status = response.status;
    if (!response.ok) { stopped = true; throw new Error(`公開データ取得失敗 HTTP ${response.status}`); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 3 * 1024 * 1024) throw new Error("検証用の1応答上限を超えました。");
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks); bytes += body.length; record.bytes = body.length;
    await writeFile(path, JSON.stringify({ body: body.toString("base64"), status: response.status }));
    return new Response(body, { status: response.status });
  } catch (error) { stopped = true; record.error = error.message; throw error; }
  finally { last = Date.now(); record.elapsedMs = Date.now() - started; }
};

const cases = JSON.parse(await readFile(resolve(root, "backend/instance/geocoding-cases.json"), "utf8"));
if (cases.length !== 50 || new Set(cases.map(row => row.id)).size !== 10) throw new Error("公開施設10件×5表記のケースだけを実行できます。");
const rows = [];
for (const item of cases) {
  if (!item.input) continue;
  try {
    const result = await normalize(item.input);
    rows.push({ id: item.id, variant: item.variant, result });
  } catch (error) {
    rows.push({ id: item.id, variant: item.variant, error: error.message });
  }
}
const target = resolve(root, "backend/instance/geocoding-geolonia-raw.json");
let acquisitionRuns = [];
try {
  const previous = JSON.parse(await readFile(target, "utf8"));
  acquisitionRuns = previous.acquisitionRuns ?? [{ at: previous.at, network: previous.network }];
} catch (error) { if (error.code !== "ENOENT") throw error; }
const at = new Date().toISOString();
acquisitionRuns.push({ at, network });
await writeFile(target, JSON.stringify({ at, version, rows, network, acquisitionRuns }, null, 2));
console.log(JSON.stringify({ version, cases: rows.length, errors: rows.filter(row => row.error).length, requests: network.length, bytes }));
