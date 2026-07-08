---
title: "[Phase 2] 帰宅リミット検索(最遅出発・逆方向 RAPTOR)"
labels: type:future
milestone:
blockedBy:
---
## 概要(プレースホルダ — 実装計画はフェーズ 2 開始時に作成)

「この停留所に○時までに着くには、いつまでに出発すればよいか」= 最遅出発(latest departure)の逆方向探索。終電・終バス逆算のコア機能。

## 設計上の布石(フェーズ 1 で織り込み済み)

- `Query` 型は `earliestArrival | latestDeparture` のユニオンで定義済み(`LatestDepartureQuery` は型のみ)
- サービス日レイヤ機構は対称設計: 逆方向では**翌日レイヤ(minuteOffset = −1440)**を追加するだけ
- 祝日ダイヤ誤判定対策(calendar_dates 全件テスト、適用ダイヤ表示)は実装済みの前提

## フェーズ 2 開始時にやること

- 逆方向 RAPTOR コア(「乗れる最遅 trip」の二分探索、round の向き反転)
- 既知解テスト(終バス跨ぎ・祝日前日深夜)
- UI: 目的地 + 到着リミット入力、最遅出発時刻の表示

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
