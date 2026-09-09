/**
 * フィールドのランク別必要エナジー表を生成する。
 * 実行: bun run tools/calc/fields.ts  →  docs/ranking/field-ranks.md
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import fields, { getFavoriteBerries, MAX_STRENGTH } from "../pokesleep-tool/src/data/fields";

const TOOL = join(import.meta.dir, "../pokesleep-tool");
const common = await Bun.file(join(TOOL, "src/i18n/ja/common.json")).json();
const jaData = await Bun.file(join(TOOL, "src/i18n/ja/data.json")).json();
const names: string[] = common.area;
const commit = execSync("git rev-parse --short HEAD", { cwd: TOOL }).toString().trim();
const today = new Date().toISOString().slice(0, 10);

const rankName = (i: number) => (i < 5 ? `ノーマル${i + 1}` : i < 10 ? `スーパー${i - 4}` : i < 15 ? `ハイパー${i - 9}` : `マスター${i - 14}`);
const f0 = (n: number) => n.toLocaleString("ja-JP");

let md = `# フィールド別 ランク必要エナジー

自動生成: ${today} (pokesleep-tool ${commit})。編集せず \`bun run tools/calc/fields.ts\` で再生成する。

- 数値は週の累計エナジー (カビゴンの強さ)。ランク到達に必要な値
- 「ねむけパワー目安」はにとよんツール内の睡眠リサーチ計算で使われる段階値 (powers)

## 好物きのみ (固定フィールド)

| フィールド | 好物タイプ |
| --- | --- |
`;
for (const f of fields) {
	const fav = getFavoriteBerries(f.index);
	md += `| ${f.emoji} ${names[f.index]} | ${fav.length ? fav.map((t) => jaData.types[t]).join(" / ") : "毎週ランダム"} |\n`;
}
md += "\n## ランク別必要エナジー\n\n| ランク | " + fields.map((f) => `${f.emoji} ${names[f.index]}`).join(" | ") + " |\n| --- | " + fields.map(() => "---").join(" | ") + " |\n";
const n = Math.max(...fields.map((f) => f.ranks.filter((r) => r <= MAX_STRENGTH).length));
for (let i = 0; i < n; i++) {
	md += `| ${rankName(i)} | ` + fields.map((f) => (f.ranks[i] !== undefined && f.ranks[i] <= MAX_STRENGTH ? f0(f.ranks[i]) : "")).join(" | ") + " |\n";
}
writeFileSync(join(import.meta.dir, "../../docs/ranking/field-ranks.md"), md);
console.log("done");
