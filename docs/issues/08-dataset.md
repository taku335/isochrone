---
title: "M1: ブラウザ用データセット出力(manifest/stops/timetable、contenthash、サイズゲート)"
labels: area:pipeline, type:feature
milestone: M1 データ基盤
blockedBy: 6, 7
---
## ゴール

パイプラインの最終出力として、ブラウザが読む 3 ファイル(manifest / stops / timetable)を生成し、gzip サイズゲートを組み込む。

## 作業内容

- `manifest.json`: feed_version、有効期間、各ファイルのハッシュ付きパス、gzip サイズ
- `stops-<contenthash>.json`: 停留所 SoA(id / 名称 / かな / 緯度経度 / 同名グループ)+ footpath CSR
- `timetable-<contenthash>.json`: パターン CSR・trip・delta 符号化時刻・カレンダー(曜日ビットマスク + calendar_dates 全件)
- ファイル形式の型を `packages/gtfs-types` で定義(読み手と共有)
- **サイズゲート**: 3 ファイル gzip 合計 ≤1.5MB を超えたら非ゼロ終了。実測値をログ出力
- サイズ超過時のフォールバック(times の `.bin.gz` バイナリ化 + DecompressionStream)は実装せず、設計メモとして docs に記録

## 受入基準

- [ ] 実フィードで 3 ファイルが生成され、gzip 合計 ≤1.5MB(見積 ≤1.1MB)
- [ ] データ内容が同じなら contenthash が安定(再現ビルド)
- [ ] サイズゲート超過テスト(閾値を人工的に下げて fail を確認)

## 検証方法

実フィードでの生成 + サイズ実測。CI にサイズゲートジョブを追加。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §4 データフォーマット設計
