/**
 * 理論値ランキング生成スクリプト
 *
 * にとよん氏の pokesleep-tool (MIT) の計算ロジックを直接呼び、
 * 得意分野別(きのみ / 食材 / スキル)の理論値ランキングを
 * docs/ranking/*.md に日本語 Markdown 表として書き出す。
 *
 * 実行: bun run tools/calc/ranking.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOOL = join(import.meta.dir, "../pokesleep-tool");
const SRC = join(TOOL, "src");

import pokemons, { type PokemonData } from "../pokesleep-tool/src/data/pokemons";
import Nature from "../pokesleep-tool/src/util/Nature";
import PokemonIv from "../pokesleep-tool/src/util/PokemonIv";
import PokemonStrength from "../pokesleep-tool/src/util/PokemonStrength";
import { allFavoriteFieldIndex, createStrengthParameter } from "../pokesleep-tool/src/util/StrengthParameter";
import SubSkill, { type SubSkillType } from "../pokesleep-tool/src/util/SubSkill";
import SubSkillList from "../pokesleep-tool/src/util/SubSkillList";

// ---- 日本語名 ----
const jaPokemon: Record<string, string> = (await Bun.file(join(SRC, "i18n/ja/pokemons.json")).json()).pokemons;
const jaData = await Bun.file(join(SRC, "i18n/ja/data.json")).json();
const jaSkills: Record<string, { name: string }> = (await Bun.file(join(SRC, "i18n/ja/skills.json")).json()).skills;
const jaType = (t: string) => jaData.types[t] ?? t;
const jaIng = (i: string) => jaData.ingredients[i] ?? i;
const jaSub = (s: string) => jaData.subskill[s] ?? s;
const jaNature = (n: string) => jaData.natures[n] ?? n;
const jaSkill = (s: string) => jaSkills[s]?.name ?? s;
const jaName = (p: PokemonData) => jaPokemon[p.name] ?? p.name;

// ---- 前提 ----
const LEVELS = [50, 60, 75] as const;
type Lv = (typeof LEVELS)[number];

interface Build {
	label: string;
	sub: Partial<Record<"lv10" | "lv25" | "lv50" | "lv70" | "lv80", SubSkillType>>;
	nature: string;
}
const BUILDS: Record<"berry" | "ing" | "skill", Build> = {
	berry: {
		label: "きのみ",
		sub: { lv10: "Berry Finding S", lv25: "Helping Speed M", lv50: "Helping Speed S", lv70: "Helping Bonus", lv80: "Inventory Up L" },
		nature: "Adamant",
	},
	ing: {
		label: "食材",
		sub: { lv10: "Ingredient Finder M", lv25: "Helping Speed M", lv50: "Ingredient Finder S", lv70: "Inventory Up L", lv80: "Helping Speed S" },
		nature: "Quiet",
	},
	skill: {
		label: "スキル",
		sub: { lv10: "Skill Trigger M", lv25: "Skill Trigger S", lv50: "Helping Speed M", lv70: "Helping Speed S", lv80: "Skill Level Up M" },
		nature: "Careful",
	},
};

function makeIv(p: PokemonData, b: Build, level: number): PokemonIv {
	const sub: Record<string, SubSkill> = {};
	for (const [k, v] of Object.entries(b.sub)) sub[k] = new SubSkill(v as SubSkillType);
	return new PokemonIv({ pokemonName: p.name, level, subSkills: new SubSkillList(sub), nature: new Nature(b.nature) });
}

function calc(p: PokemonData, b: Build, level: Lv) {
	const iv = makeIv(p, b, level);
	const param = createStrengthParameter({
		level,
		fieldIndex: allFavoriteFieldIndex, // 好物きのみ扱い
		fieldBonus: 0,
		maxSkillLevel: true,
		addHelpingBonusEffect: false, // 自分自身のエナジーのみで比較
		event: "none",
	});
	return new PokemonStrength(iv, param).calculate();
}

const targets = pokemons.filter((p) => p.isFullyEvolved);
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

const commit = execSync("git rev-parse --short HEAD", { cwd: TOOL }).toString().trim();
const today = new Date().toISOString().slice(0, 10);

function header(title: string, b: Build, metric: string): string {
	const subs = Object.entries(b.sub).map(([k, v]) => `${k.replace("lv", "Lv")}: ${jaSub(v as string)}`).join(" / ");
	return `# ${title}

自動生成: ${today} (pokesleep-tool ${commit})。編集せず \`bun run tools/calc/ranking.ts\` で再生成する。

## 前提

- 対象: 最終進化形のみ。得意分野が「${b.label}」のポケモン (オールは各表に含む)
- サブスキル: ${subs} (レベル未到達の枠は無効)
- せいかく: ${jaNature(b.nature)} (${b.nature})
- 好物きのみ扱い (きのみエナジー 2 倍)。好物でないフィールドではきのみエナジーは半分になる
- フィールドボーナス 0%、EX フィールド効果なし、イベントなし、睡眠スコア 100
- げんき: げんきエールで 18 回復 × 3 回/日 (にとよんツールの既定値)
- メインスキルは最大レベル。おてつだいボーナスの他メンバーへの効果は含めない
- 単位: ${metric}。数値は 1 日あたり

`;
}

// ---- きのみ ----
{
	const b = BUILDS.berry;
	const rows = targets
		.filter((p) => p.specialty === "Berries" || p.specialty === "All")
		.map((p) => {
			const r = Object.fromEntries(LEVELS.map((lv) => [lv, calc(p, b, lv)])) as Record<Lv, ReturnType<typeof calc>>;
			return { p, r };
		})
		.sort((a, c) => c.r[60].berryTotalStrength - a.r[60].berryTotalStrength);

	const line = (x: (typeof rows)[number], rank: number) =>
		`| ${rank} | ${jaName(x.p)} | ${jaType(x.p.type)} | ${f1(x.r[60].berryCount)} | ${f0(x.r[50].berryTotalStrength)} | ${f0(x.r[60].berryTotalStrength)} | ${f0(x.r[75].berryTotalStrength)} | ${f0(x.r[60].totalStrength)} |`;
	const th = "| 順位 | ポケモン | タイプ | きのみ数/日 (Lv60) | きのみE Lv50 | きのみE Lv60 | きのみE Lv75 | 合計E Lv60 |\n| --- | --- | --- | --- | --- | --- | --- | --- |";

	let md = header("きのみ理論値ランキング", b, "エナジー (E)");
	md += "## 全タイプ\n\n" + th + "\n" + rows.map((x, i) => line(x, i + 1)).join("\n") + "\n\n";
	// タイプ別は得意分野を問わず全最終進化形を対象にする
	const jaSpec: Record<string, string> = { Berries: "きのみ", Ingredients: "食材", Skills: "スキル", All: "オール" };
	const all = targets
		.map((p) => ({ p, r: { 60: calc(p, b, 60), 75: calc(p, b, 75) } }))
		.sort((a, c) => c.r[60].berryTotalStrength - a.r[60].berryTotalStrength);
	const th2 = "| 順位 | ポケモン | 得意 | きのみ数/日 (Lv60) | きのみE Lv60 | きのみE Lv75 | 合計E Lv60 |\n| --- | --- | --- | --- | --- | --- | --- |";
	const line2 = (x: (typeof all)[number], rank: number) =>
		`| ${rank} | ${jaName(x.p)} | ${jaSpec[x.p.specialty]} | ${f1(x.r[60].berryCount)} | ${f0(x.r[60].berryTotalStrength)} | ${f0(x.r[75].berryTotalStrength)} | ${f0(x.r[60].totalStrength)} |`;
	md += "## タイプ別 (得意分野を問わず、きのみ構成で計算)\n\n得意分野が食材・スキルのポケモンも同じきのみ向けサブスキル・せいかくで計算している。\n\n";
	const types = [...new Set(all.map((x) => x.p.type))].sort((a, c) => jaType(a).localeCompare(jaType(c), "ja"));
	for (const t of types) {
		const sub = all.filter((x) => x.p.type === t);
		md += `### ${jaType(t)}\n\n` + th2 + "\n" + sub.map((x, i) => line2(x, i + 1)).join("\n") + "\n\n";
	}
	writeFileSync(join(import.meta.dir, "../../docs/ranking/berry.md"), md);
}

// ---- 食材 ----
{
	const b = BUILDS.ing;
	const rows = targets
		.filter((p) => p.specialty === "Ingredients" || p.specialty === "All")
		.map((p) => {
			const r = Object.fromEntries(LEVELS.map((lv) => [lv, calc(p, b, lv)])) as Record<Lv, ReturnType<typeof calc>>;
			return { p, r };
		})
		.sort((a, c) => c.r[60].ingStrength - a.r[60].ingStrength);
	const ingCount = (r: ReturnType<typeof calc>) => r.ingredients.reduce((s, i) => s + i.count, 0);
	const ingDetail = (r: ReturnType<typeof calc>) => r.ingredients.map((i) => `${jaIng(i.name)} ${f1(i.count)}`).join("、");
	const th = "| 順位 | ポケモン | タイプ | 食材構成 (ABC) | 食材数/日 Lv50 | Lv60 | Lv75 | 内訳 Lv60 | 食材E Lv60 | 合計E Lv60 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
	const line = (x: (typeof rows)[number], rank: number) =>
		`| ${rank} | ${jaName(x.p)} | ${jaType(x.p.type)} | ${x.p.specialty === "All" ? "選択制 (既定値で計算)" : [x.p.ing1, x.p.ing2, x.p.ing3].filter(Boolean).map((i) => jaIng(i!.name)).join("/")} | ${f1(ingCount(x.r[50]))} | ${f1(ingCount(x.r[60]))} | ${f1(ingCount(x.r[75]))} | ${ingDetail(x.r[60])} | ${f0(x.r[60].ingStrength)} | ${f0(x.r[60].totalStrength)} |`;
	let md = header("食材理論値ランキング", b, "食材数と食材エナジー (E)");
	md += "- 食材構成は ABC (Lv1/Lv30/Lv60 で解放される 3 種を順に)。AAA など別構成では数と内訳が変わる\n- 食材エナジーは料理ボーナス 25%、レシピ平均 Lv30 換算 (にとよんツールの既定値)\n\n";
	md += "## 全体\n\n" + th + "\n" + rows.map((x, i) => line(x, i + 1)).join("\n") + "\n\n";
	// 食材別
	md += "## 食材別 (その食材を Lv60 で最も多く集めるポケモン)\n\n";
	const byIng = new Map<string, { name: string; count: number }[]>();
	for (const x of rows) for (const i of x.r[60].ingredients) {
		if (!byIng.has(i.name)) byIng.set(i.name, []);
		byIng.get(i.name)!.push({ name: jaName(x.p), count: i.count });
	}
	md += "| 食材 | 1位 | 2位 | 3位 | 4位 | 5位 |\n| --- | --- | --- | --- | --- | --- |\n";
	for (const [ing, list] of byIng) {
		list.sort((a, c) => c.count - a.count);
		md += `| ${jaIng(ing)} | ${list.slice(0, 5).map((l) => `${l.name} ${f1(l.count)}`).join(" | ")} |\n`;
	}
	writeFileSync(join(import.meta.dir, "../../docs/ranking/ingredient.md"), md);
}

// ---- スキル ----
{
	const b = BUILDS.skill;
	const rows = targets
		.filter((p) => p.specialty === "Skills" || p.specialty === "All")
		.map((p) => {
			const r = Object.fromEntries(LEVELS.map((lv) => [lv, calc(p, b, lv)])) as Record<Lv, ReturnType<typeof calc>>;
			return { p, r };
		})
		.sort((a, c) => c.r[60].skillCount - a.r[60].skillCount);
	const th = "| 順位 | ポケモン | タイプ | メインスキル | 発動/日 Lv50 | Lv60 | Lv75 | スキル値/日 Lv60 | スキルE Lv60 | 合計E Lv60 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
	const line = (x: (typeof rows)[number], rank: number) =>
		`| ${rank} | ${jaName(x.p)} | ${jaType(x.p.type)} | ${jaSkill(x.p.skill)} | ${f2(x.r[50].skillCount)} | ${f2(x.r[60].skillCount)} | ${f2(x.r[75].skillCount)} | ${f0(x.r[60].skillValue)} | ${f0(x.r[60].skillStrength)} | ${f0(x.r[60].totalStrength)} |`;
	let md = header("スキル理論値ランキング", b, "スキル発動回数とスキル値");
	md += "- スキル値の意味はスキルにより異なる (エナジーチャージ: エナジー、げんき系: 回復量、食材ゲット: 食材数、ゆめのかけら: かけら数)\n- スキル E はにとよんツールのエナジー換算 (げんき系スキルなど換算できないものは 0)\n\n";
	md += "## 発動回数順\n\n" + th + "\n" + rows.map((x, i) => line(x, i + 1)).join("\n") + "\n\n";
	md += "## メインスキル別\n\n";
	const skills = [...new Set(rows.map((x) => x.p.skill))];
	for (const s of skills) {
		const sub = rows.filter((x) => x.p.skill === s).sort((a, c) => c.r[60].skillValue - a.r[60].skillValue);
		md += `### ${jaSkill(s)}\n\n` + th + "\n" + sub.map((x, i) => line(x, i + 1)).join("\n") + "\n\n";
	}
	writeFileSync(join(import.meta.dir, "../../docs/ranking/skill.md"), md);
}
console.log("done", targets.length, "pokemons");
