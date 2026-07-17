---
title: "[Future] GTFS-RT 対応(リアルタイム遅延の反映)"
labels: type:future
milestone:
blockedBy:
---
## 概要(プレースホルダ — 実装計画なし)

GTFS-RT(リアルタイム位置・遅延)を反映した到達圏 / 案内。

## メモ

- 完全静的ホスティング(GitHub Pages)と CORS/ポーリングの相性を要調査 — 中継が必要ならアーキテクチャ前提が変わる
- 名古屋市交通局の GTFS-RT 提供状況の調査から始める

## 実装準備

- protobuf/CORS/配信方式と切り離した正規化 TripUpdates 契約を定義する
- GTFS-RT の秒単位遅延を分単位へ安全側に丸め、以降の停留所へ伝播する
- static GTFS のソース・feed version・trip ID・stop ID と一致する更新だけを適用する
- 更新後の追い越しを考慮し、RAPTOR の乗車候補選択が時刻順配列を前提にしないようにする
- 120 秒超の古いスナップショット、未来時刻、互換性不一致、壊れた更新は static 時刻表へフォールバックする

実エンドポイントの取得、protobuf デコード、ポーリング、UI の鮮度表示は、公式 URL・利用条件・CORS または中継方針が確定するまで保留する。
