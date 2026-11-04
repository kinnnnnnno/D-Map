# GitHub公開準備（2026-10-28）

## 最終確認（同日・README整理後）

当初の30ファイルの差分と新規ファイルを確認した。依存モジュール・fixture・比較ツール・文書は下記一覧で追跡する。今回、正式テストの収集対象を指定する `backend/pytest.ini` と、従来READMEの履歴文書 `docs/development-history.md` を追加したため、候補は32ファイルになった。ステージング・commit・push・履歴変更はしていない。

### Git・機密情報の確認

- mainは `af91dc85808e6a911f0ed6969291d0bd8a3bfb6e`、4コミット、到達可能206オブジェクト。元の番地付き入力・全角入力・住所接頭部・返却住所等を非公開原本から抽出して照合し、mainでは一致なし。
- ローカル全406オブジェクトを監査。前回と同じ番地/座標条件の8 blobはmainから到達不能。追加の広い住所条件では11 blobで、これもmainから到達不能。条件の違う件数を匿名化による削除実績と扱わない。
- `.git`を書き換えず、Git除外の一時ディレクトリでmainのみのpackを生成・index化して内容を照合した。206オブジェクトでmain到達集合と一致し、上記の非公開blobを含まなかった。実pushはしていない。
- 一部の非公開blobはCodexのローカルtree参照から到達可能。通常のmain単独送信の対象ではない。`--mirror`、他参照の明示送信、`.git`全体の共有には別の漏えいリスクがある。
- `remote.origin.mirror`、`remote.origin.push`、`push.followTags`は未設定。将来の送信ではmainからmainへの明示的なrefspecを確認すること。新コミット作成後は到達集合が変わるため、ステージ内容と新しいmainを再確認する。
- 公開対象140ファイルとmainのblobをAPIキー・アクセストークン・秘密鍵の既知パターンで検査し、該当なし。メールアドレスはサンプル/無効ドメイン等を除く値を検出しなかった。固定パスワード・固定鍵の記述はテスト用データであり、実利用者の認証情報ではない。既知パターンの検査だけで、すべての秘密情報の不在を保証しない。
- Git管理・未追跡非除外ファイルに `.git`・非公開バックアップ・キャッシュ・DB・実 `.env`・仮想環境の混入なし。13ファイルの非公開バックアップはSHA-256一致。既存DBと秘密鍵は変更せず保持した。
- リモートへfetch/接続していない。手元のorigin/mainは最後に取得した参照であり、GitHub側の全参照や最新状態を検査したという意味ではない。

### READMEと履歴

READMEを現在の概要・機能・構成・QA事例・起動/検証方法・制約・本人/AIの担当範囲中心に再構成した。BUG-027の処理追跡、SQLiteの独立接続/プロセスによる同時参加、限定イベントのサーバー認可と統計抑制を説明する。従来のPhase別説明は `development-history.md` へ移し、当時の件数・仕様と明示した。本人の個別の設計/手動修正/レビューの分担は、確認できた範囲を超えて断定せず、公開前の本人確認を残す。

### 今回の検証

pytest全件の初回実行は、Git除外のバックアップ内にある旧テストを収集して1件の収集エラーとなった。バックアップは削除せず、pytest設定の `testpaths=tests` と `norecursedirs` で正式なテストのみ収集するよう修正した。修正後は133成功・0失敗、194.74秒。既存AlembicのCHECK反映警告が1件あり、移行制約のテストは成功した。

Vitestは155成功・0失敗。型チェック・ESLint・ビルド成功。全E2E・外部住所APIの再実測・スマートフォン実機検証は今回未実施。

不安定だった2ケースは、変更前にPC/モバイル各3回、計12件を実行し全成功（2.9分）。過去の失敗を解消した証明とはしない。過去のトレースでCSRFセッションGETが検証終了時に未完了/中断だったことを確認した。検索操作直後の5秒の描画検証がCSRF取得→検索→描画のすべてを待っていたため、検索POST応答200と、その後のReact/Leafletの座標を別々に検証するよう2ケースを修正した。固定sleep、タイムアウト延長、保護の無効化、アプリコードの変更はなし。

変更後もPC/モバイル各3回、計12件がすべて成功した（11.7分）。変更前12件（2.9分）と変更後12件は別々の部分実行であり、全120件の一括成功とは扱わない。並行検証や実行環境の負荷を統制した速度測定ではないため、所要時間から性能の改善・悪化を断定しない。過去の通信待ちが長かった根本原因は未特定。サーバー/実行環境の負荷、通信待ち、非同期更新などの可能性を断定しない。最終E2E変更後のESLint再実行も終了コード0で成功した。

### 公開判断と次の作業

確認した候補だけをレビューしてコミットし、mainだけを送信する前提では、元の非公開blobを送信する要因は確認されなかった。GitHubでのソース公開と、本番サービスの安全な運用は別の判断である。公開前に本人の担当範囲、ステージ差分、新コミットの到達集合、送信先・refspecを確認する。未解決のE2E原因や未実施項目は隠さず公開資料に残す。

## 詳細住所の取り扱い

公開可否が確認できないBUG-024・BUG-027の詳細住所を、`神奈川県架空市テスト区検証町7-8-9`などの明示的な架空住所へ置き換えた。UIの入力例も架空住所に統一した。町名だけのデモ所在地や、比較用の公開施設10件は今回の置換対象とは区別している。

元の外部API実測JSONは改変せず、Git除外領域 `backend/instance/publication-private/2026-10-28/` に移動した。関連ファイルの変更前コピーも同じ領域に保持し、`original-sha256.json` でバイト単位の一致を確認する。ここは公開用添付資料ではない。

公開用の `fixtures/bug027-synthetic-trace.json` はゼロから作った模擬応答で、元の実測値の匿名化コピーではない。`dataKind: synthetic-regression`、`measuredAt: null`、`externalRequests: 0` を明記した。座標も任意のテスト値であり、架空住所の実在・位置精度を示さない。元の実測に関する文書は識別情報を伏せ、観測された件数・精度分類を維持した。

`backend/tools/trace_geocoding.py` は模擬応答専用に変更した。実サービスへ接続せず、一時DB・キャッシュでFlaskの処理を確認する。新しい架空住所の外部API検索精度は未検証。公開施設の既存実測ファイルは改変していない。

## 前回のテスト（履歴）

- 関連pytest：82件成功、0件失敗（住所正規化・検索・Google比較ツール・公開fixture）。全pytestは今回未実施。
- Vitest：155件成功、0件失敗。
- 型チェック・ESLint・ビルド：成功。
- 関連Playwright：初回26件中24成功・2失敗（7.9分）。失敗ケースと対になるPC/モバイルの再実行は4成功・0失敗（3.1分）。コード・期待値を変えずに再実行したが、初回タイムアウトの原因は未特定。全E2E・実機検証は今回未実施。
- 外部ジオコーディングAPIの実通信：0件。モック結果を実測精度の改善として扱わない。

## 次のコミットに必要なファイル

以下は今回の変更だけでなく、作業開始時から存在した未コミット変更を含む候補一覧。ステージング・コミットは行っていない。個別にレビューすること。

- `README.md`
- `backend/app/geocoding.py`
- `backend/app/validation.py`
- `backend/pytest.ini`
- `backend/tests/test_geocoding.py`
- `docs/api-spec.md`
- `docs/quality-improvements.md`
- `docs/security-checklist.md`
- `e2e/location-editor.spec.ts`
- `e2e/phase-3-2.spec.ts`
- `e2e/phase-3.spec.ts`
- `src/components/EventEditor.tsx`
- `src/components/LocationPicker.tsx`
- `src/lib/location.test.ts`
- `src/lib/location.ts`
- `backend/app/japanese_address.py`
- `backend/tests/test_google_geocoding_evaluation.py`
- `backend/tests/test_japanese_address.py`
- `backend/tests/test_prefecture_location.py`
- `backend/tests/test_publication_fixtures.py`
- `backend/tools/compare-geolonia.mjs`
- `backend/tools/evaluate_google_geocoding.py`
- `backend/tools/geocoding_comparison.py`
- `backend/tools/trace_geocoding.py`
- `docs/fixtures/bug027-synthetic-trace.json`
- `docs/fixtures/geocoding-addresses.json`
- `docs/fixtures/geocoding-geolonia-results.json`
- `docs/fixtures/geocoding-nominatim-observation.json`
- `docs/geocoding-comparison.md`
- `docs/google-geocoding-evaluation.md`
- `docs/publication-preparation.md`
- `docs/development-history.md`

依存関係：`geocoding.py`・`validation.py` は新規 `japanese_address.py` と一緒に確認する。検索テスト・E2E・オフライン追跡ツールには新規の模擬JSONが必要。Google評価ツール・Geolonia比較ツールには公開施設fixtureが必要。READMEから参照する比較文書も含める。未追跡ファイルを省いて既存ファイルだけコミットすると、import・fixture読み込み・文書リンクが欠落する。

`.env`、`backend/instance/`、DB、開発秘密鍵、キャッシュ、バックアップ、テスト成果物、仮想環境は含めない。旧公開パスの実測JSONは元から未追跡だったため、移動はGitの削除一覧には出ない。

## 残存リスク

作業ツリーの置換では過去のGitオブジェクトは消えない。監査時点のローカル全380オブジェクト（285 blob・91 tree・4 commit）を調べ、元の番地付き入力または座標に一致するblobが8個あった。mainの4コミットから到達できるblobには一致なし。前回の広い地名等を含む監査では14個で、検出条件が異なるため減少を削除の成果とは扱わない。公開候補ファイルでは元の番地付き入力・座標の一致なし。地名・郵便番号・地物IDの追加検索でも公開候補に元の識別情報は検出しなかった。検出には限界があり、あらゆる個人情報の不在を保証するものではない。履歴書き換え・オブジェクト削除は行っていない。

既存キャッシュ、元の実測、失敗時トレースなどGit除外領域には元の住所が残り得る。作業フォルダーや `.git` を丸ごと配布しない。`git add -f` や `push --mirror` は避け、公開前にコミット対象と送信する参照を再確認する。リモートへのfetch・push・公開設定変更は今回行っていないため、リモート全体の現況は未確認。
