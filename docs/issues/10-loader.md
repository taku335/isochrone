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

## 実装メモ

- `loadTimetableFromManifestUrl()` は manifest URL と fetch 抽象を受け取り、stops/timetable JSON を取得して `LoadedTimetable` に展開する。
- `loadTimetable()` は `BrowserDatasetManifest` / `BrowserStopsDataset` / `BrowserTimetableDataset` を直接受け取り、CSR 参照を `Int32Array`、時刻を delta 復号済み `Uint16Array` に変換する。
- ミニ fixture は `@isochrone/pipeline` の `buildBrowserDatasetFiles()` で生成し、以降の M2 既知解テストの土台にする。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §5 RAPTOR エンジン設計
