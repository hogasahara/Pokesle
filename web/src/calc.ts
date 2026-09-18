/**
 * 厳選評価の計算コア (ブラウザ / bun 共通)。
 * tools/calc/rate.ts と同じ考え方で、個体 1 体を同条件の総当たり母集団と比べる。
 * - スキルレベルはユーザー指定値で固定 (スキルレベルアップ M/S は無視する)
 * - 理想個体は個体と同じ食材構成の中で求め、「上を引く確率」は食材構成 (一様) も母集団に含める
 */
import pokemons, { type PokemonData } from "../../tools/pokesleep-tool/src/data/pokemons";
import Nature from "../../tools/pokesleep-tool/src/util/Nature";
import PokemonIv from "../../tools/pokesleep-tool/src/util/PokemonIv";
import PokemonStrength, { isSkillStrengthZero } from "../../tools/pokesleep-tool/src/util/PokemonStrength";
import { getMaxSkillLevel } from "../../tools/pokesleep-tool/src/util/MainSkill";
import { IngredientTypes, type IngredientType } from "../../tools/pokesleep-tool/src/util/PokemonRp";
import { createStrengthParameter } from "../../tools/pokesleep-tool/src/util/StrengthParameter";
import SubSkill, { type SubSkillType } from "../../tools/pokesleep-tool/src/util/SubSkill";
import SubSkillList from "../../tools/pokesleep-tool/src/util/SubSkillList";
import { NoTap } from "../../tools/pokesleep-tool/src/util/Energy";

export { pokemons, getMaxSkillLevel, isSkillStrengthZero };
export type { PokemonData, SubSkillType, IngredientType };

export const GOLD: SubSkillType[] = ["Berry Finding S", "Dream Shard Bonus", "Energy Recovery Bonus", "Helping Bonus", "Research EXP Bonus", "Skill Level Up M", "Sleep EXP Bonus"];
export const BLUE: SubSkillType[] = ["Helping Speed M", "Ingredient Finder M", "Inventory Up L", "Inventory Up M", "Skill Level Up S", "Skill Trigger M"];
export const WHITE: SubSkillType[] = ["Helping Speed S", "Ingredient Finder S", "Inventory Up S", "Skill Trigger S"];
export const SUBS: SubSkillType[] = [...GOLD, ...BLUE, ...WHITE];
/** 出現率 (Wiki* 検証/サブスキル抽選確率: 同一レア度内は同確率) */
export const PROB = (s: SubSkillType) => (GOLD.includes(s) ? 0.023 : BLUE.includes(s) ? 0.057 : 0.125);
/** エナジー計算に影響しないサブスキル (スキルレベルアップは利用者の指定レベルに含める前提で無視) */
export const NOOP = new Set<SubSkillType>(["Dream Shard Bonus", "Research EXP Bonus", "Sleep EXP Bonus", "Skill Level Up M", "Skill Level Up S"]);
export const NATURES = ["Bashful", "Bold", "Impish", "Lax", "Relaxed", "Timid", "Hasty", "Jolly", "Naive", "Lonely", "Adamant", "Naughty", "Brave", "Calm", "Gentle", "Careful", "Sassy", "Modest", "Mild", "Rash", "Quiet"];
export const ALL_NATURES = [...NATURES, "Hardy", "Docile", "Quirky", "Serious"];
export const NATURE_W = (n: string) => (n === "Bashful" ? 5 / 25 : 1 / 25);
export const SLOT_LEVELS = [10, 25, 50, 70, 80];

export interface Input {
	pokemonName: string;
	level: number;
	skillLevel: number;
	ingredient: IngredientType;
	/** Lv10/25/50/70/80 の順。空文字は無し */
	subs: (SubSkillType | "")[];
	nature: string;
	/** -1 好物なし, -2 好物あり, 0..8 フィールド */
	fieldIndex: number;
	/** 日中のタップ間隔 (分) */
	tap: number;
	/** フィールドボーナス % */
	fieldBonus: number;
}

export interface Metrics {
	total: number;
	berry: number;
	skillCount: number;
	skillE: number;
	ingTotal: number;
	ing: Record<string, number>;
	subs: SubSkillType[];
	nature: string;
	ingredient: IngredientType;
	weight: number;
}

/** 順序付き・重複なし抽選で、この組み合わせ (順不同) が出る確率 */
export function comboProb(subs: SubSkillType[]): number {
	const ps = subs.map(PROB);
	const perm = (rest: number[], used: number): number =>
		rest.length === 0 ? 1 : rest.reduce((acc, p, i) => acc + (p / (1 - used)) * perm(rest.filter((_, j) => j !== i), used + p), 0);
	return perm(ps, 0);
}

export function activeSlots(level: number): number {
	return SLOT_LEVELS.filter((l) => level >= l).length;
}

export function makeParam(input: Input) {
	return createStrengthParameter({
		level: input.level as 50,
		fieldIndex: input.fieldIndex,
		fieldBonus: input.fieldBonus,
		event: "none",
		addHelpingBonusEffect: false,
		maxSkillLevel: false,
		tapFrequencyAwake: input.tap <= 0 ? NoTap : input.tap,
		tapFrequencyAsleep: NoTap,
	});
}

export function ingredientTypes(pokemonName: string): IngredientType[] {
	const p = pokemons.find((x) => x.name === pokemonName)!;
	return IngredientTypes.filter((t) => p.ing3 || !t.includes("C"));
}

export function evaluateOne(input: Input, subs: SubSkillType[], nature: string, param = makeParam(input), ingredient: IngredientType = input.ingredient): Metrics {
	const eff = subs.filter((s) => !NOOP.has(s));
	const list: Record<string, SubSkill> = {};
	eff.forEach((s, i) => { list[`lv${SLOT_LEVELS[i]}`] = new SubSkill(s); });
	const pokemon = pokemons.find((p) => p.name === input.pokemonName)!;
	const skillLevel = Math.min(Math.max(1, input.skillLevel), getMaxSkillLevel(pokemon.skill));
	const iv = new PokemonIv({ pokemonName: input.pokemonName, level: input.level, subSkills: new SubSkillList(list), nature: new Nature(nature), ingredient, skillLevel });
	const r = new PokemonStrength(iv, param).calculate();
	const ing: Record<string, number> = {};
	for (const i of r.ingredients) ing[i.name] = (ing[i.name] ?? 0) + i.count;
	return { total: r.totalStrength, berry: r.berryTotalStrength, skillCount: r.skillCount, skillE: r.skillStrength, ingTotal: r.ingredients.reduce((s, i) => s + i.count, 0), ing, subs, nature, ingredient, weight: 0 };
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

export function populationSize(level: number, pokemonName?: string): number {
	const k = activeSlots(level);
	const n = SUBS.length;
	let c = 1;
	for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
	return Math.round(c) * NATURES.length * (pokemonName ? ingredientTypes(pokemonName).length : 1);
}

export interface Result { mine: Metrics; pool: Metrics[]; elapsedMs: number }

export function run(input: Input, onProgress?: (done: number, total: number) => void): Result {
	const t0 = Date.now();
	const param = makeParam(input);
	const k = activeSlots(input.level);
	const mySubs = input.subs.slice(0, k).filter((s): s is SubSkillType => s !== "");
	const mine = evaluateOne(input, mySubs, input.nature, param);
	const memo = new Map<string, Metrics>();
	const pool: Metrics[] = [];
	const ings = ingredientTypes(input.pokemonName);
	const total = populationSize(input.level, input.pokemonName);
	let done = 0;
	for (const ingredient of ings) for (const subs of combos(k)) {
		const eff = subs.filter((s) => !NOOP.has(s)).sort().join("|");
		const w = comboProb(subs) / ings.length;
		for (const nature of NATURES) {
			const key = `${ingredient}#${eff}#${nature}`;
			let m = memo.get(key);
			if (!m) { m = evaluateOne(input, subs, nature, param, ingredient); memo.set(key, m); }
			pool.push({ ...m, subs, nature, weight: w * NATURE_W(nature) });
			done++;
		}
		onProgress?.(done, total);
	}
	return { mine, pool, elapsedMs: Date.now() - t0 };
}

/** 指標の取り出し */
export type MetricKey = "total" | "berry" | "skillCount" | "skillE" | "ingTotal" | `ing:${string}`;
export function metric(m: Metrics, key: MetricKey): number {
	if (key.startsWith("ing:")) return m.ing[key.slice(4)] ?? 0;
	return m[key as Exclude<MetricKey, `ing:${string}`>];
}
/** この個体を上回る個体を 1 回の捕獲で引く確率 */
export function probBetter(pool: Metrics[], mine: Metrics, key: MetricKey): number {
	const v = metric(mine, key);
	let all = 0, better = 0;
	for (const m of pool) { all += m.weight; if (metric(m, key) > v + 1e-9) better += m.weight; }
	return all > 0 ? better / all : 0;
}
export function best(pool: Metrics[], key: MetricKey): Metrics {
	let b = pool[0];
	for (const m of pool) if (metric(m, key) > metric(b, key)) b = m;
	return b;
}
