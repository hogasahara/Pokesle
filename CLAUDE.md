# Pokesle

ポケモンスリープの攻略情報を、Claude が質問に答えるための知識ベースとして蓄積するリポジトリ。会話は日本語。

## 質問が来たらまずここを読む

| 質問の種類 | 読むファイル | 裏取り先 |
| --- | --- | --- |
| 最強・理論値・比較 (きのみ / 食材 / スキル) | `docs/ranking/berry.md`, `ingredient.md`, `skill.md` | にとよん個体値計算機 (submodule のロジックで再計算) |
| スキル得意の厳選 (最適サブスキル・せいかく、次善) | `docs/ranking/skill-build-lv50.md` (Lv50 総当たり) | `tools/calc/skillbuild.ts` を条件を変えて再実行 |
| 手持ちの個体 A と B のどちらが強いか | `bun run tools/calc/compare.ts <英名> <Lv> "A=サブ,サブ,サブ;せいかく;スキルLv" "B=..."` を実行 (タップ頻度・好物有無の別で出る) | 判断の一般則は `docs/notes/individual-compare.md` |
| フィールド、解放条件、好物きのみ、ランク必要エナジー | `docs/fields.md`, `docs/ranking/field-ranks.md` | Game8 マップ一覧 |
| EX フィールド (ワカクサ EX / シアン EX) のバフ・デバフ | `docs/expert-fields.md` | Game8、ポケらく |
| 料理レシピ、必要食材、エナジー | `docs/recipes.md` | Game8 料理レシピ一覧 |
| メインスキルの効果値・レベル・所持ポケモン | `docs/main-skills.md` | pokesleep-tool `MainSkill.ts` |
| 上記にない仕様・イベント | `docs/notes/` を grep。無ければ Web で調べて `docs/notes/` に追記 | `攻略サイト一覧.md` の順に |

- 各 docs には「自動生成日」または「最終確認日」と出典がある。1 か月以上前なら古い可能性を伝え、必要なら再生成・再確認する
- Wiki* (wikiwiki.jp/poke_sleep) は自動取得が 403 で失敗する。裏取りは Game8 / ポケらく / 課金中毒者の日記 / note を使う
- 新しく調べた仕様は、回答と同時に `docs/notes/<テーマ>.md` に出典・確認日付きで追記する (追記型で蓄積)

## 計算基盤

- `tools/pokesleep-tool/` は nitoyon/pokesleep-tool (MIT) の git submodule。SessionStart フックで自動取得される。無ければ `git submodule update --init --depth 1 tools/pokesleep-tool`
- `npm ci` は不要。`bun` で TypeScript を直接実行する (i18next は型 import のみ)
- スキルレベルは「ゲーム内表示値」を渡す。スキルレベルアップ M/S 持ちは表示値がその分高い前提で入力する (ツールは自動加算しない)
- 個別の条件で計算したいときは `tools/calc/ranking.ts` の `calc()` を参考に、`PokemonIv` + `createStrengthParameter` + `PokemonStrength.calculate()` を呼ぶ。フィールド指定は `fieldIndex` (0 ワカクサ … 6 アンバー, 7 ワカクサ EX, 8 シアン EX, -2 全部好物, -1 好物なし)

## 再生成コマンド

```
git -C tools/pokesleep-tool pull origin main   # 本家の更新を取り込む
bun run tools/calc/ranking.ts                  # docs/ranking/{berry,ingredient,skill}.md
bun run tools/calc/skills.ts                   # docs/main-skills.md
bun run tools/calc/fields.ts                   # docs/ranking/field-ranks.md
bun run tools/calc/skillbuild.ts               # docs/ranking/skill-build-lv50.md (10 分前後。--from-cache で表だけ再生成)
python3 tools/calc/recipes.py                  # docs/recipes.md (Game8 から取得)
```

生成物は直接編集しない。前提 (サブスキル構成、せいかく、レベル) を変えたいときはスクリプトを直す。
