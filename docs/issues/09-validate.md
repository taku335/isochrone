---
title: "M1: データ検証コマンド(統計・参照整合性、CI 組込)"
labels: area:pipeline, type:test
milestone: M1 データ基盤
blockedBy: 8
---
## ゴール

生成データの品質を機械検証する `pipeline validate` コマンドを作り、CI と(将来の)自動更新 PR の必須ゲートにする。

## 作業内容

- 参照整合性: パターン → 停留所、trip → パターン、footpath → 停留所、service_id 参照の全件検査
- 単調性: trip 内時刻の非減少
- 統計レンジ検査: 停留所数・パターン数・便数が妥当なレンジ内(改正でも壊れない緩い検査)
- golden numbers 厳密一致はバージョン固定フィクスチャに対してのみ(改正で変わるため)
- 検査結果サマリ(件数統計)を出力し、CI ログで確認できるように

## 受入基準

- [ ] 実フィード生成物で validate が全チェック通過
- [ ] 人工的に壊したデータ(参照欠損・時刻逆転)で fail する単体テスト
- [ ] CI に validate ジョブが組み込まれている

## 検証方法

Vitest + CI 実行ログ。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §8 リスクと対応
