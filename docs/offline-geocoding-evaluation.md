# Phase 3.3.3：住所検索のオフライン評価基盤

実装日：2026-11-16。Leaflet・Flaskの住所検索・イベントDBは変更しない。外部API通信、新規の位置データ収集、ABRデータのダウンロードは行っていない。既存10施設・46適用ケースの検索を再実行したものではなく、保存済み記録を読み直す評価基盤である。

## ファイルと実行方法

- `fixtures/geocoding-reference-ledger.json`：10施設の参照地点台帳。
- `../backend/tools/offline_geocoding.py`：標準ライブラリのみの共通形式・読み取り・検証・距離計算・集計。
- `../backend/tests/test_offline_geocoding.py`：架空データによる単体テストと既存記録の読み取り専用テスト。

プロジェクト直下のPowerShellから：

```powershell
backend\.venv\Scripts\python.exe backend/tools/offline_geocoding.py
backend\.venv\Scripts\python.exe backend/run_tests.py -q tests/test_offline_geocoding.py --tb=short
```

CLIは集計JSONだけを標準出力し、ファイルを書かない。Flask・DB・旧比較ツールを起動せず、キーや環境変数を読み取らない。ネットワーク処理は実装していない。ライブラリの `evaluate(cases, ledger)` は、各候補を含む共通評価結果を返す。元の実測JSONは変更しない。

## 台帳の意味

元の `geocoding-addresses.json` の施設ID・名称・住所・出典を引き継ぎ、元ファイルのSHA-256を記録した。施設IDは両データで共通。旧データを直接拡張する代わりに別ファイルとした。

|項目|現在の取り扱い|
|---|---|
|座標|江戸川区役所の1件のみ引継ぎ。他9件はnull|
|測地系 `coordinates.crs`|全件null。旧fixtureに明示がなく、緯度経度の数値だけでは確定しない|
|地点種類 `pointKind`|江戸川は旧記録の施設代表点を継承し、根拠を `pointKindBasis` に記載。他9件はunknown。入口と再認定していない|
|取得方法・座標出典|江戸川は既存の自治体CSV参照を引継ぎ。原測定方法は未確認|
|確認日|`ledgerReviewedAt` は既存記録を読んだ日。外部出典の確認日 `sourceCheckedAt` は全件null|
|位置の不確かさ|全件 `uncertaintyMeters:null`。0を埋めない|
|利用条件|江戸川の旧CC-BY表記は `recordedLicense` に保存。ライセンスURL・再配布条件は今回再確認しておらず未確認|
|独立性|全件unknown。公開元が自治体でも、座標の原典が評価サービスと独立だと推測しない|
|検証状態|江戸川はneeds-review、他9件はreference-missing|

`verified`、`independent`、再配布の`confirmed`は、根拠の確認後に設定する項目であり、距離を出すためだけに変更しない。

## 共通評価形式

Pythonの `Coordinate`、`Candidate`、`Case` で表現し、読込・評価時にも分類やフラグを検査する。

|情報|保持する内容|
|---|---|
|識別と出所|provider、施設ID、表記種別、sourceFormat、providerVersion、evidence|
|住所認識|house-number / town / municipality / prefecture / unknown、番地文字列一致の三値フラグ|
|座標|緯度・経度・測地系、address-point / town-representative / municipality-representative等の種類|
|精度の原情報|rawAccuracy。GeoloniaのnormalizationLevelとpointLevelを分けて保持。ABR用にはmatchLevelとcoordinateLevelの数値欄を用意|
|フォールバック|検索語の省略と座標の下位階層への代替を別々のtrue / false / nullで保持|
|参照との比較|referenceKind、distanceMeters、distanceMeaning、issues、comparisonLimitations、verificationStatus|
|候補|候補配列の元順序、件数、第一候補のインデックス。近い候補への自動並べ替えなし|

`address-point` は入口・建物中心を意味しない。Geoloniaのレベル番号をABRの数値と同じ尺度とは扱わない。`rawAccuracy` の数値は元の分類の記録であり、メートル精度ではない。未知の値は上位分類へ推測しない。

旧Geolonia記録の `distanceMeters` と旧verdictは再利用しない。旧記録には測地系と検索語フォールバックの記録がないため、それぞれnullを保持する。座標レベルが住所認識レベルより低い場合だけ、下位階層の座標へのフォールバックとして記録する。Geoloniaの版は保存済みservice欄の数値から読む。

## ABRの受け入れ口と未実装範囲

`--abr backend/instance/reviewed-abr.json` で、レビュー済みの `abr-common-v1` 中間JSONを読める。ABRネイティブのAPI応答を自動解析するアダプターは今回実装していない。ABR実測結果が存在するという意味ではない。

トップレベルは `schemaVersion:1`、`provider:"abr"`、`providerVersion`（数値3区間の版またはnull）、`cases`。caseは `facilityId`、`variant`、`evidence`、`candidates`。候補は `coordinates:{latitude,longitude,crs}`、`recognition`、`coordinateKind`、`houseNumberMatched`、`queryFallback`、`coordinateFallback`、`rawAccuracy`。

現時点でrawAccuracyに許可するABR項目は `matchLevel`、`coordinateLevel`（0〜100の整数またはnull）のみ。これらが実ABRの特定版の生フィールドと一致すると主張していない。次Phaseで固定したABR版の実スキーマとマッピングを確認し、必要な原分類を保てるようテスト付きで拡張する。キー・URL・自由なエラー本文など、未知フィールドは中間JSONへ入れない。未対応形式は固定文のエラーとして拒否し、生データを標準出力へ反射しない。

ABR入力を指定しない場合、Geoloniaと同じ施設・表記の46件をunmeasured、該当表記なし4件をnot-applicableとする。ABR入力が一部だけの場合も、欠けたケースを未測定として補い、分母を暗黙に縮めない。中間形式の模擬テストはsyntheticであり実測に含めない。

## 距離と判定

距離は球面Haversine、半径6371008.8mの概算水平距離、表示は0.1m単位。測量精度の保証ではない。

- 座標欠損、数値以外、bool、非有限値、範囲外を検出する。
- 範囲外で、入れ替えれば有効範囲になる場合は緯度経度逆転の疑いも記録する。自動入れ替えはしない。両方の並びが範囲内になる逆転は数値だけでは判定できない。
- 明示的なWGS84 / EPSG:4326だけを同じ対応済み座標系として扱う。JGD2011などは変換未実装のため、同一名称でも自動比較しない。
- 参照地点の種類がunknownの場合も距離を出さない。
- 条件を満たして距離を計算できても、それだけで独立した精度検証とはしない。参照の確認・独立性・再配布条件・不確かさが未確認ならprecision-unverified。
- 独立比較可能な状態でも `reference-comparison-available` とするだけで、位置の合否は自動認定しない。`entranceVerified` は常にfalse。0mでも入口案内の成功とはしない。
- 番地検索成功の集計は、番地認識と文字列一致に加え、両フォールバックが明示的にfalseのときだけ。住所認識の指標であり座標精度とは別。nullは成功として数えない。

## 集計と現状

第一候補だけをケース集計へ使う。第二候補等も個別評価結果として残すが分母を増やさない。施設数はIDを重複排除する。施設の評価可能数は「少なくとも1つの実測ケースが独立比較可能」の施設数であり、全表記が成功した意味ではない。表記別集計も併記する。

|保存済みデータの読取結果|Geolonia|ABR|
|---|---:|---:|
|施設数|10|10|
|適用ケース|46|46|
|該当表記なし|4|4|
|既存実測記録|46|0|
|未測定ケース|0|46|
|新基準で距離算出可能|0|0|
|独立比較可能ケース / 施設|0 / 0|0 / 0|
|位置精度未検証ケース|46|46|

これは新規の検索実測ではない。距離算出0は検索失敗0件という意味でもなく、台帳・旧応答の測地系等が未確認のため比較を止めた結果。従来の47.4mという観測記録は変更せず、新評価で追認できていない。厳格な番地検索成功の集計も0だが、旧記録に検索フォールバック情報がないためで、全住所の認識失敗とは扱わない。

## 検証結果

専用テストの初回43件は成功。その後の追加テストで補助変数のスコープ誤り1件を検出し修正した。中間版の全件実行184件も成功したが、最終版の結果とは分ける。最終版では専用52成功・0失敗（0.36秒）、pytest全件185成功・0失敗（119.17秒、専用52件を含む）。既存のAlembic CHECK警告1件。フロントのテスト・ビルドは今回未実施。

テストではソケット接続を禁止する。架空の基準点・不確かさ・ABR分類を使用するテストと、保存済みJSONの読み取り専用テストを区別している。保存済み3ファイルのSHA-256不変、キー環境変数の非出力、未対応入力の非反射も検証する。

## Phase 3.3.4へ進む条件

1. 参照地点の測地系・地点種類・取得方法・不確かさ・独立性・利用条件を根拠付きで確認する。参照が得られない施設は未検証のまま残す。
2. ABRの対象版と使用データを固定し、ネイティブ精度フィールドの対応を定義・テストする。未知の分類をGeoloniaの番号へ置換しない。
3. データの更新時点・SHA-256・対象地域・候補順位・検索語省略を記録する実測マニフェストを追加する。
4. 比較対象・第一候補の選択規則・距離帯・欠測の分母を実行前に固定する。全国への一般化や入口精度の採否判定は少数例だけで行わない。
5. 実測開始は別途許可された範囲で行う。既存の実測を上書きせず、アプリの検索プロバイダーを自動で切り替えない。
