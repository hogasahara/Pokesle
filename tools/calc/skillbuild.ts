/**
 * スキル得意ポケモンの厳選: Lv50・メインスキル最大で合計エナジーを最大化する
 * サブスキル 3 枠 (Lv10/25/50) × せいかくの全組み合わせを総当たりする。
 * 出力: docs/ranking/skill-build-lv50.md
 * 実行: bun run tools/calc/skillbuild.ts   (10〜15 分)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import pokemons, { type PokemonData } from "../pokesleep-tool/src/data/pokemons";
import Nature from "../pokesleep-tool/src/util/Nature";
import PokemonIv from "../pokesleep-tool/src/util/PokemonIv";
import PokemonStrength, { isSkillStrengthZero } from "../pokesleep-tool/src/util/PokemonStrength";
import { createStrengthParameter } from "../pokesleep-tool/src/util/StrengthParameter";
import SubSkill, { type SubSkillType } from "../pokesleep-tool/src/util/SubSkill";
import SubSkillList from "../pokesleep-tool/src/util/SubSkillList";

const TOOL = join(import.meta.dir, "../pokesleep-tool");
const SRC = join(TOOL, "src");
const jaPokemon: Record<string, string> = (await Bun.file(join(SRC, "i18n/ja/pokemons.json")).json()).pokemons;
const jaData = await Bun.file(join(SRC, "i18n/ja/data.json")).json();
const jaSkills: Record<string, { name: string }> = (await Bun.file(join(SRC, "i18n/ja/skills.json")).json()).skills;
const commit = execSync("git rev-parse --short HEAD", { cwd: TOOL }).toString().trim();
const today = new Date().toISOString().slice(0, 10);

const LEVEL = 50;
// エナジーに影響しうるサブスキルのみ (EXP 系・ゆめのかけら・スキルレベルアップ (最大前提のため) を除外)
const SUBS: SubSkillType[] = [
	"Berry Finding S", "Helping Bonus", "Skill Trigger M", "Skill Trigger S", "Helping Speed M", "Helping Speed S",
	"Ingredient Finder M", "Ingredient Finder S", "Inventory Up L", "Inventory Up M", "Inventory Up S", "Energy Recovery Bonus",
];
// 無補正 5 種は Bashful で代表
const NATURES = ["Bashful", "Bold", "Impish", "Lax", "Relaxed", "Timid", "Hasty", "Jolly", "Naive", "Lonely", "Adamant", "Naughty", "Brave", "Calm", "Gentle", "Careful", "Sassy", "Modest", "Mild", "Rash", "Quiet"];
const jaNat = (n: string) => (n === "Bashful" ? "無補正" : jaData.natures[n]);
const jaSub = (s: string) => jaData.subskill[s] ?? s;
const jaSkill = (s: string) => jaSkills[s]?.name ?? s;

interface Combo { subs: SubSkillType[]; nature: string; key: string; label: string }
const combos: Combo[] = [];
for (let a = 0; a < SUBS.length; a++) for (let b = a + 1; b < SUBS.length; b++) for (let c = b + 1; c < SUBS.length; c++) for (const nature of NATURES) {
	const subs = [SUBS[a], SUBS[b], SUBS[c]];
	combos.push({ subs, nature, key: `${subs.join("|")}|${nature}`, label: `${subs.map(jaSub).join(" / ")} + ${jaNat(nature)}` });
}

interface Res { combo: Combo; total: number; skillCount: number; berry: number; ing: number; skill: number }
function evalAll(p: PokemonData, fieldIndex: number): Res[] {
	const param = createStrengthParameter({ level: LEVEL, fieldIndex, fieldBonus: 0, maxSkillLevel: true, addHelpingBonusEffect: false, event: "none" });
	const out: Res[] = [];
	for (const combo of combos) {
		const iv = new PokemonIv({
			pokemonName: p.name, level: LEVEL, nature: new Nature(combo.nature),
			subSkills: new SubSkillList({ lv10: new SubSkill(combo.subs[0]), lv25: new SubSkill(combo.subs[1]), lv50: new SubSkill(combo.subs[2]) }),
		});
		const r = new PokemonStrength(iv, param).calculate();
		out.push({ combo, total: r.totalStrength, skillCount: r.skillCount, berry: r.berryTotalStrength, ing: r.ingStrength, skill: r.skillStrength });
	}
	return out;
}

const targets = pokemons.filter((p) => p.isFullyEvolved && (p.specialty === "Skills" || p.specialty === "All"));
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function section(title: string, fieldIndex: number): string {
	let md = `## ${title}\n\n`;
	const perPokemon: { p: PokemonData; sorted: Res[]; bySkillCount: Res }[] = [];
	const score = new Map<string, { sum: number; wins: number; combo: Combo }>();
	for (const p of targets) {
		const t0 = Date.now();
		const all = evalAll(p, fieldIndex);
		const sorted = [...all].sort((a, b) => b.total - a.total);
		const bySkillCount = [...all].sort((a, b) => b.skillCount - a.skillCount)[0];
		perPokemon.push({ p, sorted, bySkillCount });
		const max = sorted[0].total;
		for (const r of all) {
			const s = score.get(r.combo.key) ?? { sum: 0, wins: 0, combo: r.combo };
			s.sum += r.total / max;
			if (r === sorted[0]) s.wins++;
			score.set(r.combo.key, s);
		}
		console.error(`${title} ${jaPokemon[p.name] ?? p.name} ${((Date.now() - t0) / 1000).toFixed(1)}s best=${sorted[0].combo.label} ${f0(max)}`);
	}
	const n = targets.length;
	const general = [...score.values()].sort((a, b) => b.sum - a.sum).slice(0, 15);
	md += "### 汎用ランキング (全対象ポケモンでの「各自の最大エナジーに対する達成率」の平均)\n\n";
	md += "| 順位 | サブスキル (Lv10/25/50) | せいかく | 平均達成率 | 1 位になった匹数 |\n| --- | --- | --- | --- | --- |\n";
	general.forEach((g, i) => { md += `| ${i + 1} | ${g.combo.subs.map(jaSub).join(" / ")} | ${jaNat(g.combo.nature)} | ${pct(g.sum / n)} | ${g.wins} / ${n} |\n`; });
	md += "\n### ポケモン別 最適・次善・3 位\n\n";
	md += "次善以降は最適と異なる構成のうちエナジー順。( ) 内は最適比。「発動回数最大」は合計エナジーではなくスキル発動回数を最大化する構成 (げんき系など換算 0 のスキルで参考にする)。\n\n";
	md += "| ポケモン | メインスキル | 換算 | 最適構成 | 合計E (きのみ/食材/スキル) | 次善 | 合計E | 3 位 | 合計E | 発動回数最大 | 回/日 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
	perPokemon.sort((a, b) => b.sorted[0].total - a.sorted[0].total);
	for (const { p, sorted, bySkillCount } of perPokemon) {
		const [b1, b2, b3] = sorted;
		md += `| ${jaPokemon[p.name] ?? p.name} | ${jaSkill(p.skill)} | ${isSkillStrengthZero(p.skill) ? "0" : "あり"} | ${b1.combo.label} | ${f0(b1.total)} (${f0(b1.berry)}/${f0(b1.ing)}/${f0(b1.skill)}) | ${b2.combo.label} | ${f0(b2.total)} (${pct(b2.total / b1.total)}) | ${b3.combo.label} | ${f0(b3.total)} (${pct(b3.total / b1.total)}) | ${bySkillCount.combo.label} | ${bySkillCount.skillCount.toFixed(2)} |\n`;
	}
	return md + "\n";
}

let md = `# スキル得意ポケモンの厳選: Lv50 最適サブスキル・せいかく

自動生成: ${today} (pokesleep-tool ${commit})。編集せず \`bun run tools/calc/skillbuild.ts\` で再生成する。

## 前提

- 対象: 得意分野がスキル (とオール) の最終進化形 ${targets.length} 匹
- Lv${LEVEL}。有効なサブスキルは Lv10 / Lv25 / Lv50 の 3 枠。枠の順序は結果に影響しないので組み合わせで探索
- 候補サブスキル ${SUBS.length} 種: ${SUBS.map(jaSub).join("、")} (EXP 系、ゆめのかけらボーナス、スキルレベルアップ M/S は除外。スキルレベルは最大固定のため)
- せいかく: 効果のある 20 種 + 無補正。組み合わせ数 ${combos.length} 通り/匹
- メインスキル最大レベル、フィールドボーナス 0%、EX 効果なし、イベントなし、睡眠スコア 100、げんきエール 18 × 3 回/日 (にとよんツール既定)
- 評価指標は「合計エナジー/日」= きのみ + 食材 + スキルのエナジー換算。スキル換算が 0 のスキル (げんき系、ゆめのかけら、料理チャンス、ゆびをふる、スキルコピー) はスキル分が 0 で評価されるので「換算 0」列を見ること
- おてつだいボーナスは自分の 5% 短縮分のみ (他メンバーへの効果は含めない)
- 食材構成は ABC 既定。食材エナジーは料理ボーナス 25%、レシピ Lv30 換算

`;
md += section("好物きのみでない場合 (きのみエナジー 1 倍)", -1);
md += section("好物きのみの場合 (きのみエナジー 2 倍)", -2);
writeFileSync(join(import.meta.dir, "../../docs/ranking/skill-build-lv50.md"), md);
console.log("done");
