# d-map バックエンド — Phase 3.2

現在はDB・認証・グループ・参加・匿名統計まで実装しています。起動には仮想環境の依存導入→flask db upgrade→flask seed-demo→5000番起動が必要です。最新の手順と注意点は[ルートREADME](../README.md)と[API仕様](../docs/api-spec.md)、[DB設計](../docs/database-design.md)を参照してください。

以下はPhase 2.0の学習用記録です。

# d-map バックエンド — Phase 2.0

Flaskの環境構築と起動確認だけを行う学習用バックエンドです。APIは`GET /api/health`のみで、HTTP 200・JSON `{"status":"ok"}`を返します。DB・認証・イベント操作・ReactとのAPI接続は実装していません。

## Windows PowerShellで準備

Python 3.12以上を用意し、`py --version`で確認してください。`py`がなく`python`が利用できる場合は、以下の`py`を`python`に置き換えます。両方とも見つからない場合はPythonをインストールしてPowerShellを開き直してください。

プロジェクト直下から実行します。

```powershell
Set-Location backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest
```

`.venv`はこのプロジェクト専用のPythonとライブラリを置く場所です。既に作成済みなら作成コマンドは省略できます。仮想環境のPythonを直接指定するため、`Activate.ps1`の実行やPowerShellの実行ポリシー変更は不要です。Flask・pytestの直接依存は検証済みバージョンに固定しています（間接依存までは固定していません）。

## サーバー起動とAPI確認

`backend/`で実行します。開発用サーバーをローカルのポート5000で起動します。

```powershell
.\.venv\Scripts\python.exe -m flask --app app:create_app run --host 127.0.0.1 --port 5000
```

別のPowerShellで確認します。ブラウザで同じURLを開いてもJSONを確認できます。

```powershell
$healthResponse = Invoke-WebRequest -Uri http://127.0.0.1:5000/api/health -UseBasicParsing
$healthResponse.StatusCode   # 200
$healthResponse.Content      # {"status":"ok"} （末尾に改行あり）
$healthResponse.Content | ConvertFrom-Json
```

停止は起動したターミナルで`Ctrl+C`です。5000番ポートが使用中なら、既存プロセスの用途を確認してください。

フロントエンドは、さらに別のPowerShellをプロジェクト直下で開いて起動します。

```powershell
npm.cmd run dev -- --port 5173 --strictPort
```

`http://127.0.0.1:5173`を開きます。Reactは引き続き既存のデモデータを使います。現段階ではFlaskの起動有無によって地図・検索の動作は変わりません。Viteの設定やフロントエンドのコードは変更していません。

## ファイルと処理の流れ

| ファイル | 役割 |
| --- | --- |
| `app/__init__.py` | `create_app()`でFlaskアプリを作り、APIのルートを登録します。テストごとに独立したアプリを作れます。 |
| `app/routes.py` | `Blueprint`でURLをまとめます。`/api`と`/health`が組み合わさり、`GET /api/health`になります。 |
| `tests/test_health.py` | FlaskのテストクライアントでGETを送り、200・JSON形式・内容を確認します。POSTが405になることも確認します。実サーバーの起動は不要です。 |
| `requirements.txt` | インストールするFlaskとpytestのバージョンを指定します。 |

アクセスすると`health()`が呼び出され、`jsonify(status="ok")`がPythonの値をJSONのHTTPレスポンスに変換します。`, 200`は成功のステータスコードです。これは応答の確認であり、DBや他サービスの正常性を確認するものではありません。

## 初めて学ぶ用語

| 用語 | 意味 |
| --- | --- |
| Flask | PythonでWebサーバー側の処理を作るための小さなフレームワークです。URLと処理を結び付けます。 |
| API | プログラム同士が決められた形式で情報をやり取りする窓口です。今回はヘルスチェックのURLが窓口です。 |
| GETリクエスト | サーバーから情報を取得するためのHTTPリクエストです。今回は状態を取得します。 |
| JSON | `{"status":"ok"}`のように、キーと値でデータを表すテキスト形式です。PythonとJavaScriptの両方で扱えます。 |
| 仮想環境 | プロジェクトごとにライブラリを分離する仕組みです。他のPythonプロジェクトとのバージョン競合を防ぎます。 |
| ReactとFlaskの分離 | Reactは画面や操作、Flaskはサーバー側の処理を担当します。別々に学習・テストでき、将来はAPIを通じて接続できます。 |

## 検証記録

2026年10月19日、Windows環境で以下を確認しました。

- Python 3.12.14 / Flask 3.1.3 / pytest 9.1.1。通常の`py`・`python`コマンドがこの実行環境では見つからないため、Codex付属Pythonで`backend/.venv`を作成しました。システムへのPython導入は行っていません。付属Pythonの場所は環境固有なので、通常の開発では上記のPython準備手順を使ってください。
- 仮想環境作成に使ったコマンド（プロジェクト直下）：`& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv backend/.venv`
- 初回のpipはパッケージを発見できなかったため、PyPIを明示した`python -m pip install -r requirements.txt --index-url https://pypi.org/simple`相当のコマンドを仮想環境内で実行し、導入成功。`pip check`も成功しました。
- pytest：2件成功。GETの200・JSON形式・内容、およびPOSTの405を確認しました。
- Flaskを5000番で実起動し、PowerShellからGETしてHTTP 200、`Content-Type: application/json`、`{"status":"ok"}`を確認しました。
- Viteを5173番で実起動しHTTP 200を確認。ブラウザで検索フォーム・7件の一覧・Leafletのマーカーを確認し、一覧からイベント詳細が開くことを確認しました。
- 既存Vitest：77件成功。`npm.cmd run build`（TypeScript型チェックを含む）成功。
- ESLintはPythonキャッシュの探索でエラーになったため、既存の除外設定に`backend/**`を追加し、`npm.cmd run lint`の成功を確認しました。React・TypeScript・Vite・Leafletのソースと依存関係は変更していません。
- フロントエンドのE2E全件は今回再実行していません。画面はブラウザで簡易確認しました。

`.venv/`・`__pycache__/`・`.pytest_cache/`はルートの`.gitignore`で除外し、実際の生成ファイルが除外されることを`git check-ignore`で確認しています。ESLintはPython専用の`backend/`を対象外にしています。仮想環境はコピーして共有せず、各環境で作成してください。

参考：[Flaskのインストール](https://flask.palletsprojects.com/en/stable/installation/)、[アプリファクトリ](https://flask.palletsprojects.com/en/stable/tutorial/factory/)、[テストクライアント](https://flask.palletsprojects.com/en/stable/testing/)。
