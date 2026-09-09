/**
 * メインスキル一覧生成スクリプト
 * pokesleep-tool の MainSkill.ts と日本語訳から docs/main-skills.md を生成する。
 * 実行: bun run tools/calc/skills.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import pokemons from "../pokesleep-tool/src/data/pokemons";
import { getMaxSkillLevel, getSkillSubValue, getSkillValue, type MainSkillName } from "../pokesleep-tool/src/util/MainSkill";

const TOOL = join(import.meta.dir, "../pokesleep-tool");
const jaSkills: Record<string, { name: string; desc?: string; detail?: string }> = (await Bun.file(join(TOOL, "src/i18n/ja/skills.json")).json()).skills;
const jaPokemon: Record<string, string> = (await Bun.file(join(TOOL, "src/i18n/ja/pokemons.json")).json()).pokemons;
const commit = execSync("git rev-parse --short HEAD", { cwd: TOOL }).toString().trim();
const today = new Date().toISOString().slice(0, 10);

const strip = (s: string | undefined) => (s ?? "").replace(/\$t\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

// 実装済みポケモンが持つスキルのみ
const skills = [...new Set(pokemons.map((p) => p.skill))] as MainSkillName[];
const holders = (s: string) => pokemons.filter((p) => p.skill === s && p.isFullyEvolved).map((p) => jaPokemon[p.name] ?? p.name);

let md = `# メインスキル一覧

自動生成: ${today} (pokesleep-tool ${commit})。編集せず \`bun run tools/calc/skills.ts\` で再生成する。

- 効果値はにとよんツールの実装値。ランダム系 (ランダム/ゆめのかけらゲットS(ランダム) 等) は期待値
- 「値」の意味はスキルごとに異なる: エナジーチャージ = エナジー、げんき系 = げんき回復量、食材ゲット = 食材数、ゆめのかけら = かけら数、おてつだいサポート = おてつだい回数、料理パワーアップ = 鍋容量、料理チャンス = 大成功確率(%)、きのみバースト = 自分のきのみ数、ばけのかわ等の追加値は「追加」列
- 最大レベル: 6 が基本。食材ゲット/エナジーチャージ/おてつだいサポート/料理パワーアップ/食材セレクト/料理サポートなどは 7、ゆめのかけらゲットは 8

| スキル | 最大Lv | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 | Lv6 | Lv7 | Lv8 | 追加効果 (Lv1..最大) | 所持ポケモン (最終進化) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
`;
for (const s of skills) {
	const max = getMaxSkillLevel(s);
	const vals: string[] = [];
	for (let lv = 1; lv <= 8; lv++) {
		if (lv > max) { vals.push(""); continue; }
		try { vals.push(String(getSkillValue(s, lv))); } catch { vals.push("-"); }
	}
	let sub = "";
	try {
		const arr: number[] = [];
		for (let lv = 1; lv <= max; lv++) arr.push(getSkillSubValue(s, lv, s === "Ingredient Magnet S (Plus)" ? "coffee" : undefined));
		sub = arr.join("/");
		if (s === "Ingredient Magnet S (Plus)") sub += " (コーヒー) / ミルク: " + Array.from({ length: max }, (_, i) => getSkillSubValue(s, i + 1, "milk")).join("/");
	} catch { sub = ""; }
	md += `| ${jaSkills[s]?.name ?? s} | ${max} | ${vals.join(" | ")} | ${sub} | ${holders(s).join("、")} |\n`;
}
md += "\n## スキルの説明\n\n";
for (const s of skills) {
	const j = jaSkills[s];
	if (!j) continue;
	md += `- **${j.name}**: ${strip(j.desc)} ${strip(j.detail)}\n`;
}
writeFileSync(join(import.meta.dir, "../../docs/main-skills.md"), md);
console.log("done", skills.length, "skills");
