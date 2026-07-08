---
title: "M4: ドキュメント整備(README/運用手順/フェーズ2拡張点)"
labels: area:infra, type:chore
milestone: M4 公開・運用
blockedBy: 23
---
## ゴール

第三者(と将来の自分)が開発・運用・フェーズ 2 着手をできる状態にドキュメントを揃える。

## 作業内容

- README: プロジェクト概要、公開 URL、スクリーンショット、開発手順(pnpm / Docker)、アーキテクチャ図
- 運用手順: データ更新(自動 / 手動)、ダイヤ改正時の golden numbers 更新手順、タイル移行パス(PMTiles)
- フェーズ 2 拡張点の明文化: 逆方向 RAPTOR に必要な変更点(翌日レイヤ −1440、latestDeparture 実装、UI)を docs/PLAN.md の該当節とあわせて整理
- docs/PLAN.md を実装後の現実に合わせて更新(乖離の解消)

## 受入基準

- [ ] クリーンな環境の開発者が README だけでローカル起動できる
- [ ] ダイヤ改正時の対応手順が手順書として通しで実行可能
- [ ] フェーズ 2 の着手に必要な情報が 1 箇所にまとまっている

## 検証方法

手順書どおりの通し実行(クリーンクローン)。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) 全体
