---
title: "M1: ストップパターン抽出と時刻表コンパクト化(delta 符号化)"
labels: area:pipeline, type:feature
milestone: M1 データ基盤
blockedBy: 5
---
## ゴール

trip を停車停留所列でグループ化してユニークパターンを抽出し、RAPTOR が読む CSR レイアウト + delta 符号化の時刻表を生成する。

## 作業内容

- パターン抽出: trip → 停車列のハッシュでグループ化。実フィードで **681 パターン**になることを golden number とする
- CSR レイアウト: 全パターンの stopIds を 1 本の配列 + オフセット配列に
- 各パターン内で trip を出発時刻順にソート(RAPTOR の二分探索前提)
- 時刻を uint16 分 + trip 内 delta 符号化(先頭絶対値 + 差分)
- 停留所 → 所属パターンの逆引き CSR インデックス生成
- デコーダ(delta 復号)も同時に実装し、エンコード → デコードで元の値に一致するラウンドトリップテスト

## 受入基準

- [ ] 実フィードでパターン数 681(golden number)
- [ ] ラウンドトリップテスト: 全 592,164 時刻が復元一致
- [ ] trip 内時刻の単調非減少をエンコード前に検査し、違反があれば警告

## 検証方法

Vitest + 実フィードでの golden numbers / ラウンドトリップ全件検査。

参照: [docs/PLAN.md](https://github.com/taku335/isochrone/blob/main/docs/PLAN.md) §4 データフォーマット設計
