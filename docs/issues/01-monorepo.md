---
title: "M0: モノレポ雛形(pnpm workspaces + TypeScript + Vitest + ESLint)"
labels: area:infra, type:chore
milestone: M0 開発基盤
blockedBy:
---
## ゴール

pnpm workspaces モノレポの骨格を作り、全パッケージで lint / typecheck / test が 1 コマンドで走る状態にする。

## 作業内容

- ルート: `pnpm-workspace.yaml`、`package.json`(scripts: `lint` / `typecheck` / `test`)、`tsconfig.base.json`(strict)、ESLint flat config、`.gitignore`
- 空パッケージ 4 つ: `packages/gtfs-types` `packages/pipeline` `packages/raptor` `apps/web`(それぞれ最小の `src/index.ts` とダミーテスト 1 本)
- Node 22 / pnpm のバージョンを `engines` と `.nvmrc` で固定

## 受入基準

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` が全てグリーン
- [ ] `packages/gtfs-types` を `pipeline` と `raptor` の両方から import できる(workspace 参照が機能)

## 検証方法

クリーンクローンから上記コマンドを実行して確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §3 リポジトリ構成
