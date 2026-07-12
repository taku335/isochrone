---
title: "M2: サービス日解決(calendar/calendar_dates/前日深夜便レイヤ)"
labels: area:engine, type:feature
milestone: M2 経路探索エンジン
blockedBy: 10
---
## ゴール

指定日に有効な service_id 集合を解決するモジュールを作る。当日レイヤ(minuteOffset 0)と前日レイヤ(+1440)の 2 レイヤを返し、フェーズ 2 の翌日レイヤ(−1440)追加に備えた対称な構造にする。

## 作業内容

- calendar(曜日ビットマスク + 有効期間)と calendar_dates(追加 / 除外)の解決ロジック
- `resolveServiceLayers(date)` → `[{minuteOffset: 0, services}, {minuteOffset: 1440, services(前日分)}]`
- **calendar_dates 96 行の全件テーブル駆動テスト**: 実フィードの例外日(祝日・年末年始)それぞれで有効 service 集合が期待通りかを検査(フェーズ 2「終バス」の生命線)
- 適用ダイヤ種別(平日 / 土曜 / 日休 等)を UI 表示用に返す

## 受入基準

- [ ] テーブル駆動テスト 96 行 + 通常曜日ケースが全て通過
- [ ] フィード有効期間外の日付は明示的なエラー
- [ ] 前日レイヤに前日の service 集合が入る(日付境界のテスト: 月曜 0:30 に日曜深夜便が乗る)

## 検証方法

Vitest(テーブル駆動)。

## 実装メモ

- `resolveServiceLayers(calendar, date)` は当日レイヤ(`minuteOffset: 0`)と前日レイヤ(`minuteOffset: 1440`)を返す。
- `calendar_dates` は同一日付の base service 集合に対して type 1 を追加、type 2 を除外する。
- UI 表示用に `dayType` と `displayName` を返す。名古屋市バス feed の `平日` / `土曜` / `日休` 系 service_id を分類する。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
