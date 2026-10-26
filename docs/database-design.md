# DB設計とマイグレーション

SQLite / Flask-SQLAlchemy。instance/d-map.dbを使用し、DB・journal/WAL・鍵・仮想環境はGit除外。UTC日時はISO文字列（+00:00）として保存し、SQLiteのDateTime型でtzinfoを落とさない。日付のみのbirth_dateにはタイムゾーンを付けない。

| テーブル | キー・主要列 | 制約 |
| --- | --- | --- |
| event | UUID文字列id、既存デモは元ID。種別/ジャンル/日時/県/住所/緯度経度/料金/主催/条件/説明/公開範囲/group_id/creator_id/status/is_demo/capacity/walk_ins/created_at/updated_at | NOT NULL、料金>=0、公開範囲/状態列挙、限定はgroup必須、capacity正数またはNULL |
| user | 整数id、email、password_hash、dancer_name、任意ジャンル/活動県/年齢/同意、session_version | email UNIQUE/NOT NULL、ハッシュのみ保存。年齢/同意は本人API専用 |
| group | 整数id、name、created_by、created_at | 作成者User FK |
| membership | group_id＋user_id複合主キー、role | 1グループ1所属行、admin/member CHECK、User/Group FK CASCADE |
| invitation | UUID id、group_id、token_hash、expires_at、revoked | SHA256ハッシュUNIQUE、Group FK CASCADE |
| attendance | event_id＋user_id複合主キー、created_at | 二重登録不可、Event/User FK CASCADE |

全SQLAlchemy接続でforeign_keys=ON、busy_timeout=15000。event.creator_idはUser削除時SET NULL、group_idはGroup削除時CASCADE。ただしユーザー/グループの削除APIは本Phaseでは未提供。招待コードそのものはDBに保存しない。サブジャンルはJSON配列、APIで許可値・重複を検査。

## スキーマ履歴

1. f8cd889a7de3：初期event。
2. 55e2fecc5bb2：User/Group/Membership/Invitation、所有者・グループFK、デモ識別。
3. 3a0_checks：SQLiteのbatch再作成で省略される旧名なしCHECKを、名前付きで復元。
4. be5161f7b619：Attendance、定員、飛び入り、capacity CHECK。

`flask db upgrade`で適用する。開発用・通常起動ではcreate_allを呼ばない。pytestとE2Eの使い捨てDBのみcreate_allを利用し、別途「空DBから全移行」のテストで最終テーブルと制約を検証する。旧移行では名なしCHECK省略の警告が出るが、3a0_checksと後続移行後に名前付き制約が存在することを検証する。移行前にDBバックアップを取得し、失敗時は続行せずバックアップから復旧する。実ユーザーデータに対するdowngrade/破壊的移行は未検証。

## 初期データ

demo-events.jsonは既存15件（東京13、神奈川2）を移植。seed-demoは同じIDがあるとスキップし、編集・日時を上書きしない。初回はJST今日+5日と2026-10-24の遅い方へ全日時を同じ日数だけ移動。サンプルはis_demo=true、公開、creator_idなしであり、任意ユーザーが所有権を取得して編集する機能はない。時間が経過したDBをseed再実行しても未来へ自動更新しない。必要なら別の新規開発DBへ移行・投入し直す（既存DBを勝手に消さない）。

## 整合性の根拠

参加時はBEGIN IMMEDIATE → 可視性/本人/中止・終了/登録済み/件数/定員 → INSERT → COMMIT。一意制約だけでは定員を守れないため、検査より前の書き込みロックが必須。取消・定員変更・中止・削除も同じ直列化に含める。ロック取得失敗は503であり成功として扱わない。DB変更とAPI応答の間で別の更新が完了した場合、応答件数は再取得時点の最新値になり得る。
