# API仕様（Phase 3.2）

JSON、同一オリジンCookieセッション。GETは読み取り。更新（POST/PUT/DELETE）は事前に`GET /api/auth/session`でcsrfTokenを取得し、`X-CSRFToken`ヘッダーに設定する。ログイン/登録/ログアウト時にセッションが変わるため、古いCSRFを使い回さない。エラーは`{"error":"利用者向けメッセージ"}`。全応答Cache-Control:no-store。

| Method / URL | 内容・権限 |
| --- | --- |
| GET /api/health | 全員。200 `{"status":"ok"}`（DB readinessではない） |
| GET /api/events、/api/events/ | 全員。公開＋本人所属の限定イベントの配列 |
| GET /api/events/:id | 可視イベント。存在しない/部外者は404 |
| POST /api/events | 認証必須。公開は本人作成、限定は指定グループ管理者 |
| PUT /api/events/:id | 公開の作成者/限定の管理者。全編集項目を送る |
| DELETE /api/events/:id | 同上。204、参加行もFK CASCADE |
| GET /api/auth/session | user（本人のみ、未認証null）とcsrfToken |
| POST /api/auth/register | email/password/dancerName必須。201でログイン状態になる |
| POST /api/auth/login | email/password。200。失敗は一般的な401メッセージ |
| POST /api/auth/logout | 認証必須。同ユーザーの全既存セッションを失効 |
| GET /api/profile | 本人の非公開プロフィール |
| PUT /api/profile | 本人のみ。プロフィール全項目を送る |
| GET /api/groups | 本人所属のid/name/role |
| POST /api/groups | 認証必須。name。作成者を管理者にする |
| GET /api/groups/:id/members | メンバーのみ。id/dancerName/roleだけ返す |
| POST /api/groups/:id/invitations | 管理者。id/code/path/expiresAt（24h） |
| GET /api/groups/:id/invitations | 管理者。id/expiresAt/revoked、コードは再表示しない |
| DELETE /api/groups/:id/invitations/:inviteId | 管理者。招待を無効化 |
| POST /api/groups/join | 認証必須。`{"code":"..."}`、期限/無効化を検証 |
| POST /api/events/:id/participation | 本人の参加予定。空JSONのみ。201 |
| DELETE /api/events/:id/participation | 本人の参加取消。空JSON/本文なし。200、重複取消は冪等 |
| GET /api/events/:id/statistics | 可視イベントのみ。匿名集計。部外者404 |

## イベント形式

既存のid/title/type/genre/startAt/endAt/prefecture/venueName/address/latitude/longitude/feeYen/organizerName/participationRule/description/visibilityに、groupId/creatorId/status/isDemo/createdAt/updatedAt/capacity/walkIns/attendanceCount/remainingSlots/attendingを追加。日時はUTCのオフセット付きISO、表示はJST。visibilityはpublic/group、statusはscheduled/cancelled。capacity=nullは定員なし。参加予定人数は実出席人数ではない。公開範囲とgroupIdは作成後固定。作成/編集はタイムゾーン付き日時、終了>開始、正式県名、有効ジャンル/種別、有限な座標、非負整数参加費、正整数定員を検証。参加済み人数より小さい定員を拒否。

一覧はサーバー認可済み全件を返し、現在の規模では日時・ジャンル・都道府県OR・一覧ページ分割をReactで行う。地図用の別APIは設けず、同じ認可済み一覧を使用。将来サーバー検索を導入するときも共通認可を外さない。

## プロフィール

dancerName必須。mainGenre、subGenres配列、activityRegion、birthDate（YYYY-MM-DD）またはbirthYear、ageStatsConsent、genreStatsConsentは任意。両同意の初期値false。生年と生年月日の同時指定、未来/不正日付、120年を超える登録範囲などを拒否。パスワードは12〜128文字。プロフィールは他人のID指定で変更できず、ID/email/role等の余分な更新フィールドでは権限を変更できない。メール変更/パスワード変更は現在未提供。

## 統計形式

非表示時：`{"age":{"available":false,"message":"…"},"genre":{"available":false,"message":"…","method":"同意済みのメインジャンルのみ・1人1回答…"}}`。targetCount/items/averageAgeなどの元情報を返さない。

表示時はavailable:true、targetCount、items:[{label,count,percentage}]。年齢は10歳未満/10代/20代/30代/40代以上。年齢層ごとに5人以上、総対象5人以上が必要。1セルでも1〜4人なら内訳全体を非表示にし、総数との差分で少人数セルが復元されるのを避ける。0人セルは返さない。平均年齢は全対象が正確な生年月日の場合のみ、開催日のJST年月日時点で誕生日の月日を比較し、小数第1位に丸める。うるう日生まれは非うるう年の3/1で年齢が変わる表示ルール（法律上の年齢判定ではない）。生年のみは誕生日の前後でも同じ年代と確定する場合だけ分類し、その集計の平均はnull。境界を推測しない。

ジャンルも同意済みmainGenreのみ、1人1回答、サブジャンル不集計。5人未満/少数ジャンルセルは非表示。割合の分母はその統計のtargetCount。丸めで合計が100%と一致しない場合がある。同意取消や参加取消後の次回GETに即時反映し、サーバーに統計キャッシュは持たない。

## エラー

400: 入力/CSRF/期限切れ招待、401: 未認証/ログイン失敗、403: 閲覧できるが管理権限なし/Origin不一致、404: 存在しないまたは閲覧不可、409: 重複/満員/中止/終了/定員縮小競合、503: SQLiteロックなどDB利用不可。HTTPエラーからSQL、住所、トークンや他者の年齢等を返さない。

## UI-016：開催場所の住所検索

`POST /api/geocode`（ログイン・CSRF必須）。リクエスト例：`{"query":"公開施設名"}`。検索語は前後の空白を除き2〜200文字。

成功時は200、`[{"label":"施設名・住所","latitude":35.69,"longitude":139.7}]`。最大5候補、候補なしは空配列。400：不正入力/CSRF、401：未認証、429：短時間の再検索、502：外部サービスの失敗/不正レスポンス、503：未設定/設定不備/キャッシュロック。エラー本文は既存形式の`{"error":"日本語の説明"}`。

管理者が環境変数`GEOCODING_URL`で設定したNominatim Search互換サービスへ中継します。URLは利用者から受け取りません。外部通信はタイムアウト6秒、レスポンス最大256KiB。キャッシュ・利用条件・設定方法はREADMEのUI-016節を参照。イベントDBのスキーマ・既存CRUD API・認可は変更していません。選択した座標は既存の`latitude`・`longitude`で保存します。

### Phase 3.2.1の住所検索結果

`POST /api/geocode`と`POST /api/geocode/`を受け付けます。既存のquery入力形式は維持し、入力住所を検索語に使用します。候補は`label`（所在地を含む表示住所）、`latitude`、`longitude`、`prefecture`（正式名称が判別できなければnull）、`accuracy: "unknown"`を返します。Nominatimのaddressdetails=1を要求し、都道府県は構造化されたstate/provinceから正式名称を認識できた場合のみ返します。importance等の関連度を座標精度に読み替えません。

住所詳細を持たない旧キャッシュを再利用しないようキーをaddress-v2に変更。レート制限・通信直列化・帰属表示・最大5件・キャッシュ上限/期限・認証/CSRFは維持しています。外部サービスの404は502の日本語エラーに変換し、内部の生エラーメッセージを転送しません。

位置の「確定」は誤操作防止のReact状態です。イベントAPIの座標・住所の保存形式とDBは変更していません。既存APIの座標範囲検証は維持していますが、住所と座標の一致をサーバーが保証する機能ではありません。

## Phase 3.2.2：逆ジオコーディング

`POST /api/reverse-geocode`（末尾スラッシュ可、ログイン・CSRF必須）。本文例：`{"latitude":35.658034,"longitude":139.701636}`。有限数のみ許可し、真偽値・文字列・緯度±90/経度±180の範囲外は400。

成功200：`{"label":"近隣の住所","prefecture":"東京都","latitude":35.658034,"longitude":139.701636,"accuracy":"estimated"}`。住所未取得は200のnull。外部障害502、未設定/本番の公開Nominatim接続/ロック競合は503、通信間隔違反は429。返す座標は利用者の選択座標であり、近隣OSMオブジェクトの座標へ置き換えません。

検索と逆検索は共有キャッシュ・通信制限を使用します。都道府県は正式名称のほか、ISO3166-2のJP-01〜JP-47と認識可能な略称を正式名称に正規化します。その他は不明。検索のaccuracyはunknown、逆検索はestimatedで、精度保証ではありません。

開発用設定はbackend/.env.exampleを参照。実稼働の接続先は利用者のJSONから受け取らず、管理者設定のみを使います。本番では公開Nominatimを拒否します。イベントDBとイベント保存APIの形式・認可・座標バリデーションは変更していません。
