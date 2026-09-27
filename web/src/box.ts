/** 保存済み個体 (ブラウザの localStorage)。将来のシート連携を考え、1 件をフラットな JSON にする */
export type Rank = "main" | "candidate" | "none";
/** 指標ごとの値。キーは calc.ts の MetricKey (total, berry, skillCount, skillE, ingTotal, ing:<食材>) */
export interface SavedResult {
	v: 2;
	/** この個体の各指標 */
	m: Record<string, number>;
	/** 各指標で上を引く確率 */
	p: Record<string, number>;
	/** 各指標の理論最大 (同じ食材構成内) とその構成ラベル */
	ideal: Record<string, { v: number; label: string }>;
	basis: string; field: number; tap: number; fieldBonus: number; at: string;
}
/** 旧形式 (v1) を v2 に読み替える */
export function normalizeResult(r: unknown): SavedResult | undefined {
	if (!r || typeof r !== "object") return undefined;
	const o = r as Record<string, unknown>;
	if (o.v === 2) return o as unknown as SavedResult;
	const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
	const m: Record<string, number> = {}; const p: Record<string, number> = {};
	for (const [k, v] of [["total", n("total")], ["berry", n("berry")], ["skillCount", n("skillCount")], ["ingTotal", n("ingTotal")]] as const) if (v !== undefined) m[k] = v;
	for (const [k, v] of [["total", n("pTotal")], ["skillCount", n("pSkill")], ["ingTotal", n("pIng")]] as const) if (v !== undefined) p[k] = v;
	return { v: 2, m, p, ideal: {}, basis: String(o.basis ?? "total"), field: Number(o.field ?? -1), tap: Number(o.tap ?? 180), fieldBonus: Number(o.fieldBonus ?? 0), at: String(o.at ?? "") };
}
export interface SavedMon {
	id: string; name: string; rank: Rank;
	pokemonName: string; level: number; skillLevel: number; ingredient: string;
	subs: (string | null)[]; nature: string;
	createdAt: string; updatedAt: string;
	result?: SavedResult;
}
const KEY = "pokesle.box.v1";

export function loadBox(): SavedMon[] {
	try {
		const raw = localStorage.getItem(KEY); if (!raw) return [];
		const arr = JSON.parse(raw); if (!Array.isArray(arr)) return [];
		return arr.map((m: SavedMon) => ({ ...m, result: normalizeResult(m.result) }));
	} catch { return []; }
}
function saveBox(list: SavedMon[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 容量超過などは無視 */ } }

/** 種ごとの連番で既定名を作る (欠番は再利用しない) */
export function defaultName(jaName: string, list = loadBox()): string {
	const re = new RegExp(`^${jaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{3})$`);
	let max = 0;
	for (const m of list) { const r = m.name.match(re); if (r) max = Math.max(max, Number(r[1])); }
	return `${jaName}${String(max + 1).padStart(3, "0")}`;
}
export function isDefaultName(name: string): boolean { return /\d{3}$/.test(name); }
export function findByName(name: string, list = loadBox()): SavedMon | undefined { return list.find((m) => m.name === name); }
export function listBySpecies(pokemonName: string, list = loadBox()): SavedMon[] {
	return list.filter((m) => m.pokemonName === pokemonName).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** 同名があれば上書き、なければ追加。戻り値は保存後の個体 */
export function upsert(mon: Omit<SavedMon, "id" | "createdAt" | "updatedAt">): SavedMon {
	const list = loadBox();
	const now = new Date().toISOString();
	const idx = list.findIndex((m) => m.name === mon.name);
	let saved: SavedMon;
	if (idx >= 0) { saved = { ...list[idx], ...mon, updatedAt: now }; list[idx] = saved; }
	else { saved = { ...mon, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: now, updatedAt: now }; list.push(saved); }
	saveBox(list);
	return saved;
}
export function remove(id: string) { saveBox(loadBox().filter((m) => m.id !== id)); }
