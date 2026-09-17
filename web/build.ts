/** web/ をビルドして web/dist に出力する。実行: bun run web/build.ts */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const root = import.meta.dir;
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const res = await Bun.build({
	entrypoints: [join(root, "src/main.ts"), join(root, "src/worker.ts")],
	outdir: out,
	target: "browser",
	format: "esm",
	minify: true,
	naming: "[name].js",
});
if (!res.success) { for (const l of res.logs) console.error(l); process.exit(1); }
for (const f of ["index.html", "style.css"]) cpSync(join(root, f), join(out, f));
console.log("built:", res.outputs.map((o) => `${o.path.split("/").pop()} ${(o.size / 1024).toFixed(0)}KB`).join(", "));
