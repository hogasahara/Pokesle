/** 画面表示用の略称と絵文字 */
export const SUB_SHORT: Record<string, string> = {
	"Berry Finding S": "きのみS", "Dream Shard Bonus": "かけらボ", "Energy Recovery Bonus": "げんき回復ボ", "Helping Bonus": "おてボ",
	"Research EXP Bonus": "リサEXP", "Skill Level Up M": "スキLvM", "Skill Level Up S": "スキLvS", "Sleep EXP Bonus": "睡眠EXP",
	"Helping Speed M": "おてスピM", "Helping Speed S": "おてスピS", "Ingredient Finder M": "食確M", "Ingredient Finder S": "食確S",
	"Inventory Up L": "所持L", "Inventory Up M": "所持M", "Inventory Up S": "所持S", "Skill Trigger M": "スキ確M", "Skill Trigger S": "スキ確S",
};
export const ING_EMOJI: Record<string, string> = {
	leek: "🥬", mushroom: "🍄", egg: "🥚", potato: "🥔", apple: "🍎", herb: "🌶️", sausage: "🍖", milk: "🥛", honey: "🍯", oil: "🫒",
	ginger: "🫚", tomato: "🍅", cacao: "🍫", tail: "🐾", soy: "🫘", corn: "🌽", coffee: "☕", pumpkin: "🎃", avocado: "🥑",
};
export const EFFECT_SHORT: Record<string, string> = {
	"Energy recovery": "げんき回復", "Main skill chance": "スキル確率", "Speed of help": "おてスピ", "Ingredient finding": "食材確率", "EXP gains": "EXP",
};
export const ING_SHORT: Record<string, string> = {
	leek: "ねぎ", mushroom: "キノコ", egg: "エッグ", potato: "ポテト", apple: "リンゴ", herb: "ハーブ", sausage: "ミート", milk: "ミルク", honey: "ミツ", oil: "オイル",
	ginger: "ジンジャー", tomato: "トマト", cacao: "カカオ", tail: "シッポ", soy: "大豆", corn: "コーン", coffee: "コーヒー", pumpkin: "カボチャ", avocado: "アボカド",
};
export const AREA_SHORT = ["ワカクサ", "シアン", "トープ", "ウノハナ", "ラピス", "ゴールド", "アンバー", "ワカクサEX", "シアンEX"];
/** メインスキル名の略称: 固有名があればそれだけ、(ランダム) は (乱) */
export function skillShort(name: string): string {
	const m = name.match(/^(.+?) \((.+)\)$/);
	let s = name;
	if (m) s = m[2] === "ランダム" ? `${m[1]}(乱)` : m[1];
	return s.replace("ゆめのかけらゲット", "かけらゲット").replace("おてつだいサポート", "おてサポ").replace("おてつだいブースト", "おてブースト").replace("料理パワーアップ", "料理パワー");
}
