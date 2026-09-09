#!/usr/bin/env python3
"""Game8 の料理レシピ一覧ページから docs/recipes.md を生成する。

実行: python3 tools/calc/recipes.py            (ページを取得して生成)
      python3 tools/calc/recipes.py page.html  (保存済み HTML から生成)
"""
import html, re, sys, datetime, urllib.request, pathlib

URL = "https://game8.jp/pokemonsleep/542649"
OUT = pathlib.Path(__file__).resolve().parents[2] / "docs" / "recipes.md"

if len(sys.argv) > 1:
    src = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
else:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    src = urllib.request.urlopen(req).read().decode("utf-8", "ignore")

def text(c):
    return re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", " ", c))).strip()

tables = re.findall(r"<table.*?</table>", src, flags=re.S)
recipes, ing_energy = [], []
for t in tables:
    rows = [re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, flags=re.S) for r in re.findall(r"<tr.*?</tr>", t, flags=re.S)]
    if not rows:
        continue
    head = [text(c) for c in rows[0]]
    if "料理/レシピボーナス" in head:
        for r in rows[1:]:
            if len(r) < 4:
                continue
            name_c, ing_c, cat = text(r[1]), text(r[2]), text(r[3])
            m = re.match(r"(.+?)\s*(?:NEW)?\s*【([\d.]+)倍】", name_c)
            name, bonus = (m.group(1).strip(), m.group(2)) if m else (name_c, "")
            ings = re.findall(r"([^\s×]+)\s*×\s*(\d+)", ing_c)
            e = re.search(r"エナジー\s*([\d,]+)", ing_c)
            energy = int(e.group(1).replace(",", "")) if e else 0
            recipes.append(dict(name=name, bonus=bonus, cat=cat, ings=ings, energy=energy, total=sum(int(n) for _, n in ings)))
    elif head[:2] == ["食材", "エナジー量"]:
        for r in rows[1:]:
            if len(r) >= 2:
                ing_energy.append((text(r[0]).replace(" ※", ""), text(r[1])))

assert recipes, "レシピ表が見つからない (ページ構造が変わった可能性)"
upd = re.search(r'"dateModified":"([^"T]+)', src)
today = datetime.date.today().isoformat()

md = [f"# 料理レシピ一覧\n",
      f"自動生成: {today}。出典: [Game8 料理レシピ一覧]({URL}) (ページ最終更新: {upd.group(1).strip() if upd else '不明'})。編集せず `python3 tools/calc/recipes.py` で再生成する。\n",
      "- 「初期エナジー」= 必須食材の合計エナジー × レシピボーナス (レシピ Lv1、追加食材なし)",
      "- 調理エナジー = 初期エナジー + 初期エナジー × レシピレベルボーナス + 追加食材のエナジー。最終エナジー = 調理エナジー × フィールドボーナス × イベントボーナス × 大成功倍率",
      "- 食材数はレシピの必須食材の合計。鍋の容量と比較する\n"]
for cat in ["カレー・シチュー", "サラダ", "デザート・ドリンク"]:
    rs = sorted([r for r in recipes if r["cat"] == cat], key=lambda r: -r["energy"])
    md.append(f"## {cat} ({len(rs)} 種)\n")
    md.append("| 料理 | 初期エナジー | レシピボーナス | 食材数 | 必要食材 |\n| --- | --- | --- | --- | --- |")
    for r in rs:
        md.append(f"| {r['name']} | {r['energy']:,} | {r['bonus']}倍 | {r['total']} | {'、'.join(f'{n}×{c}' for n, c in r['ings'])} |")
    md.append("")
other = [r for r in recipes if r["cat"] not in ("カレー・シチュー", "サラダ", "デザート・ドリンク")]
if other:
    md.append("## 分類不明\n")
    for r in other:
        md.append(f"- {r['name']} ({r['cat']}) {r['energy']}")
    md.append("")
md.append("## 食材ごとのエナジー (1 個あたり)\n")
md.append("| 食材 | エナジー |\n| --- | --- |")
for n, e in ing_energy:
    md.append(f"| {n} | {e} |")
md.append("")
OUT.write_text("\n".join(md), encoding="utf-8")
print("done", len(recipes), "recipes,", len(ing_energy), "ingredients")
