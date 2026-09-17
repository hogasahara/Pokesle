import { run, type Input } from "./calc";
self.onmessage = (e: MessageEvent<Input>) => {
	try {
		const res = run(e.data, (done, total) => {
			if (done % 500 === 0 || done === total) (self as unknown as Worker).postMessage({ type: "progress", done, total });
		});
		(self as unknown as Worker).postMessage({ type: "done", ...res });
	} catch (err) {
		(self as unknown as Worker).postMessage({ type: "error", message: String(err) });
	}
};
