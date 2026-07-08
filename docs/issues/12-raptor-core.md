---
title: "M2: RAPTOR コア(one-to-all 最早到着、既知解テスト)"
labels: area:engine, type:feature
milestone: M2 経路探索エンジン
blockedBy: 10, 11
---
## ゴール

パターンベース RAPTOR による one-to-all 最早到着探索を実装する。フェーズ 2(最遅出発)拡張を見込んだ Query 型を定義する。

## 作業内容

- round ごとの緩和: マーク済み停留所 → 通過パターン列挙 → 各パターンで「乗れる最早 trip」を二分探索しながら下流停留所を更新
- サービス日レイヤ(#11)ごとに `時刻 + minuteOffset` で同一タイムライン上を探索
- 状態は typed arrays(`Uint16Array`、未到達 = 0xffff)。maxRounds 既定 5
- `Query` 型を `earliestArrival | latestDeparture` のユニオンで定義。**latestDeparture は型のみ**(実装はフェーズ 2 Issue)。到着系・出発系で対称になるようコアループの向き依存箇所をコメントで明示
- ミニフィクスチャに対する既知解テスト(乗換 0 / 1 / 2 回、深夜便跨ぎ)

## 受入基準

- [ ] 既知解テスト全通過(手計算の到着分と一致)
- [ ] 前日深夜便(24h 超え時刻)を含むケースが正しい
- [ ] maxRounds で打ち切った場合も結果が単調(round 追加で悪化しない)

## 検証方法

Vitest(ミニフィクスチャ既知解)。実データ性能は #14 で測る。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
