---
title: "M3: 到達圏ポリゴン生成(徒歩バッファ union、性能受入 <1.5s)"
labels: area:frontend, type:feature
milestone: M3 フロントエンド
blockedBy: 18
---
## ゴール

探索結果から 30 分 / 60 分の到達圏ポリゴンを Web Worker 内で生成する。目標 <1.5s。

## 作業内容

- 到達停留所ごとに `残余分 = 制限 − 到着分`、半径 `残余分 × 80m/分`(上限 960m)の **16 角形バッファ**を生成
- turf(polyclip-ts)で全バッファを union(30 分 / 60 分の 2 レイヤ)。実行は探索と同じ Worker 内
- 性能計測を組み込み(生成時間をログ / デバッグ表示)
- <1.5s 未達の場合のフォールバック(100m グリッド + marching squares)は設計メモに留め、必要になったら別 Issue 化

## 受入基準

- [ ] 代表ケース(栄 平日 8:00、60 分)で生成 <1.5s
- [ ] 全ての到達ドットが対応するポリゴンに包含される(プロパティテスト)
- [ ] ポリゴンが GeoJSON として妥当(自己交差エラーで MapLibre が落ちない)

## 検証方法

Vitest(小型ケースの包含性)+ ブラウザでの実測。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §6 徒歩乗換とポリゴン生成
