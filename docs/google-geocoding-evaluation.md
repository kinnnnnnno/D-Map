# Google Geocoding評価準備 — Phase 3.2.5

調査日：2026-10-27（日本時間）。本書は開発者本人の課題に対する技術調査であり、外部ユーザーテスト・本番採用の承認ではない。

## 現在の状態と判断

**Googleは全10施設未測定。実通信0件。移行判断は保留。** 実行環境の `GOOGLE_GEOCODING_API_KEY` は未設定。Google Cloudアカウントの請求・API有効化・上限・契約はアクセスも確認もしていない。キーがないため勝手に発行せず、Cloud側上限未確認のまま問い合わせない。単体テストのGoogle応答はすべて架空モックで、実測の代わりにしない。

React/Leaflet、Flask `/api/geocode`、DB、既存の位置確認処理は変更しない。準備したCLIは `backend/tools/evaluate_google_geocoding.py`。FlaskやアプリのDBをimportせず、Python標準ライブラリだけで動く。

## 実行前にユーザー本人が行うこと

以下のCloud操作は本作業では行っていない。各設定を確認してから次へ進む。契約・請求を開始したくない場合はdry-runで停止してよい。

1. [Google Maps Platform利用規約](https://cloud.google.com/maps-platform/terms?hl=en)、[サービス固有規約](https://cloud.google.com/maps-platform/terms/maps-service-terms)、[Geocodingポリシー](https://developers.google.com/maps/documentation/geocoding/policies)を読む。請求先がEEAの場合は専用規約を確認し、本書の非EEA条件を流用しない。
2. Google Cloud Consoleで検証専用のプロジェクトを選ぶ。既存本番プロジェクト・キーを共有しない。
3. 本人の意思で請求先を設定・関連付ける。無料枠があっても有料利用の可能性があり、料金・税・支払い条件を確認する。エージェントは登録・契約・請求先作成をしていない。
4. Geocoding APIを有効化する。今回Maps JavaScript APIやPlaces APIの有効化は不要。
5. Google Maps Platform → Quotas（割り当て）でGeocodingの適用可能な日次上限を小さく設定する（初回は例10件/日）。分あたり上限も必要最小限とし、保存・適用後の値と残り使用量を確認する。UIに該当上限がない、変更が反映されない、権限がない場合は実通信しない。日次上限のリセットは太平洋時間基準で、JSTの0時ではない。
6. Billingで検証用予算と通知先を設定する。**通知だけの予算は利用停止・支出上限ではない。** Spend cap機能を利用する場合も対象サービス・プロジェクトへの適用を確認する。Geocodingの割り当てとAPIキー制限を併用し、通知だけを安全装置にしない。
7. 検証専用のAPIキーを本人が作成する。API制限はGeocoding APIのみにし、アプリ制限は送信元の公開IPに絞る。サーバー向けRESTキーにWebサイトのHTTP referrer制限を流用しない。動的IP/プロキシ/NATで送信元を限定できない場合は、制限を外して実行せず、安全な固定送信元を用意する。
8. キーを下記の現在のPowerShellプロセスの環境変数へ設定する。ソース、`.env.example`、チャット、スクリーンショット、CLI引数へ実値を書かない。`VITE_`で始まる変数を使わない。
9. 個人宅を含まない既存公開施設セットと参照点の出典を確認する。既定では1施設だけ。最初は独立参照点がある江戸川区役所を選ぶ。
10. コンソールの請求/割り当て/キー制限を再確認した場合だけ、許可フラグを付ける。フラグは本人の確認宣言であり、スクリプトがCloud設定を自動検証した証拠ではない。
11. 実行後は実行件数とConsoleの使用量を確認し、キーを無効化するかGeocoding APIを停止し、環境変数も解除する。スクリプトを何度も実行すれば毎回上限10件が加算される。スクリプト単体は月間予算の上限を保証しない。

設定根拠：[利用と割り当て](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)、[キーの制限](https://developers.google.com/maps/api-security-best-practices)、[予算通知の注意](https://docs.cloud.google.com/billing/docs/how-to/budgets)。サービスの一般QPMをローカル検証の目標にしない。

## PowerShellでの実行

プロジェクト直下で実行。既存のbackend仮想環境を使い、新しい依存は追加しない。

```powershell
# 準備だけ。キーがあっても既定では通信しない。
backend\.venv\Scripts\python.exe backend/tools/evaluate_google_geocoding.py --limit 10

# 以降は本人がCloud設定を確認した場合だけ。入力内容を履歴に直接残さない。
$key = Read-Host 'Google Geocoding検証キー（画面に表示しません）' -AsSecureString
$env:GOOGLE_GEOCODING_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
Remove-Variable key

# まず1施設。対話ターミナルで実行し、>、Tee-Object、Start-Transcript等を使わない。
backend\.venv\Scripts\python.exe backend/tools/evaluate_google_geocoding.py --live --allow-paid-requests --quota-confirmed --terms-reviewed --facility edogawa

# 同じ条件を確認したうえで最大10施設。上の1件と合わせると11試行なので、日次残量に注意。
# backend\.venv\Scripts\python.exe backend/tools/evaluate_google_geocoding.py --live --allow-paid-requests --quota-confirmed --terms-reviewed --limit 10

# 作業後（キー自体のCloud側無効化も別途行う）
Remove-Item Env:\GOOGLE_GEOCODING_API_KEY
```

キー未設定、dry-run、許可不足、対話端末でない場合は外部通信0件で設定案内を表示する。`--limit`は1〜10のみ。`--facility`は既存IDだけで任意住所を受け付けない。公開施設JSONの内容ハッシュが変更されていれば停止し、私宅などへのすり替わりを防ぐ。施設セットを更新する際は出典を確認し、コードとテストをレビューしてからハッシュを変更する。

通信先は固定HTTPSのGeocoding API v3 JSON。`address`には既存セットの半角ハイフン表記をそのまま送り、`language=ja,region=jp,components=country:JP`を付ける。送信入力とnormalizedは同じ（既存セットが既に標準形）。本番正規化ロジックの変更・自動フォールバック・別表記の追加検索はしない。1施設1リクエスト、合計最大10、間隔1.1秒、タイムアウト6秒、応答256KiB上限。自動再試行・別ホストへのリダイレクトを禁止する。

ZERO_RESULTSは0件として次へ進む。それ以外のGoogle拒否・OVER_QUERY_LIMIT/OVER_DAILY_LIMIT、HTTPエラー、タイムアウト、不正応答では残りの問い合わせを停止する。URL・キー・Googleのerror_message・例外本文・生レスポンスをログ出力しない。取得内容にキーが反射された場合も出力前に除去する。

REQUEST_DENIEDならキー/API有効化/IP制限を、OVER_QUERY_LIMIT/OVER_DAILY_LIMITなら割り当て・請求状態をConsoleで確認する。UNKNOWN_ERROR/HTTP障害は自動再試行せず、本人が状況・残量を確認してから別の実行を判断する。ZERO_RESULTSを位置精度の成功としない。

## 結果の扱いと精度判定

対話端末へ `Google Maps` の帰属を付け、リクエスト試行数、HTTPステータス、Googleステータス、入力、formatted_address、geometry.location、location_type、partial_matchの有無、独立参照との距離を表示する。最大5候補を評価し、元の候補数も表示する。HTTP成功やROOFTOPだけで正確と認定しない。

|location_type|解釈|確認できないこと|
|---|---|---|
|ROOFTOP|サービスが番地精度の位置情報として分類|会場の建物入口・入力番地との一致の保証|
|RANGE_INTERPOLATED|道路等の位置を補間した概算|実測の建物位置|
|GEOMETRIC_CENTER|道路・領域等の形状中心|番地/入口の位置|
|APPROXIMATE|概略位置|正確な開催場所|
|未知の分類|精度不明として扱う|上位分類への推測|

`partial_match=true`は一致不足として区別する。項目省略と明示falseを区別して記録するが、省略は番地の正しさの証明ではない。`addressTextMatched`は国名/郵便番号/空白/全角表記を比較用に除いた全文一致だけをtrueとする。表記差があればnull=未確認で、不一致と断定しない。`houseNumberVerified`は人による確認がないためnull。自動的に番地一致/入口一致を成功扱いしない。

参照点は既存セットの江戸川区役所1件のみ。自治体公開の施設代表点との球面概算距離を計算し、入口距離とはしない。他9件はnull/「距離検証不可」。Google・Geolonia・Nominatimの返却位置を正解として流用しない。

## 保存・表示の条件

2026-10-27に非EEA向け現行規約を確認した。

- Geocodingは地図なしでも使えるが、地図と併用する場合に非Google地図へ載せることは禁止されている（サービス固有規約6.1/6.2）。今回のCLIは地図を表示しない。Google Mapsの帰属を表示する。
- キャッシュ一般は制限され、緯度経度は6.3.1で最大30日間の一時保存の例外がある。6.3.2には要求を開始した利用者向け機能に限り、利用者ごとの分離・追加呼び出しの代替にしない等の条件付き長期保存例外もある。**比較用の公開データセットや全員共有のイベントDBへ無期限保存できるという意味ではない。** place_idの例外も、結果全体の保存許可ではない。
- 本CLIは例外を広く解釈せず、Google由来の候補/住所/精度/距離等をディスク・DB・公開JSONへ一切保存しない。処理中メモリと対話表示だけとし、終了時に保持しない（Pythonによるメモリの完全消去を保証するものではない）。保存用オプション・キャッシュ・再読込機能を設けていない。キー・結果をshell transcript/録画/同期ファイルにも残さない。
- stdoutリダイレクトを検出したら通信を禁止する。外部の端末ログ設定は検出できないため、利用者が無効化する。Google由来のformatted_address/location_type/partial_matchを「30日なら全て保存可」と扱わない。
- 今回コミット候補になるのはツール・架空モック・手順・未測定という事実のみ。将来、実測内容やGoogleから派生した比較表を永続化/公開する前には契約上の許可範囲を別途確認する。生Googleレスポンスをdocs/fixturesへ追加しない。

根拠：[一般規約3.2.3](https://cloud.google.com/maps-platform/terms?hl=en)、[固有規約6](https://cloud.google.com/maps-platform/terms/maps-service-terms)、[帰属/保存ポリシー](https://developers.google.com/maps/documentation/geocoding/policies)。適用契約・地域・更新を実行前に確認する。

## 既存結果との比較と今回の測定範囲

|施設・住所|Google|Geoloniaの既存番地表記（住所level/座標level）|独立参照|
|---|---|---|---|
|東京都庁：東京都新宿区西新宿2-8-1|未測定|3/3、番地文字列一致なし|なし|
|江戸川区役所：東京都江戸川区中央1-4-1|未測定|8/8、文字列一致、参照点から47.4m・入口未確認|施設代表点あり|
|三鷹市役所：東京都三鷹市野崎1-1-1|未測定|3/3|なし|
|神奈川県庁：神奈川県横浜市中区日本大通1|未測定|3/3|なし|
|青葉区役所：神奈川県横浜市青葉区市ケ尾町31-4|未測定|3/3|なし|
|麻生区役所：神奈川県川崎市麻生区万福寺1-5-1|未測定|3/3|なし|
|千葉県庁：千葉県千葉市中央区市場町1-1|未測定|3/3|なし|
|流山市役所：千葉県流山市平和台1-1-1|未測定|8/3、文字列一致でも座標は町丁目|なし|
|埼玉県庁：埼玉県さいたま市浦和区高砂3-15-1|未測定|8/8、文字列一致・独立した位置精度は未確認|なし|
|和光市役所：埼玉県和光市広沢1-5|未測定|3/3|なし|

全10件の未測定理由は共通：キー未設定、Cloud側上限・請求/権限設定未確認。Googleの成功数/誤差/優位性は数値化しない。

NominatimのBUG-027実測は番地検索0件→別表記0件→町丁目1件、town/fallbackだった。元の詳細住所・座標は非公開化し、実測原本を改変せずGit除外領域へ保存した。公開版の架空回帰JSONは別の模擬データで、外部API実測ではない。架空住所の検索精度は未検証で外部送信しない。BUG-027対象は公開施設セットの10件に含めず、Googleへ送らない。都庁の既存Nominatim記録は番地付き0件→町丁目5候補で、番地精度未確認。公開施設の実測JSONは今回変更していない。

## 費用と移行の条件付き計画（未実装）

[Global料金表](https://developers.google.com/maps/billing-and-pricing/pricing)の2026-10-27確認値：Geocoding月10,000イベントまで無料枠、次の100,000件までの段階は1,000件US$5。Dynamic Mapsも月10,000ロード無料枠、次段階1,000ロードUS$7。無料枠・使用量はSKU/請求アカウントの適用条件を確認し、他プロジェクト分も含む。旧$200クレジットを前提にしない。

単純な例（他用途による枠消費なし・通常Global従量料金・各SKU100,000件以下・USD・税/為替/割引/他API料金を除く）：

|月間Geocoding/地図ロード|検索料|地図料|合計|
|---|---|---|---|
|1,000 / 5,000|$0|$0|$0|
|12,000 / 20,000|$10|$70|$80|
|50,000 / 50,000|$200|$280|$480|

検証10リクエストは未消費無料枠内なら$0だが、枠消費後の上記最初の有料段階なら単純計算$0.05。実請求の保証/契約上限ではない。毎回の別表記検索、リロード、キー漏えい、第三者利用、他SKUの有効化は費用を増やす。今回の実通信は0で、Cloudへの課金操作はしていない。

Googleの番地精度を独立参照で確認でき、料金/契約/保存設計が受け入れ可能になった場合だけ、次の移行を別Phaseで検討する。現時点でGoogleが優位・全面移行が必要とは判断できない。

|対象|将来の影響・検証|
|---|---|
|一覧地図 `EventMap.tsx`|Google Maps JSへの表示アダプター、読み込み失敗、中心/倍率/表示領域・選択元別移動を維持|
|登録地図 `LocationPicker.tsx`|クリック/ドラッグ/キーボードの代替、検索候補→ピン、解除/再確定、低精度警告を維持|
|詳細地図 `VenueMap.tsx`|同じ保存地点/帰属/モバイル描画、再ロード時の料金を検証|
|ジャンル・密集表示|Advanced Markers等と適切なクラスタリング手段の互換性/利用条件/アクセシビリティを選定。数字を件数と明示、同座標も全件選択|
|県/日時/ジャンル・一覧ページ|検索ロジックは共通化を維持。ページ操作で地図を作り直さず、県変更時だけ範囲調整|
|モバイル・拡大・モーダル|タッチ/キーボード、スクロール固定、Resize処理・フォーカス復帰の既存テストを移植|
|キー/課金|ブラウザはHTTP referrer+Maps JS限定の別キー、サーバーはIP+Geocoding限定。公開前に実効制限/利用上限/監視を検証|
|API/DBと保存|イベント自体の既存データを再検索・上書きしない。Google由来座標を長期共有保存できると仮定せず、由来/期限/利用者分離・帰属/削除/取得更新設計を契約と照合。許可がなければ採用しない|

公開アプリへ採用する前には、利用規約・プライバシーポリシーの公開、Googleの利用規約/プライバシーポリシーへの案内、帰属の表示も整備する。今回のCLI準備を、これらの公開準備の完了と扱わない。

## 自動検証

Google評価ツール専用pytestは37件成功（外部通信0）。初回のテストでCLI引数名の不整合とテスト補助の誤りを検出し修正、再実行して全件成功。dry-run10施設を実行しrequests=0/未測定を確認した。

pytest全件130成功、Vitest155成功、型チェック/ESLint/ビルド成功。E2E全120件は119成功/1失敗（既存統計テストの登録時にCSRF不一致）。画面より先にセッションCookieを確立するテスト初期化だけを追加し、該当PC/モバイル2件を再実行して成功した。修正後の全120件再実行は未実施。アプリの認証処理は変更しておらず、初回セッション取得の競合経路は別課題として残す。詳細は[品質改善記録](quality-improvements.md#phase-325google-geocodingの評価準備と移行判断保留)に記載した。
