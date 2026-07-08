---
title: "M1: 事業者設定ファイル(config/agencies.json)と GTFS ダウンローダ"
labels: area:pipeline, type:feature
milestone: M1 データ基盤
blockedBy: 1
---
## ゴール

事業者定義を設定ファイルに集約し、CKAN API 経由で GTFS-JP zip を取得・キャッシュするダウンローダを作る。URL のハードコードは `config/agencies.json` のみに限定する。

## 作業内容

- `config/agencies.json`: 事業者 ID(`nagoya-cbus`)、表示名、CKAN エンドポイント、パッケージ ID、リソース選択ルール、ID プレフィックス
- `packages/pipeline` にダウンローダ: CKAN `package_show` でリソース URL と `last_modified` を解決 → zip をローカルキャッシュへ取得(`last_modified` が同じなら再取得しない)
- 更新確認 util(`last_modified` と手元 manifest の比較)を独立関数として公開 — #24 の自動更新ワークフローが再利用する

## 受入基準

- [ ] `pipeline download nagoya-cbus` で zip が取得・キャッシュされる
- [ ] CKAN 応答が変わらない場合、2 回目はネットワーク取得をスキップする
- [ ] CKAN の名前解決失敗時は非ゼロ終了(CI を fail させられる)

## 検証方法

実 CKAN に対して実行 + `package_show` 応答をフィクスチャ化した単体テスト。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §10 データ更新手順
