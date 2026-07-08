---
title: "M0: Docker 開発環境(compose: pipeline / web-dev)"
labels: area:infra, type:chore
milestone: M0 開発基盤
blockedBy: 1
---
## ゴール

ローカル環境差異を吸収する Docker Compose 開発環境を用意する。CI は素の Node で同じコマンドを実行するため、Docker は開発補助に徹する。

## 作業内容

- `docker-compose.yml` に 2 サービス:
  - `pipeline`: データ生成 CLI を実行(`docker compose run pipeline <args>`)
  - `web-dev`: Vite dev server(ポート公開、ソースを bind mount、HMR 動作)
- Node 22 ベースの共通 Dockerfile(pnpm 有効化)
- pnpm store をボリューム化してリビルドを高速化

## 受入基準

- [ ] `docker compose run --rm pipeline --help` がヘルプを表示
- [ ] `docker compose up web-dev` でブラウザからアプリ(雛形)にアクセスでき、ソース編集が HMR 反映される

## 検証方法

Docker Desktop / Linux docker の両想定でコマンドを実行して確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §3 リポジトリ構成
