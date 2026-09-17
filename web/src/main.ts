import Nature from "../../tools/pokesleep-tool/src/util/Nature";
import jaPokemonJson from "../../tools/pokesleep-tool/src/i18n/ja/pokemons.json";
import jaDataJson from "../../tools/pokesleep-tool/src/i18n/ja/data.json";
import jaSkillsJson from "../../tools/pokesleep-tool/src/i18n/ja/skills.json";
import commonJson from "../../tools/pokesleep-tool/src/i18n/ja/common.json";
import { ALL_NATURES, BLUE, GOLD, SLOT_LEVELS, SUBS, activeSlots, best, getMaxSkillLevel, isSkillStrengthZero, metric, pokemons, populationSize, probBetter, type Input, type IngredientType, type MetricKey, type Metrics, type PokemonData, type Result, type SubSkillType } from "./calc";

const jaPokemon = (jaPokemonJson as { pokemons: Record<string, string> }).pokemons;
const jaData = jaDataJson as { subskill: Record<string, string>; natures: Record<string, string>; "nature effect": Record<string, string>; ingredients: Record<string, string>; types: Record<string, string> };
const jaSkills = (jaSkillsJson as { skills: Record<string, { name: string }> }).skills;
const areas = (commonJson as { area: string[] }).area;
const jaSub = (s: string) => jaData.subskill[s] ?? s;
const jaIng = (s: string) => jaData.ingredients[s] ?? s;
const jaNature = (s: string) => jaData.natures[s] ?? s;
const jaEffect = (s: string) => jaData["nature effect"][s] ?? s;
const jaSpec: Record<string, string> = { Berries: "きのみ", Ingredients: "食材", Skills: "スキル", All: "オール" };

const targets: PokemonData[] = pokemons.filter((p) => p.frequency > 0 && p.specialty !== "All").sort((a, b) => a.id - b.id || a.name.localeCompare(b.name));
const natureByEffect = new Map<string, string>();
for (const n of ALL_NATURES) { const nt = new Nature(n); natureByEffect.set(`${nt.upEffect}|${nt.downEffect}`, n); }
const EFFECTS = ["Energy recovery", "Main skill chance", "Speed of help", "Ingredient finding", "EXP gains"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []) => {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
	for (const c of children) e.append(c);
	return e;
};
const option = (value: string, label: string) => el("option", { value }, [label]);

// ---- フォーム構築 ----
const pokemonSel = $<HTMLSelectElement>("pokemon");
for (const p of targets) pokemonSel.append(option(p.name, `${jaPokemon[p.name] ?? p.name} (${jaSpec[p.specialty]})`));
const levelIn = $<HTMLInputElement>("level");
const skillLvSel = $<HTMLSelectElement>("skillLevel");
const ing30 = $<HTMLSelectElement>("ing30");
const ing60 = $<HTMLSelectElement>("ing60");
const subSels = SLOT_LEVELS.map((lv) => $<HTMLSelectElement>(`sub${lv}`));
for (const s of subSels) {
	s.append(option("", "なし"));
	for (const sub of SUBS) s.append(option(sub, `${GOLD.includes(sub) ? "金" : BLUE.includes(sub) ? "青" : "白"} ${jaSub(sub)}`));
}
const upSel = $<HTMLSelectElement>("natureUp");
const downSel = $<HTMLSelectElement>("natureDown");
for (const s of [upSel, downSel]) { s.append(option("No effect", "なし")); for (const e of EFFECTS) s.append(option(e, jaEffect(e))); }
const basisSel = $<HTMLSelectElement>("basis");
const fieldSel = $<HTMLSelectElement>("field");
fieldSel.append(option("-1", "好物ではない (きのみ 1 倍)"), option("-2", "好物 (きのみ 2 倍)"));
areas.forEach((a, i) => fieldSel.append(option(String(i), a)));

function pokemon(): PokemonData { return targets.find((p) => p.name === pokemonSel.value) ?? targets[0]; }

function refreshPokemon() {
	const p = pokemon();
	const max = getMaxSkillLevel(p.skill);
	const cur = Number(skillLvSel.value) || max;
	skillLvSel.replaceChildren();
	for (let i = 1; i <= max; i++) skillLvSel.append(option(String(i), `Lv${i}`));
	skillLvSel.value = String(Math.min(cur, max));
	ing30.replaceChildren(option("A", `${jaIng(p.ing1.name)} ×${p.ing1.c2}`), option("B", `${jaIng(p.ing2.name)} ×${p.ing2.c2}`));
	ing60.replaceChildren(option("A", `${jaIng(p.ing1.name)} ×${p.ing1.c3}`), option("B", `${jaIng(p.ing2.name)} ×${p.ing2.c3}`));
	if (p.ing3) ing60.append(option("C", `${jaIng(p.ing3.name)} ×${p.ing3.c3}`));
	ing30.value = "B"; ing60.value = p.ing3 ? "C" : "B";
	$("ing1").textContent = `${jaIng(p.ing1.name)} ×${p.ing1.c1}`;
	$("skillName").textContent = jaSkills[p.skill]?.name ?? p.skill;
	refreshBasis();
	refreshSlots();
}
function refreshBasis() {
	const p = pokemon();
	const cur = basisSel.value;
	basisSel.replaceChildren(option("total", "合計エナジー (既定)"), option("skillCount", "スキル発動回数"), option("berry", "きのみエナジー"));
	const names = new Set<string>([p.ing1.name, ing30.value === "B" ? p.ing2.name : p.ing1.name, ing60.value === "B" ? p.ing2.name : ing60.value === "C" && p.ing3 ? p.ing3.name : p.ing1.name]);
	for (const n of names) basisSel.append(option(`ing:${n}`, `食材: ${jaIng(n)} の個数`));
	basisSel.append(option("ingTotal", "食材の合計個数"));
	basisSel.value = [...basisSel.options].some((o) => o.value === cur) ? cur : "total";
}
function refreshSlots() {
	const k = activeSlots(Number(levelIn.value) || 1);
	subSels.forEach((s, i) => { s.closest("label")!.classList.toggle("inactive", i >= k); });
}

function readInput(): Input {
	const up = upSel.value, down = downSel.value;
	let nature = natureByEffect.get(`${up}|${down}`);
	if (!nature) nature = "Bashful";
	return {
		pokemonName: pokemonSel.value,
		level: Math.max(1, Math.min(100, Number(levelIn.value) || 50)),
		skillLevel: Number(skillLvSel.value) || 1,
		ingredient: `A${ing30.value}${ing60.value}` as IngredientType,
		subs: subSels.map((s) => s.value as SubSkillType | ""),
		nature,
		fieldIndex: Number(fieldSel.value),
		tap: Number($<HTMLSelectElement>("tap").value),
		fieldBonus: Number($<HTMLInputElement>("fieldBonus").value) || 0,
	};
}

// ---- URL 共有 ----
function toQuery(): string {
	const q = new URLSearchParams();
	q.set("p", pokemonSel.value); q.set("lv", levelIn.value); q.set("sl", skillLvSel.value); q.set("ing", `A${ing30.value}${ing60.value}`);
	q.set("s", subSels.map((s) => (SUBS.indexOf(s.value as SubSkillType) + 1).toString(36)).join(""));
	q.set("nu", String(EFFECTS.indexOf(upSel.value) + 1)); q.set("nd", String(EFFECTS.indexOf(downSel.value) + 1));
	q.set("b", basisSel.value); q.set("f", fieldSel.value); q.set("t", $<HTMLSelectElement>("tap").value); q.set("fb", $<HTMLInputElement>("fieldBonus").value);
	return q.toString();
}
function fromQuery() {
	const q = new URLSearchParams(location.search);
	if (!q.get("p")) return false;
	pokemonSel.value = q.get("p")!; levelIn.value = q.get("lv") ?? "50";
	refreshPokemon();
	skillLvSel.value = q.get("sl") ?? skillLvSel.value;
	const ing = q.get("ing") ?? "ABC"; ing30.value = ing[1]; ing60.value = [...ing60.options].some((o) => o.value === ing[2]) ? ing[2] : "A";
	const s = q.get("s") ?? "";
	subSels.forEach((sel, i) => { const idx = parseInt(s[i] ?? "0", 36); sel.value = idx > 0 ? SUBS[idx - 1] : ""; });
	upSel.value = EFFECTS[Number(q.get("nu")) - 1] ?? "No effect"; downSel.value = EFFECTS[Number(q.get("nd")) - 1] ?? "No effect";
	refreshBasis(); basisSel.value = q.get("b") ?? "total";
	fieldSel.value = q.get("f") ?? "-1"; $<HTMLSelectElement>("tap").value = q.get("t") ?? "180"; $<HTMLInputElement>("fieldBonus").value = q.get("fb") ?? "0";
	return true;
}

// ---- 実行と表示 ----
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const label = (m: Metrics) => `${m.subs.filter(Boolean).map(jaSub).join(" / ") || "サブスキルなし"} + ${m.nature === "Bashful" ? "無補正" : jaNature(m.nature)}`;

let worker: Worker | null = null;
function runCalc() {
	const input = readInput();
	history.replaceState(null, "", `?${toQuery()}`);
	const p = pokemon();
	const btn = $<HTMLButtonElement>("run");
	btn.disabled = true;
	$("status").textContent = `計算中… 母集団 ${populationSize(input.level).toLocaleString()} 通り`;
	$("result").hidden = true;
	worker?.terminate();
	worker = new Worker("./worker.js");
	worker.onmessage = (e: MessageEvent) => {
		const d = e.data;
		if (d.type === "progress") { $("status").textContent = `計算中… ${Math.round((d.done / d.total) * 100)}%`; return; }
		btn.disabled = false;
		if (d.type === "error") { $("status").textContent = `エラー: ${d.message}`; return; }
		$("status").textContent = "";
		render(input, p, d as Result);
	};
	worker.postMessage(input);
}

function render(input: Input, p: PokemonData, res: Result) {
	const { mine, pool } = res;
	const basis = basisSel.value as MetricKey;
	const ideal = best(pool, basis);
	const ingNames = Object.keys(mine.ing);
	const rows: { key: MetricKey; name: string; fmt: (n: number) => string }[] = [
		{ key: "total", name: "合計エナジー/日", fmt: f0 },
		{ key: "berry", name: "きのみエナジー/日", fmt: f0 },
		{ key: "skillCount", name: "スキル発動/日", fmt: f2 },
		{ key: "skillE", name: "スキルエナジー/日", fmt: f0 },
		{ key: "ingTotal", name: "食材合計/日", fmt: f1 },
		...ingNames.map((n) => ({ key: `ing:${n}` as MetricKey, name: `${jaIng(n)}/日`, fmt: f1 })),
	];
	const zero = isSkillStrengthZero(p.skill);
	const basisName = basisSel.selectedOptions[0]?.textContent ?? basis;

	$("resultTitle").textContent = `${jaPokemon[p.name] ?? p.name} Lv${input.level} / スキルLv${input.skillLevel} / 食材 ${input.ingredient}`;
	$("mineLabel").textContent = label(mine);
	$("idealLabel").textContent = `${label(ideal)}  (基準: ${basisName})`;
	$("cond").textContent = `${fieldSel.selectedOptions[0].textContent}、日中 ${input.tap > 0 ? `${input.tap} 分ごとにタップ` : "タップなし"}、フィールドボーナス ${input.fieldBonus}%、イベントなし、げんきエール 18×3 回/日、母集団 ${pool.length.toLocaleString()} 通り (${(res.elapsedMs / 1000).toFixed(1)} 秒)`;

	const tb = $("cmpBody"); tb.replaceChildren();
	for (const r of rows) {
		const a = metric(ideal, r.key), b = metric(mine, r.key);
		if (r.key === "skillE" && zero) { tb.append(el("tr", {}, [el("td", {}, [r.name]), el("td", { colspan: "3", class: "muted" }, ["エナジー換算 0 のスキル"])])); continue; }
		const tr = el("tr", { class: r.key === basis ? "basis" : "" }, [el("td", {}, [r.name]), el("td", { class: "num" }, [r.fmt(a)]), el("td", { class: "num" }, [r.fmt(b)]), el("td", { class: "num" }, [a > 0 ? pct(b / a) : "-"])]);
		tb.append(tr);
	}
	const pb = $("probBody"); pb.replaceChildren();
	const probRows = rows.filter((r) => r.key !== "skillE" && r.key !== "berry" || r.key === "berry" && p.specialty === "Berries");
	for (const r of probRows) {
		const pr = probBetter(pool, mine, r.key);
		const bestM = best(pool, r.key);
		pb.append(el("tr", { class: r.key === basis ? "basis" : "" }, [el("td", {}, [r.name]), el("td", { class: "num" }, [pct(pr)]), el("td", { class: "num" }, [`${r.fmt(metric(bestM, r.key))}`]), el("td", { class: "small" }, [label(bestM)])]));
	}
	$("result").hidden = false;
	$("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- 初期化 ----
pokemonSel.addEventListener("change", refreshPokemon);
levelIn.addEventListener("input", refreshSlots);
ing30.addEventListener("change", refreshBasis);
ing60.addEventListener("change", refreshBasis);
$("run").addEventListener("click", runCalc);
$("share").addEventListener("click", async () => {
	const url = `${location.origin}${location.pathname}?${toQuery()}`;
	try { await navigator.clipboard.writeText(url); $("status").textContent = "URL をコピーしました"; } catch { $("status").textContent = url; }
});
levelIn.value = "50";
if (!fromQuery()) { pokemonSel.value = targets[0].name; refreshPokemon(); }
