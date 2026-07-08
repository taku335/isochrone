---
title: "M4: データ自動更新ワークフロー(週次 cron → 検証 → 自動 PR)"
labels: area:infra, type:feature
milestone: M4 公開・運用
blockedBy: 23, 9
---
## ゴール

CKAN の更新を週次で検知し、新フィードでデータを再生成・検証して自動 PR を作るワークフローを整備する。

## 作業内容

- `.github/workflows/data-update.yml`: 週次 cron + 手動トリガー
- #4 の更新確認 util で `last_modified` を比較 → 更新なしなら正常終了
- 更新ありなら: ダウンロード → pipeline → validate(#9)→ サイズゲート → 差分を PR 化(タイトルに feed_version、本文に統計サマリ)
- CKAN 解決失敗・validate 失敗はワークフローを fail させて通知(気付ける状態を作る)
- リハーサル手順: 手元で `last_modified` を偽装して PR 生成まで通す

## 受入基準

- [ ] 更新なし時: cron が正常終了し PR を作らない
- [ ] 更新あり(リハーサル): validate 通過後に PR が作られ、統計サマリが本文にある
- [ ] validate 失敗時にワークフローが fail する

## 検証方法

手動トリガー + last_modified 偽装リハーサル。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §10 データ更新手順
