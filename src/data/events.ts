import type { DanceEvent } from "../types/event";
import { getTodayJst } from "../lib/calendar";
// All venues, organizers and events below are fictional demo data.
const originalEvents: DanceEvent[] = [
  {
    id: "1",
    title: "放課後 HIP HOP PRACTICE",
    type: "練習会",
    genre: "HIP HOP",
    startAt: "2026-10-24T17:00:00+09:00",
    endAt: "2026-10-24T20:00:00+09:00",
    venueName: "スタジオ・コモンズ 渋谷",
    address: "東京都渋谷区神南（架空の会場）",
    latitude: 35.664,
    longitude: 139.7,
    feeYen: 500,
    organizerName: "Tokyo Groove Lab",
    participationRule: "初心者歓迎。室内シューズを持参してください。",
    description:
      "それぞれのペースで踊れるオープンな練習会。基礎練習からサイファーまで、気軽に一緒に踊りましょう。",
    visibility: "public",
  },
  {
    id: "2",
    title: "HOUSE MUSIC, GOOD PEOPLE",
    type: "セッション",
    genre: "HOUSE",
    startAt: "2026-10-24T19:00:00+09:00",
    endAt: "2026-10-24T22:00:00+09:00",
    // 同じ会場の別イベント。重なったピンから両方に辿り着けることを確認できます。
    venueName: "スタジオ・コモンズ 渋谷",
    address: "東京都渋谷区神南（架空の会場）",
    latitude: 35.664,
    longitude: 139.7,
    feeYen: 1000,
    organizerName: "Step Together",
    participationRule: "経験不問。音楽を楽しみたい方ならどなたでも。",
    description:
      "ハウスミュージックでつながる夜。自由なステップを交換するセッションです。",
    visibility: "public",
  },
  {
    id: "3",
    title: "BREAKING 基礎をつなぐ",
    type: "ワークショップ",
    genre: "BREAKING",
    startAt: "2026-10-25T13:00:00+09:00",
    endAt: "2026-10-25T15:00:00+09:00",
    venueName: "サークルベース 池袋",
    address: "東京都豊島区東池袋（架空の会場）",
    latitude: 35.729,
    longitude: 139.716,
    feeYen: 1500,
    organizerName: "Floor Notes",
    participationRule: "初級者向け。動きやすい服装で参加してください。",
    description:
      "トップロックとフットワークをゆっくり練習し、自分の流れを作ります。",
    visibility: "public",
  },
  {
    id: "4",
    title: "LOCK & SHARE",
    type: "練習会",
    genre: "LOCK",
    startAt: "2026-10-24T14:00:00+09:00",
    endAt: "2026-10-24T17:00:00+09:00",
    venueName: "リズムルーム 上野",
    address: "東京都台東区上野（架空の会場）",
    latitude: 35.71,
    longitude: 139.775,
    feeYen: 0,
    organizerName: "Funky Circle",
    participationRule: "初心者歓迎。途中参加・退出できます。",
    description: "ロックの基礎を共有する練習会。得意な動きを教え合いましょう。",
    visibility: "public",
  },
  {
    id: "5",
    title: "MIDNIGHT POP SESSION",
    type: "セッション",
    genre: "POP",
    startAt: "2026-10-24T23:00:00+09:00",
    endAt: "2026-10-25T02:00:00+09:00",
    venueName: "ナイトフロア 下北沢",
    address: "東京都世田谷区北沢（架空の会場）",
    latitude: 35.662,
    longitude: 139.668,
    feeYen: 1200,
    organizerName: "Late Groove",
    participationRule: "18歳以上。帰宅手段は各自で確保してください。",
    description:
      "日付をまたいで踊るポップセッション。ヒットやウェーブを自由に試せます。",
    visibility: "public",
  },
  {
    id: "6",
    title: "WAACK はじめの一歩",
    type: "ワークショップ",
    genre: "WAACK",
    startAt: "2026-10-25T16:00:00+09:00",
    endAt: "2026-10-25T18:00:00+09:00",
    venueName: "アトリエ・ムーブ 目黒",
    address: "東京都目黒区目黒（架空の会場）",
    latitude: 35.634,
    longitude: 139.71,
    feeYen: 2000,
    organizerName: "Arms & Soul",
    participationRule: "未経験者歓迎。タオルと飲料を持参してください。",
    description:
      "腕の動きと音の取り方を学ぶ入門クラス。最後は音楽に合わせて踊ります。",
    visibility: "public",
  },
  {
    id: "7",
    title: "SMALL CIRCLE BATTLE",
    type: "バトル",
    genre: "ALL STYLE",
    startAt: "2026-10-31T13:00:00+09:00",
    endAt: "2026-10-31T18:00:00+09:00",
    venueName: "オープンフロア 秋葉原",
    address: "東京都千代田区外神田（架空の会場）",
    latitude: 35.7,
    longitude: 139.773,
    feeYen: 1000,
    organizerName: "Next Round",
    participationRule: "バトル初参加の方歓迎。観覧も可能です。",
    description:
      "小さな輪から始まるオールスタイルバトル。自分らしい一歩を楽しみましょう。",
    visibility: "public",
  },
  {
    id: "8",
    title: "サークル内の練習予定",
    type: "練習会",
    genre: "HIP HOP",
    startAt: "2026-10-24T18:00:00+09:00",
    endAt: "2026-10-24T21:00:00+09:00",
    venueName: "非公開デモ会場",
    address: "非公開",
    latitude: 35.68,
    longitude: 139.76,
    feeYen: 0,
    organizerName: "デモサークル",
    participationRule: "所属メンバー限定",
    description: "公開画面には表示しないテスト用の架空データです。",
    visibility: "group",
  },
];

// 元の7公開イベントの意味を保持し、追加分は別の日に配置します。
const additions: DanceEvent[] = ([
  ["9", "KRUMP OPEN LAB", "KRUMP", "東京都", "新宿区西新宿", 35.69, 139.695],
  ["10", "JAZZ MOVEMENT", "JAZZ", "東京都", "中野区中野", 35.707, 139.665],
  ["11", "VOGUE EXCHANGE", "VOGUE", "東京都", "港区芝", 35.65, 139.75],
  ["12", "FREESTYLE CIRCLE", "FREESTYLE", "東京都", "杉並区高円寺南", 35.704, 139.65],
  ["13", "HOUSE STEP EXCHANGE", "HOUSE", "東京都", "武蔵野市吉祥寺本町", 35.704, 139.58],
  ["14", "LOCK EVENING", "LOCK", "東京都", "渋谷区神南", 35.6642, 139.7003],
  ["15", "YOKOHAMA JAZZ LAB", "JAZZ", "神奈川県", "横浜市中区桜木町", 35.451, 139.631],
  ["16", "KAWASAKI FREESTYLE", "FREESTYLE", "神奈川県", "川崎市川崎区駅前本町", 35.531, 139.697],
] as const).map(([id, title, genre, prefecture, area, latitude, longitude], index) => ({
  id, title, genre, prefecture, latitude, longitude,
  type: index % 2 ? "セッション" : "練習会",
  startAt: "2026-11-01T15:00:00+09:00",
  endAt: "2026-11-01T18:00:00+09:00",
  venueName: `デモフロア ${area}`,
  address: `${prefecture}${area}（架空の会場）`,
  feeYen: 500 + index * 100,
  organizerName: `架空デモ主催 ${index + 1}`,
  participationRule: "初心者歓迎。室内シューズ・飲料を持参してください。",
  description: "練習と交流を楽しむ架空のデモイベントです。実際の開催・募集はありません。",
  visibility: "public",
}));

/** JSTの今日+5日と元の基準日を比較し、全イベントを同じ日数だけ未来へ移動。 */
export function createDemoEvents(now: Date = new Date()): DanceEvent[] {
  const reference = Date.parse("2026-10-24T00:00:00+09:00");
  const future = Date.parse(`${getTodayJst(now)}T00:00:00+09:00`) + 5 * 86400000;
  const shift = Math.max(0, future - reference);
  const move = (iso: string) => new Date(Date.parse(iso) + shift + 9 * 3600000)
    .toISOString().slice(0, 19) + "+09:00";
  return [...originalEvents.filter(event => event.visibility === "public"), ...additions]
    .map(event => ({ ...event, prefecture: event.prefecture ?? "東京都",
      startAt: move(event.startAt), endAt: move(event.endAt) }));
}
export const demoEvents = createDemoEvents();
// 既存の非公開データは削除せず保持。公開データの取得口には混ぜません。
export const restrictedDemoEvents = originalEvents.filter(event => event.visibility === "group");
