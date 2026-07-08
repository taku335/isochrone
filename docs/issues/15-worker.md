---
title: "M2: Web Worker ラッパ(非同期 API)"
labels: area:engine, type:feature
milestone: M2 経路探索エンジン
blockedBy: 13
---
## ゴール

raptor エンジンを Web Worker 内で動かす非同期 API を提供し、UI スレッドをブロックしない探索を可能にする。

## 作業内容

- Worker 側: データロード(1 回)+ クエリ受付。`postMessage` プロトコル(load / query / 進捗 / エラー)
- メイン側: Promise ベースのクライアント(`await client.route(query)`)。結果の `Uint16Array` は transferable で受け渡し
- 多重クエリは最後の 1 件を優先(古いクエリのキャンセル / 結果破棄)
- Vite の Worker ビルド(`new Worker(new URL(...))`)で動作確認

## 受入基準

- [ ] ミニフィクスチャでメインスレッドから探索でき、結果が同期版と一致
- [ ] 探索中に UI スレッドがブロックされない(long task が発生しない)ことを確認
- [ ] 連打時に最後のクエリの結果だけが resolve される

## 検証方法

Vitest(プロトコル部分)+ ブラウザでの手動確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
