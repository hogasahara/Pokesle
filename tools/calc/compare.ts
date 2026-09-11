/**
 * 個体比較: 同じポケモンの 2 つ以上の構成 (サブスキル + せいかく + スキルレベル) を
 * 複数の運用条件 (タップ頻度、好物の有無) で比較する。
 *
 * 実行例:
 *   bun run tools/calc/compare.ts Latios 50 \
 *     "A=Ingredient Finder M,Skill Trigger M,Skill Level Up S;Adamant;3" \
 *     "B=Inventory Up S,Inventory Up M,Energy Recovery Bonus;Careful;3"
 *
 * 構成の書式: 名前=サブスキル(英名, カンマ区切り, Lv10/25/50/70/80 の順);せいかく(英名);スキルレベル(ゲーム内表示値)
 * サブスキルとせいかくの英名は tools/pokesleep-tool/src/util/SubSkill.ts, Nature.ts を参照。
 * スキルレベルは省略可 (省略時は最大)。
 */
import Nature from "../pokesleep-tool/src/util/Nature";
import PokemonIv from "../pokesleep-tool/src/util/PokemonIv";
import PokemonStrength from "../pokesleep-tool/src/util/PokemonStrength";
import { createStrengthParameter } from "../pokesleep-tool/src/util/StrengthParameter";
import SubSkill, { type SubSkillType } from "../pokesleep-tool/src/util/SubSkill";
import SubSkillList from "../pokesleep-tool/src/util/SubSkillList";
import { NoTap } from "../pokesleep-tool/src/util/Energy";

const [pokemonName, levelStr, ...buildArgs] = process.argv.slice(2);
if (!pokemonName || !levelStr || buildArgs.length < 1) {
	console.error("usage: bun run tools/calc/compare.ts <PokemonName> <level> <build>...");
	process.exit(1);
}
const level = Number(levelStr);
const builds = buildArgs.map((arg) => {
	const [name, spec] = arg.split("=");
	const [subs, nature, skillLevel] = spec.split(";");
	const slots = ["lv10", "lv25", "lv50", "lv70", "lv80"] as const;
	const list: Partial<Record<(typeof slots)[number], SubSkill>> = {};
	subs.split(",").map((s) => s.trim()).filter(Boolean).forEach((s, i) => { list[slots[i]] = new SubSkill(s as SubSkillType); });
	return { name, subs: new SubSkillList(list), nature: new Nature(nature.trim()), skillLevel: skillLevel ? Number(skillLevel) : undefined };
});

const scenarios = [
	{ label: "3h ごとにタップ (既定)", tap: 180 },
	{ label: "8h ごとにタップ", tap: 480 },
	// 日中タップなし (NoTap) はツール上スキル回収も 0 になり参考にならないので出さない
];
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");

for (const [fname, fieldIndex] of [["好物なし", -1], ["好物あり", -2]] as const) {
	console.log(`\n## ${pokemonName} Lv${level} ${fname}\n`);
	console.log("| 運用 | " + builds.map((b) => `${b.name} 合計E (きのみ/食材/スキル) 発動/日 所持数`).join(" | ") + " | 差 (先頭比) |");
	console.log("| --- | " + builds.map(() => "---").join(" | ") + " | --- |");
	for (const sc of scenarios) {
		const cells: string[] = [];
		const totals: number[] = [];
		for (const b of builds) {
			const iv = new PokemonIv({ pokemonName, level, subSkills: b.subs, nature: b.nature, ...(b.skillLevel !== undefined && { skillLevel: b.skillLevel }) });
			const param = createStrengthParameter({
				level: level as 50, fieldIndex, fieldBonus: 0, event: "none", addHelpingBonusEffect: false,
				maxSkillLevel: b.skillLevel === undefined, tapFrequencyAwake: sc.tap === NoTap ? NoTap : sc.tap, tapFrequencyAsleep: NoTap,
			});
			const r = new PokemonStrength(iv, param).calculate();
			totals.push(r.totalStrength);
			cells.push(`${f0(r.totalStrength)} (${f0(r.berryTotalStrength)}/${f0(r.ingStrength)}/${f0(r.skillStrength)}) ${r.skillCount.toFixed(2)} ${r.carryLimit}`);
		}
		const diff = totals.slice(1).map((t) => `${((t / totals[0] - 1) * 100).toFixed(1)}%`).join(", ");
		console.log(`| ${sc.label} | ${cells.join(" | ")} | ${diff || "-"} |`);
	}
}
