---
title: "M1: GTFS-JP パーサと正規化(24h+時刻→分、事業者プレフィックス付与)"
labels: area:pipeline, type:feature
milestone: M1 データ基盤
blockedBy: 4
---
## ゴール

GTFS-JP zip をパースし、後続工程が扱う正規化済み中間表現(TS の型付きオブジェクト)に変換する。

## 作業内容

- 必要ファイル(stops / routes / trips / stop_times / calendar / calendar_dates)の CSV パース(ストリーミング、592k 行対応)
- 時刻文字列 → サービス日 0 時からの**分**(整数)。`26:15:00` → `1575`。24h 超えを変換しない方針(engine 側レイヤ方式)を型コメントに明記
- 全 ID に事業者プレフィックス付与(`nagoya-cbus:`)
- 中間表現の型は `packages/gtfs-types` に置き、pipeline / raptor で共有

## 受入基準

- [ ] 実フィードのパースで停留所 3,886 / 路線 185 / 便 30,417 / stop_times 592,164 が得られる(golden numbers)
- [ ] 最大時刻が 1575 分(26:15)としてパースされる
- [ ] 小型フィクスチャによる単体テスト(異常系: 欠損列・空ファイル)

## 検証方法

Vitest(フィクスチャ)+ 実フィードに対する golden numbers 検査スクリプト。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §2 データ調査結果
