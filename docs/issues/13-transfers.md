---
title: "M2: 徒歩乗換統合と複数出発点対応"
labels: area:engine, type:feature
milestone: M2 経路探索エンジン
blockedBy: 12
---
## ゴール

RAPTOR コアに footpath(徒歩乗換)の緩和段を統合し、複数出発点(同名ポール群を等価出発点として扱う)に対応する。

## 作業内容

- 各 round の末尾に footpath 緩和段(CSR を走査して `到着分 + 徒歩分` で更新)
- `EarliestArrivalQuery.origins` を複数受け取り、初期化時に全てをマーク(同名ポール集約 UI の基盤)
- 出発地周辺の初期徒歩(origin の footpath 適用)も初期化に含める
- 既知解テストを拡張: 徒歩乗換でしか繋がらない経路、複数 origin で結果が origin ごとの min になるケース

## 受入基準

- [ ] 徒歩乗換を要する既知解テストが通過
- [ ] 複数 origin の結果 = 各 origin 単独結果の要素毎 min(プロパティテスト)
- [ ] footpath 緩和後も到着配列が単調(悪化しない)

## 検証方法

Vitest(ミニフィクスチャ + プロパティテスト)。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §6 徒歩乗換とポリゴン生成
