---
title: "M3: 出典表示(CC BY 4.0)・「市バスのみ」注記・feed_version 表示・About"
labels: area:frontend, type:chore
milestone: M3 フロントエンド
blockedBy: 18
---
## ゴール

データライセンス(CC BY 4.0)の出典表示義務を満たし、結果の解釈に必要な注記を常時ユーザーに提示する。

## 作業内容

- フッター / About パネル: 「出典: 名古屋市交通局 市バス GTFS-JP(CC BY 4.0)」+ リンク
- **「市バスのみ(地下鉄・他社線は含まない)」の注記**を結果表示の近くに常設
- manifest の feed_version と有効期間を表示(例: ダイヤ 202603_02)
- About にアルゴリズム概要・徒歩パラメータ(300m / 80m/分)・免責(実際の運行と異なる場合がある)を記載

## 受入基準

- [ ] 出典・ライセンス・リンクが表示される
- [ ] 市バスのみ注記が探索結果と同時に視認できる
- [ ] feed_version がデータ更新で自動的に変わる(manifest 由来)

## 検証方法

目視 + manifest 差し替えで表示が追従することを確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §1 制約と非機能要件
