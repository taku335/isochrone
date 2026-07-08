---
title: "M2: データローダ(JSON→typed arrays、ミニ GTFS フィクスチャ)"
labels: area:engine, type:feature
milestone: M2 経路探索エンジン
blockedBy: 8
---
## ゴール

`packages/raptor` に、ブラウザ用データ(JSON)を探索用 typed arrays(`LoadedTimetable`)へ展開するローダを作る。DOM 非依存で Node からもテストできること。

## 作業内容

- manifest → stops / timetable の取得と delta 復号 → `Uint16Array` / `Int32Array` の CSR 構造へ展開
- `packages/gtfs-types` の形式型を入力とし、フォーマット齟齬をコンパイル時に検出
- **ミニ GTFS フィクスチャ**: 手作りの 5〜10 停留所・2〜3 パターンの小型データセット(pipeline を通して生成)。以降の M2 Issue の既知解テスト共通基盤にする
- ロード時間の計測ログ(参考値)

## 受入基準

- [ ] ミニフィクスチャのロード結果が手書きの期待値と一致
- [ ] 実データのロードがエラーなく完了し、件数が manifest と一致
- [ ] Node(Vitest)とブラウザの両方で動く(fetch 抽象化)

## 検証方法

Vitest。実データはスモークテストで確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
