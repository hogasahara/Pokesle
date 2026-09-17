import Nature from "../../tools/pokesleep-tool/src/util/Nature";
import jaPokemonJson from "../../tools/pokesleep-tool/src/i18n/ja/pokemons.json";
import jaDataJson from "../../tools/pokesleep-tool/src/i18n/ja/data.json";
import jaSkillsJson from "../../tools/pokesleep-tool/src/i18n/ja/skills.json";
import commonJson from "../../tools/pokesleep-tool/src/i18n/ja/common.json";
import { ALL_NATURES, BLUE, GOLD, SLOT_LEVELS, SUBS, activeSlots, best, getMaxSkillLevel, isSkillStrengthZero, metric, pokemons, populationSize, probBetter, type Input, type IngredientType, type MetricKey, type Metrics, type PokemonData, type Result, type SubSkillType } from "./calc";

const jaPokemon = (jaPokemonJson as { pokemons: Record<string, string> }).pokemons;
const jaData = jaDataJson as { subskill: Record<string, string>; natures: Record<string, string>; "nature effect": Record<string, string>; ingredients: Record<string, string> };
const jaSkills = (jaSkillsJson as { skills: Record<string, { name: string }> }).skills;
const areas = (commonJson as { area: string[] }).area;
const jaSub = (s: string) => jaData.subskill[s] ?? s;
const jaIng = (s: string) => jaData.ingredients[s] ?? s;
const jaNature = (s: string) => jaData.natures[s] ?? s;
const jaEffect = (s: string) => jaData["nature effect"][s] ?? s;
const jaSpec: Record<string, string> = { Berries: "きのみ", Ingredients: "食材", Skills: "スキル", All: "オール" };
const EFFECTS = ["Energy recovery", "Main skill chance", "Speed of help", "Ingredient finding", "EXP gains"];
const targets: PokemonData[] = pokemons.filter((p) => p.frequency > 0 && p.specialty !== "All").sort((a, b) => a.id - b.id || a.name.localeCompare(b.name));
const natureByEffect = new Map<string, string>();
for (const n of ALL_NATURES) { const nt = new Nature(n); natureByEffect.set(`${nt.upEffect}|${nt.downEffect}`, n); }
const kata = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase();

// ---- 状態 ----
interface State {
	pokemonName: string; level: number; skillLevel: number; ing30: "A" | "B"; ing60: "A" | "B" | "C";
	subs: (SubSkillType | "" | null)[]; // null = 未割り当て, "" = なし
	natureUp: string; natureDown: string; basis: string; field: number; tap: number; fieldBonus: number;
}
const state: State = { pokemonName: targets[0].name, level: 50, skillLevel: 6, ing30: "B", ing60: "C", subs: [null, null, null, null, null], natureUp: "No effect", natureDown: "No effect", basis: "total", field: -1, tap: 180, fieldBonus: 0 };
const pokemon = (): PokemonData => targets.find((p) => p.name === state.pokemonName) ?? targets[0];

// ---- DOM ヘルパ ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []) => {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
	for (const c of children) e.append(c);
	return e;
};
const chip = (label: string, on: boolean, onClick: () => void, cls = "", badge?: string) => {
	const b = el("button", { type: "button", class: `chip ${cls}${on ? " on" : ""}` }, [label]);
	if (badge) b.append(el("span", { class: "badge" }, [badge]));
	b.addEventListener("click", () => { onClick(); renderAll(); });
	return b;
};
const chips = (container: HTMLElement, items: HTMLElement[]) => container.replaceChildren(...items);

// ---- 各セクションの描画 ----
function renderPokemon() {
	const p = pokemon();
	$("pokemonCurrent").textContent = `${jaPokemon[p.name] ?? p.name} (${jaSpec[p.specialty]}、${jaSkills[p.skill]?.name ?? p.skill})`;
	const q = kata($<HTMLInputElement>("pokemonSearch").value.trim());
	const list = $("pokemonList");
	if (!q) { list.replaceChildren(); return; }
	const hits = targets.filter((t) => kata(jaPokemon[t.name] ?? t.name).includes(q) || t.name.toLowerCase().includes(q)).slice(0, 10);
	chips(list, hits.map((t) => chip(jaPokemon[t.name] ?? t.name, t.name === state.pokemonName, () => { selectPokemon(t.name); $<HTMLInputElement>("pokemonSearch").value = ""; })));
	if (hits.length === 0) list.replaceChildren(el("span", { class: "muted" }, ["該当なし"]));
}
function selectPokemon(name: string) {
	state.pokemonName = name;
	const p = pokemon();
	state.skillLevel = Math.min(state.skillLevel, getMaxSkillLevel(p.skill));
	if (state.ing60 === "C" && !p.ing3) state.ing60 = "B";
	if (!basisOptions().some((o) => o.key === state.basis)) state.basis = "total";
}
function renderLevel() {
	chips($("levelChips"), [50, 60, 70].map((lv) => chip(`Lv${lv}`, state.level === lv, () => { state.level = lv; })));
	const input = $<HTMLInputElement>("level");
	if (Number(input.value) !== state.level) input.value = String(state.level);
	const max = getMaxSkillLevel(pokemon().skill);
	if (state.skillLevel > max) state.skillLevel = max;
	chips($("skillLevelChips"), Array.from({ length: max }, (_, i) => i + 1).map((lv) => chip(`Lv${lv}`, state.skillLevel === lv, () => { state.skillLevel = lv; })));
}
function renderIngredients() {
	const p = pokemon();
	$("ing1").textContent = `${jaIng(p.ing1.name)} ×${p.ing1.c1}`;
	chips($("ing30Chips"), [
		chip(`${jaIng(p.ing1.name)} ×${p.ing1.c2}`, state.ing30 === "A", () => { state.ing30 = "A"; }),
		chip(`${jaIng(p.ing2.name)} ×${p.ing2.c2}`, state.ing30 === "B", () => { state.ing30 = "B"; }),
	]);
	const c60 = [
		chip(`${jaIng(p.ing1.name)} ×${p.ing1.c3}`, state.ing60 === "A", () => { state.ing60 = "A"; }),
		chip(`${jaIng(p.ing2.name)} ×${p.ing2.c3}`, state.ing60 === "B", () => { state.ing60 = "B"; }),
	];
	if (p.ing3) c60.push(chip(`${jaIng(p.ing3.name)} ×${p.ing3.c3}`, state.ing60 === "C", () => { state.ing60 = "C"; }));
	chips($("ing60Chips"), c60);
}
function firstFreeSlot(): number { return state.subs.findIndex((s) => s === null); }
function renderSubs() {
	const k = activeSlots(state.level);
	const color = (s: SubSkillType) => (GOLD.includes(s) ? "gold" : BLUE.includes(s) ? "blue" : "white");
	const items = SUBS.map((s) => {
		const idx = state.subs.indexOf(s);
		return chip(jaSub(s), idx >= 0, () => {
			if (idx >= 0) { state.subs[idx] = null; return; }
			const free = firstFreeSlot(); if (free >= 0) state.subs[free] = s;
		}, `${color(s)}${idx >= 0 && idx >= k ? " inactive" : ""}`, idx >= 0 ? `Lv${SLOT_LEVELS[idx]}` : undefined);
	});
	const noneIdx = state.subs.indexOf("");
	items.push(chip("なし", noneIdx >= 0, () => { const free = firstFreeSlot(); if (free >= 0) state.subs[free] = ""; }, "none", noneIdx >= 0 ? state.subs.map((s, i) => (s === "" ? `Lv${SLOT_LEVELS[i]}` : "")).filter(Boolean).join(",") : undefined));
	items.push(chip("クリア", false, () => { state.subs = [null, null, null, null, null]; }, "clear"));
	chips($("subChips"), items);
	$("subSummary").replaceChildren(...SLOT_LEVELS.map((lv, i) => {
		const s = state.subs[i];
		return el("span", { class: `slot${i >= k ? " inactive" : ""}` }, [`Lv${lv}: ${s === null ? "—" : s === "" ? "なし" : jaSub(s)}`]);
	}));
}
function renderNature() {
	const mk = (kind: "natureUp" | "natureDown", other: "natureUp" | "natureDown") => EFFECTS.map((e) => chip(jaEffect(e), state[kind] === e, () => {
		state[kind] = state[kind] === e ? "No effect" : e;
		if (state[other] === e) state[other] = "No effect";
	}));
	chips($("natureUpChips"), mk("natureUp", "natureDown"));
	chips($("natureDownChips"), mk("natureDown", "natureUp"));
	const n = natureByEffect.get(`${state.natureUp}|${state.natureDown}`);
	const half = (state.natureUp === "No effect") !== (state.natureDown === "No effect");
	$("natureName").textContent = half ? "上がる・下がるは両方選ぶか、両方なし (無補正) にしてください" : n ? (n === "Bashful" ? "無補正 (てれや など)" : jaNature(n)) : "この組み合わせのせいかくはありません";
	$<HTMLButtonElement>("run").disabled = half || !n;
}
function basisOptions(): { key: string; label: string }[] {
	const p = pokemon();
	const names = new Set<string>([p.ing1.name, state.ing30 === "B" ? p.ing2.name : p.ing1.name, state.ing60 === "B" ? p.ing2.name : state.ing60 === "C" && p.ing3 ? p.ing3.name : p.ing1.name]);
	return [
		{ key: "total", label: "合計エナジー" }, { key: "skillCount", label: "スキル発動回数" }, { key: "berry", label: "きのみエナジー" },
		...[...names].map((n) => ({ key: `ing:${n}`, label: `${jaIng(n)} の個数` })), { key: "ingTotal", label: "食材の合計個数" },
	];
}
function renderBasis() {
	const opts = basisOptions();
	if (!opts.some((o) => o.key === state.basis)) state.basis = "total";
	chips($("basisChips"), opts.map((o) => chip(o.label, state.basis === o.key, () => { state.basis = o.key; })));
	chips($("tapChips"), [[60, "1 時間ごと"], [180, "3 時間ごと"], [480, "8 時間ごと"]].map(([v, l]) => chip(String(l), state.tap === v, () => { state.tap = Number(v); })));
	const f = $<HTMLSelectElement>("field"); if (f.value !== String(state.field)) f.value = String(state.field);
	const fb = $<HTMLInputElement>("fieldBonus"); if (Number(fb.value) !== state.fieldBonus) fb.value = String(state.fieldBonus);
}
function renderAll() { renderPokemon(); renderLevel(); renderIngredients(); renderSubs(); renderNature(); renderBasis(); }

// ---- URL 共有 ----
function toQuery(): string {
	const q = new URLSearchParams();
	q.set("p", state.pokemonName); q.set("lv", String(state.level)); q.set("sl", String(state.skillLevel)); q.set("ing", `A${state.ing30}${state.ing60}`);
	q.set("s", state.subs.map((s) => (s === null ? "0" : s === "" ? "z" : (SUBS.indexOf(s) + 1).toString(36))).join(""));
	q.set("nu", String(EFFECTS.indexOf(state.natureUp) + 1)); q.set("nd", String(EFFECTS.indexOf(state.natureDown) + 1));
	q.set("b", state.basis); q.set("f", String(state.field)); q.set("t", String(state.tap)); q.set("fb", String(state.fieldBonus));
	return q.toString();
}
function fromQuery(): boolean {
	const q = new URLSearchParams(location.search);
	const p = q.get("p");
	if (!p || !targets.some((t) => t.name === p)) return false;
	state.pokemonName = p;
	state.level = Number(q.get("lv")) || 50; state.skillLevel = Number(q.get("sl")) || 6;
	const ing = q.get("ing") ?? "ABC"; state.ing30 = ing[1] === "A" ? "A" : "B"; state.ing60 = (["A", "B", "C"].includes(ing[2]) ? ing[2] : "C") as State["ing60"];
	const s = q.get("s") ?? "";
	state.subs = SLOT_LEVELS.map((_, i) => { const c = s[i]; if (!c || c === "0") return null; if (c === "z") return ""; const idx = parseInt(c, 36) - 1; return SUBS[idx] ?? null; });
	state.natureUp = EFFECTS[Number(q.get("nu")) - 1] ?? "No effect"; state.natureDown = EFFECTS[Number(q.get("nd")) - 1] ?? "No effect";
	state.basis = q.get("b") ?? "total"; state.field = Number(q.get("f") ?? -1); state.tap = Number(q.get("t") ?? 180); state.fieldBonus = Number(q.get("fb") ?? 0);
	selectPokemon(p);
	return true;
}

// ---- 実行と表示 ----
const f0 = (n: number) => Math.round(n).toLocaleString("ja-JP");
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const label = (m: Metrics) => `${m.subs.filter(Boolean).map(jaSub).join(" / ") || "サブスキルなし"} + ${m.nature === "Bashful" ? "無補正" : jaNature(m.nature)}`;

function readInput(): Input {
	return {
		pokemonName: state.pokemonName, level: Math.max(1, Math.min(100, state.level)), skillLevel: state.skillLevel,
		ingredient: `A${state.ing30}${state.ing60}` as IngredientType,
		subs: state.subs.map((s) => (s === null ? "" : s)), nature: natureByEffect.get(`${state.natureUp}|${state.natureDown}`) ?? "Bashful",
		fieldIndex: state.field, tap: state.tap, fieldBonus: state.fieldBonus,
	};
}
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
	const basis = state.basis as MetricKey;
	const ideal = best(pool, basis);
	const rows: { key: MetricKey; name: string; fmt: (n: number) => string }[] = [
		{ key: "total", name: "合計エナジー/日", fmt: f0 }, { key: "berry", name: "きのみエナジー/日", fmt: f0 },
		{ key: "skillCount", name: "スキル発動/日", fmt: f2 }, { key: "skillE", name: "スキルエナジー/日", fmt: f0 },
		{ key: "ingTotal", name: "食材合計/日", fmt: f1 },
		...Object.keys(mine.ing).map((n) => ({ key: `ing:${n}` as MetricKey, name: `${jaIng(n)}/日`, fmt: f1 })),
	];
	const zero = isSkillStrengthZero(p.skill);
	$("resultTitle").textContent = `${jaPokemon[p.name] ?? p.name} Lv${input.level} / スキルLv${input.skillLevel} / 食材 ${input.ingredient}`;
	$("mineLabel").textContent = label(mine);
	$("idealLabel").textContent = `${label(ideal)}  (基準: ${basisOptions().find((o) => o.key === basis)?.label ?? basis})`;
	$("cond").textContent = `${$<HTMLSelectElement>("field").selectedOptions[0].textContent}、日中 ${input.tap} 分ごとにタップ、フィールドボーナス ${input.fieldBonus}%、イベントなし、げんきエール 18×3 回/日、母集団 ${pool.length.toLocaleString()} 通り (${(res.elapsedMs / 1000).toFixed(1)} 秒)`;
	const tb = $("cmpBody"); tb.replaceChildren();
	for (const r of rows) {
		const a = metric(ideal, r.key), b = metric(mine, r.key);
		if (r.key === "skillE" && zero) { tb.append(el("tr", {}, [el("td", {}, [r.name]), el("td", { colspan: "3", class: "muted" }, ["エナジー換算 0 のスキル"])])); continue; }
		tb.append(el("tr", { class: r.key === basis ? "basis" : "" }, [el("td", {}, [r.name]), el("td", { class: "num" }, [r.fmt(a)]), el("td", { class: "num" }, [r.fmt(b)]), el("td", { class: "num" }, [a > 0 ? pct(b / a) : "-"])]));
	}
	const pb = $("probBody"); pb.replaceChildren();
	for (const r of rows.filter((r) => r.key !== "skillE" && (r.key !== "berry" || p.specialty === "Berries"))) {
		const bestM = best(pool, r.key);
		pb.append(el("tr", { class: r.key === basis ? "basis" : "" }, [el("td", {}, [r.name]), el("td", { class: "num" }, [pct(probBetter(pool, mine, r.key))]), el("td", { class: "num" }, [r.fmt(metric(bestM, r.key))]), el("td", { class: "small" }, [label(bestM)])]));
	}
	$("result").hidden = false;
	$("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- 初期化 ----
const fieldSel = $<HTMLSelectElement>("field");
fieldSel.append(el("option", { value: "-1" }, ["好物ではない (きのみ 1 倍)"]), el("option", { value: "-2" }, ["好物 (きのみ 2 倍)"]));
areas.forEach((a, i) => fieldSel.append(el("option", { value: String(i) }, [a])));
fieldSel.addEventListener("change", () => { state.field = Number(fieldSel.value); });
$<HTMLInputElement>("fieldBonus").addEventListener("input", (e) => { state.fieldBonus = Number((e.target as HTMLInputElement).value) || 0; });
$<HTMLInputElement>("level").addEventListener("input", (e) => { const v = Number((e.target as HTMLInputElement).value); if (v >= 1 && v <= 100) { state.level = v; renderLevel(); renderSubs(); } });
$<HTMLInputElement>("pokemonSearch").addEventListener("input", renderPokemon);
$("run").addEventListener("click", runCalc);
$("share").addEventListener("click", async () => {
	const url = `${location.origin}${location.pathname}?${toQuery()}`;
	try { await navigator.clipboard.writeText(url); $("status").textContent = "URL をコピーしました"; } catch { $("status").textContent = url; }
});
if (!fromQuery()) selectPokemon(targets[0].name);
renderAll();
