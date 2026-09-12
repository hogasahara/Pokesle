/**
 * 厳選補助: 個体 1 体を「同条件で総当たりした理論値」と比べ、
 * 得意分野に応じた主指標 (きのみE / スキル回数 / 食材個数) と合計エナジーで距離を出す。
 *
 * 実行例:
 *   bun run tools/calc/rate.ts Latios 50 "Ingredient Finder M,Skill Trigger M,Skill Level Up S;Adamant;3"
 *   bun run tools/calc/rate.ts Dragonite 60 "Ingredient Finder M,Helping Speed M,Inventory Up L;Quiet;;AAB" --target oil
 *   bun run tools/calc/rate.ts Raichu 50 "Berry Finding S,Helping Speed M,Skill Trigger S;Adamant" --field -2 --tap 480
 *
 * 個体の書式: サブスキル(英名, Lv10/25/50/70/80 の順);せいかく(英名);スキルLv(表示値, 省略で最大);食材構成(AAA〜ABC, 省略で ABC)
 * オプション: --field N (fieldIndex: -1 好物なし(既定) / -2 好物 / 0..8), --tap 分 (日中のタップ間隔, 既定 180), --target 食材英名 (食材型の主指標にする食材)
 */
import pokemons from "../pokesleep-tool/src/data/pokemons";
import Nature from "../pokesleep-tool/src/util/Nature";
import PokemonIv from "../pokesleep-tool/src/util/PokemonIv";
import PokemonStrength, { isSkillStrengthZero } from "../pokesleep-tool/src/util/PokemonStrength";
import { getMaxSkillLevel } from "../pokesleep-tool/src/util/MainSkill";
import { IngredientTypes, type IngredientType } from "../pokesleep-tool/src/util/PokemonRp";
import { createStrengthParameter } from "../pokesleep-tool/src/util/StrengthParameter";
import SubSkill, { type SubSkillType } from "../pokesleep-tool/src/util/SubSkill";
import SubSkillList from "../pokesleep-tool/src/util/SubSkillList";
import { NoTap } from "../pokesleep-tool/src/util/Energy";
import { join } from "node:path";

// ---- 引数 ----
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [pokemonName, levelStr, spec] = positional;
if (!pokemonName || !levelStr || !spec) { console.error("usage: bun run tools/calc/rate.ts <PokemonName> <level> \"subs;nature;skillLv;ingType\" [--field N] [--tap min] [--target ing]"); process.exit(1); }
const level = Number(levelStr);
const fieldIndex = Number(opt("--field") ?? -1);
const tap = Number(opt("--tap") ?? 180);
const target = opt("--target");

const pokemon = pokemons.find((p) => p.name === pokemonName);
if (!pokemon) { console.error(`unknown pokemon: ${pokemonName}`); process.exit(1); }
const SRC = join(import.meta.dir, "../pokesleep-tool/src");
const jaPokemon: Record<string, string> = (await Bun.file(join(SRC, "i18n/ja/pokemons.json")).json()).pokemons;
const jaData = await Bun.file(join(SRC, "i18n/ja/data.json")).json();
const jaSub = (s: string) => jaData.subskill[s] ?? s;
const jaNat = (n: string) => (n === "Bashful" ? "無補正" : jaData.natures[n] ?? n);
const jaIng = (i: string) => jaData.ingredients[i] ?? i;

const [subsStr, natureStr, skillLvStr, ingStr] = spec.split(";");
const SLOTS = ["lv10", "lv25", "lv50", "lv70", "lv80"] as const;
const mySubs = subsStr.split(",").map((s) => s.trim()).filter(Boolean) as SubSkillType[];
const myNature = natureStr?.trim() || "Bashful";
const skillLevel = skillLvStr ? Number(skillLvStr) : undefined;
const myIng = (ingStr?.trim() || (pokemon.ing3 ? "ABC" : "ABB")) as IngredientType;

const slotsActive = level >= 80 ? 5 : level >= 70 ? 4 : level >= 50 ? 3 : level >= 25 ? 2 : 1;

// ---- 計算 ----
// 全 17 種。出現率は通説値 (金 2.3% / 青 5.7% / 白 12.5% を各サブスキルごとの確率として扱う。7×2.3+6×5.7+4×12.5≈100)。出典は docs/notes/individual-compare.md 参照
const GOLD: SubSkillType[] = ["Berry Finding S", "Dream Shard Bonus", "Energy Recovery Bonus", "Helping Bonus", "Research EXP Bonus", "Skill Level Up M", "Sleep EXP Bonus"];
const BLUE: SubSkillType[] = ["Helping Speed M", "Ingredient Finder M", "Inventory Up L", "Inventory Up M", "Skill Level Up S", "Skill Trigger M"];
const WHITE: SubSkillType[] = ["Helping Speed S", "Ingredient Finder S", "Inventory Up S", "Skill Trigger S"];
const SUBS: SubSkillType[] = [...GOLD, ...BLUE, ...WHITE];
const PROB = (s: SubSkillType) => (GOLD.includes(s) ? 0.023 : BLUE.includes(s) ? 0.057 : 0.125);
// エナジー計算に影響しないサブスキル (スキルレベルアップは skillLevel に反映するので別扱い)
const NOOP = new Set<SubSkillType>(["Dream Shard Bonus", "Research EXP Bonus", "Sleep EXP Bonus"]);
const LVUP: Partial<Record<SubSkillType, number>> = { "Skill Level Up M": 2, "Skill Level Up S": 1 };
/** 順序付き・重複なし抽選で、この組み合わせ (順不同) が出る確率 */
function comboProb(subs: SubSkillType[]): number {
	const ps = subs.map(PROB);
	const perm = (rest: number[], used: number): number => rest.length === 0 ? 1 : rest.reduce((acc, p, i) => acc + (p / (1 - used)) * perm(rest.filter((_, j) => j !== i), used + p), 0);
	return perm(ps, 0);
}
const NATURE_W = (n: string) => (n === "Bashful" ? 5 / 25 : 1 / 25);
const NATURES = ["Bashful", "Bold", "Impish", "Lax", "Relaxed", "Timid", "Hasty", "Jolly", "Naive", "Lonely", "Adamant", "Naughty", "Brave", "Calm", "Gentle", "Careful", "Sassy", "Modest", "Mild", "Rash", "Quiet"];
const param = createStrengthParameter({ level: level as 50, fieldIndex, fieldBonus: 0, event: "none", addHelpingBonusEffect: false, maxSkillLevel: skillLevel === undefined, tapFrequencyAwake: tap, tapFrequencyAsleep: NoTap });
const maxSkillLv = getMaxSkillLevel(pokemon.skill);
const baseSkillLevel = skillLevel === undefined ? undefined : Math.max(1, skillLevel - mySubs.slice(0, slotsActive).reduce((a, s) => a + (LVUP[s] ?? 0), 0));
const effSkillLevel = (subs: SubSkillType[]) => baseSkillLevel === undefined ? undefined : Math.min(maxSkillLv, baseSkillLevel + subs.reduce((a, s) => a + (LVUP[s] ?? 0), 0));

interface Metrics { total: number; berry: number; skillCount: number; skillE: number; ingTotal: number; ing: Record<string, number>; label: string; weight: number }
const memo = new Map<string, Metrics>();
function evaluate(subs: SubSkillType[], nature: string, ing: IngredientType, mineSkillLevel?: number): Metrics {
	const eff = subs.filter((s) => !NOOP.has(s) && !(s in LVUP)).sort();
	const lv = mineSkillLevel ?? effSkillLevel(subs);
	const key = `${eff.join("|")}#${lv}#${nature}#${ing}`;
	const hit = memo.get(key);
	const label = `${subs.map(jaSub).join(" / ")} + ${jaNat(nature)}${pokemon.specialty === "Ingredients" || pokemon.specialty === "All" ? ` (${ing})` : ""}${lv !== undefined && lv !== baseSkillLevel ? ` [スキルLv${lv}]` : ""}`;
	const weight = comboProb(subs) * NATURE_W(nature);
	if (hit) return { ...hit, label, weight };
	const list: Partial<Record<(typeof SLOTS)[number], SubSkill>> = {};
	eff.forEach((s, i) => { list[SLOTS[i]] = new SubSkill(s); });
	const iv = new PokemonIv({ pokemonName, level, subSkills: new SubSkillList(list), nature: new Nature(nature), ingredient: ing, ...(lv !== undefined && { skillLevel: lv }) });
	const r = new PokemonStrength(iv, param).calculate();
	const ingMap: Record<string, number> = {};
	for (const i of r.ingredients) ingMap[i.name] = (ingMap[i.name] ?? 0) + i.count;
	const m: Metrics = { total: r.totalStrength, berry: r.berryTotalStrength, skillCount: r.skillCount, skillE: r.skillStrength, ingTotal: r.ingredients.reduce((s, i) => s + i.count, 0), ing: ingMap, label, weight };
	memo.set(key, m);
	return m;
}

function* combos(k: number): Generator<SubSkillType[]> {
	const idx = Array.from({ length: k }, (_, i) => i);
	while (true) {
		yield idx.map((i) => SUBS[i]);
		let i = k - 1;
		while (i >= 0 && idx[i] === SUBS.length - k + i) i--;
		if (i < 0) return;
		idx[i]++;
		for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
	}
}

const mine = evaluate(mySubs.slice(0, slotsActive), myNature, myIng, skillLevel);
const ingTypes: IngredientType[] = pokemon.specialty === "Ingredients" || pokemon.specialty === "All" ? [...IngredientTypes].filter((t) => pokemon.ing3 || !t.includes("C")) : [myIng];
const t0 = Date.now();
const all: Metrics[] = [];
const sameIng: Metrics[] = [];
for (const ing of ingTypes) for (const subs of combos(slotsActive)) for (const nature of NATURES) {
	const m = evaluate(subs, nature, ing);
	all.push(m);
	if (ing === myIng) sameIng.push(m);
}

// ---- 指標ごとの理論値と順位 ----
type Key = { name: string; get: (m: Metrics) => number; fmt: (n: number) => string; pool: Metrics[] };
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const keys: Key[] = [
	{ name: "合計エナジー/日", get: (m) => m.total, fmt: f0, pool: all },
	{ name: "きのみエナジー/日", get: (m) => m.berry, fmt: f0, pool: sameIng },
	{ name: "スキル発動/日", get: (m) => m.skillCount, fmt: f2, pool: sameIng },
	{ name: "スキルエナジー/日", get: (m) => m.skillE, fmt: f0, pool: sameIng },
	{ name: "食材合計/日 (同じ食材構成)", get: (m) => m.ingTotal, fmt: f1, pool: sameIng },
];
if (ingTypes.length > 1) keys.push({ name: "食材合計/日 (構成も探索)", get: (m) => m.ingTotal, fmt: f1, pool: all });
for (const ingName of Object.keys(mine.ing)) {
	keys.push({ name: `${jaIng(ingName)}/日 (同じ食材構成)`, get: (m) => m.ing[ingName] ?? 0, fmt: f1, pool: sameIng });
	if (ingTypes.length > 1) keys.push({ name: `${jaIng(ingName)}/日 (構成も探索)`, get: (m) => m.ing[ingName] ?? 0, fmt: f1, pool: all });
}
if (target && !(target in mine.ing)) keys.push({ name: `${jaIng(target)}/日 (構成も探索)`, get: (m) => m.ing[target] ?? 0, fmt: f1, pool: all });

const primary = pokemon.specialty === "Berries" ? "きのみエナジー/日" : pokemon.specialty === "Skills" ? "スキル発動/日" : pokemon.specialty === "Ingredients" ? (target ? `${jaIng(target)}/日 (${target in mine.ing ? "同じ食材構成" : "構成も探索"})` : "食材合計/日 (同じ食材構成)") : "合計エナジー/日";

console.log(`# ${jaPokemon[pokemonName] ?? pokemonName} Lv${level} の厳選評価\n`);
console.log(`- 個体: ${mine.label.replace(/ \[スキルLv\d+\]$/, "")}、スキルLv${skillLevel ?? "最大"}${baseSkillLevel !== undefined && baseSkillLevel !== skillLevel ? ` (サブスキル分を除くと Lv${baseSkillLevel}。母集団はこれを基準に各構成のレベルアップを加算)` : ""}`);
console.log(`- 条件: ${fieldIndex === -1 ? "好物なし" : fieldIndex === -2 ? "好物あり" : `fieldIndex ${fieldIndex}`}、日中 ${tap} 分ごとにタップ、フィールドボーナス 0、イベントなし`);
console.log(`- 比較母集団: サブスキル ${SUBS.length} 種から ${slotsActive} 枠 (順不同) × せいかく ${NATURES.length}${ingTypes.length > 1 ? ` × 食材構成 ${ingTypes.length}` : ""} = ${all.length.toLocaleString()} 通り (${((Date.now() - t0) / 1000).toFixed(0)} 秒)`);
console.log(`- 得意分野: ${pokemon.specialty}。主指標は「${primary}」\n`);
console.log("| 指標 | この個体 | 理論最大 | 達成率 | これより上を引く確率 | 理論最大の構成 |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const k of keys) {
	const v = k.get(mine);
	const sorted = [...k.pool].sort((a, b) => k.get(b) - k.get(a));
	const best = sorted[0];
	if (k.name === "スキルエナジー/日" && isSkillStrengthZero(pokemon.skill)) { console.log(`| ${k.name} | - | - | - | - | (エナジー換算 0 のスキル) |`); continue; }
	const wAll = k.pool.reduce((a, m) => a + m.weight, 0);
	const wBetter = k.pool.filter((m) => k.get(m) > v).reduce((a, m) => a + m.weight, 0);
	const mark = k.name === primary ? "**" : "";
	console.log(`| ${mark}${k.name}${mark} | ${k.fmt(v)} | ${k.fmt(k.get(best))} | ${k.get(best) > 0 ? ((v / k.get(best)) * 100).toFixed(1) : "-"}% | ${((wBetter / wAll) * 100).toFixed(1)}% | ${best.label} |`);
}
if (isSkillStrengthZero(pokemon.skill)) console.log("\n注: このメインスキルはエナジー換算 0 (げんき系など)。合計エナジーにスキル分は含まれないので、主指標のスキル発動/日で判断する。");
console.log("\n注: 「これより上を引く確率」は、その指標でこの個体を上回る個体を 1 回の捕獲で引く確率。サブスキル出現率 (金 2.3% / 青 5.7% / 白 12.5%、各サブスキルごと。出典未確認の通説値) と性格の一様分布で重み付け。食材構成は一様扱い。0% は理論最大と同値。");
