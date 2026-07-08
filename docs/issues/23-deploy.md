---
title: "M4: GitHub Pages デプロイワークフロー(base パス対応)"
labels: area:infra, type:feature
milestone: M4 公開・運用
blockedBy: 3, 8, 16
---
## ゴール

main への push で「データ生成 → web ビルド → GitHub Pages デプロイ」まで自動化し、公開 URL でアプリが動く状態にする。

## 作業内容

- `.github/workflows/deploy.yml`: pipeline 実行(キャッシュ済み zip 利用可)→ validate → `apps/web` ビルド(生成データを public に配置)→ `actions/deploy-pages`
- Vite の `base` をリポジトリパス(`/isochrone/`)に対応(カスタムドメイン移行も設定 1 箇所)
- データ生成を毎デプロイで行うか、コミット済みデータを使うかを検討し、ビルド時間と再現性のバランスで決定(方針を README に記録)
- Pages の設定(Actions ソース)を有効化

## 受入基準

- [ ] main への push で公開 URL が更新される
- [ ] 公開 URL で検索 → 到達圏描画まで一通り動く(E2E 手動)
- [ ] アセットパスが base 配下で 404 にならない

## 検証方法

公開 URL での E2E 手動確認。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §1 制約と非機能要件
