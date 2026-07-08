---
title: "M3: 地図表示基盤(MapLibre + OpenFreeMap + attribution)"
labels: area:frontend, type:feature
milestone: M3 フロントエンド
blockedBy: 1
---
## ゴール

MapLibre GL JS + OpenFreeMap タイルで名古屋市域の地図を表示する基盤を作る。

## 作業内容

- `apps/web` に MapLibre を組み込み、名古屋市中心の初期ビュー
- スタイル URL は設定値(env / config)化 — タイル提供条件変更時に差し替えられるように。自前 PMTiles への移行パスを README にメモ
- attribution(OpenFreeMap / OpenMapTiles / OpenStreetMap)を正しく表示
- リサイズ・モバイルビューポート対応の最小レイアウト

## 受入基準

- [ ] dev server で名古屋の地図が表示・操作できる
- [ ] attribution が表示されている
- [ ] スタイル URL を設定で差し替えられる

## 検証方法

ブラウザでの目視 + 設定差し替えテスト。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §1 制約と非機能要件
