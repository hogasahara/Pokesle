# Pokesle
ポケスリ攻略

ポケモンスリープの攻略情報を自分用にまとめ、Claude に質問して答えてもらうための知識ベース。

## 構成

- [攻略サイト一覧.md](攻略サイト一覧.md) — 参考にする攻略サイト・ツール
- [docs/fields.md](docs/fields.md) — リサーチフィールド一覧、解放条件、好物きのみ
- [docs/expert-fields.md](docs/expert-fields.md) — EX フィールドのバフ・デバフ仕様
- [docs/recipes.md](docs/recipes.md) — 料理レシピとエナジー (Game8 から自動生成)
- [docs/main-skills.md](docs/main-skills.md) — メインスキル一覧 (自動生成)
- [docs/ranking/](docs/ranking/) — きのみ / 食材 / スキルの理論値ランキング、フィールド別必要エナジー (自動生成)
- [docs/notes/](docs/notes/) — 質問に答える中で調べた仕様の追記メモ
- `tools/pokesleep-tool/` — [nitoyon/pokesleep-tool](https://github.com/nitoyon/pokesleep-tool) (MIT) の submodule。計算ロジックとデータの出典
- `tools/calc/` — 上記を使ってランキング等を生成するスクリプト (bun / python3)

## 使い方

```
git clone --recurse-submodules <this repo>
bun run tools/calc/ranking.ts
```

再生成コマンドの一覧は [CLAUDE.md](CLAUDE.md)。
