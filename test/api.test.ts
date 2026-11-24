import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vite-plus/test";

const pad = (n: number) => String(n).padStart(2, "0");
const today = (() => {
	const t = new Date();
	return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
})();
let seq = 0;
const newSid = () => `testsid${Date.now().toString(36)}${(seq++).toString(36)}`;

const put = (sid: string, body: unknown, day = today) =>
	SELF.fetch(`https://beatboss.test/api/days/${day}/plays/${sid}`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
const list = async (sid?: string, day = today) => {
	const res = await SELF.fetch(`https://beatboss.test/api/days/${day}/plays`, {
		headers: sid ? { "x-beatboss-sid": sid } : {},
	});
	return {
		res,
		plays: res.ok ? ((await res.json()) as { plays: Record<string, unknown>[] }).plays : [],
	};
};

const play = (over: Record<string, unknown> = {}) => ({
	name: "小明",
	total: 12,
	kos: 1,
	maxCombo: 8,
	bins: { "09:10": 5, "09:11": 7 },
	vic: { alpaca: 10, persimmon: 2 },
	...over,
});

describe("PUT 然後 GET", () => {
	it("存進去的紀錄讀得回來，自己那筆標 self，且不回傳任何 sid", async () => {
		const day = today;
		const mine = newSid();
		const other = newSid();
		expect((await put(mine, play({ name: "甲方" }), day)).status).toBe(204);
		expect(
			(
				await put(
					other,
					play({ name: "乙方", total: 3, kos: 0, maxCombo: 3, bins: { "10:00": 3 }, vic: {} }),
					day,
				)
			).status,
		).toBe(204);

		const { res, plays } = await list(mine, day);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const a = plays.find((p) => p.name === "甲方");
		const b = plays.find((p) => p.name === "乙方");
		expect(a).toMatchObject({
			total: 12,
			kos: 1,
			maxCombo: 8,
			bins: { "09:10": 5, "09:11": 7 },
			vic: { alpaca: 10, persimmon: 2 },
			self: true,
		});
		expect(b).toMatchObject({ total: 3, self: false });
		expect(JSON.stringify(plays)).not.toContain(mine);
		expect(JSON.stringify(plays)).not.toContain(other);
	});

	it("沒帶 sid 時沒有任何一筆是 self", async () => {
		const sid = newSid();
		await put(sid, play({ name: "路人" }));
		const { plays } = await list();
		expect(plays.length).toBeGreaterThan(0);
		expect(plays.every((p) => p.self === false)).toBe(true);
	});

	it("比較舊的寫入晚到時，total 不會變少", async () => {
		const sid = newSid();
		await put(
			sid,
			play({
				name: "拉鋸",
				total: 50,
				kos: 2,
				maxCombo: 20,
				bins: { "11:00": 50 },
				vic: { marketer: 50 },
			}),
		);
		expect(
			(
				await put(
					sid,
					play({ name: "拉鋸", total: 10, kos: 0, maxCombo: 5, bins: { "11:00": 10 }, vic: {} }),
				)
			).status,
		).toBe(204);
		const { plays } = await list(sid);
		expect(plays.find((p) => p.self)).toMatchObject({ total: 50, kos: 2 });
	});

	it("名字前後空白會去掉、中間空白會合併", async () => {
		const sid = newSid();
		await put(sid, play({ name: "  阿   華  " }));
		const { plays } = await list(sid);
		expect(plays.find((p) => p.self)?.name).toBe("阿 華");
	});

	it("名字裡看不見的字元（例如 emoji 的連接符）會被去掉，不會整筆拒收", async () => {
		const sid = newSid();
		const res = await put(sid, play({ name: "工程師\u{1F469}‍\u{1F4BB}\u0007" }));
		expect(res.status).toBe(204);
		const { plays } = await list(sid);
		expect(plays.find((p) => p.self)?.name).toBe("工程師\u{1F469}\u{1F4BB}");
	});

	it("16 個字的名字（含 emoji）可以存", async () => {
		const sid = newSid();
		const name = "一二三四五六七八九十一二三四五\u{1F44B}";
		expect(Array.from(name).length).toBe(16);
		expect((await put(sid, play({ name }))).status).toBe(204);
	});
});

describe("拒收不合法的資料", () => {
	const bad: [string, unknown][] = [
		["空名字", play({ name: "   " })],
		["名字太長", play({ name: "一二三四五六七八九十一二三四五六七" })],
		["名字只有看不見的字元", play({ name: "​‍\u0000" })],
		["名字不是字串", play({ name: 123 })],
		["total 是負數", play({ total: -1 })],
		["total 不是整數", play({ total: 1.5 })],
		["total 太大", play({ total: 1_000_001 })],
		["kos 大於 total", play({ kos: 99 })],
		["bins 的時間格式不對", play({ bins: { "9:10": 1 } })],
		["bins 的值是字串", play({ bins: { "09:10": "5" } })],
		["bins 加總大於 total", play({ bins: { "09:10": 13 } })],
		["vic 有不存在的角色", play({ vic: { ceo: 1 } })],
		["vic 是陣列", play({ vic: [1, 2] })],
		["內容是陣列", [1, 2, 3]],
		["內容不是 JSON", "not json"],
	];
	for (const [label, body] of bad) {
		it(label, async () => {
			const res = await put(newSid(), body);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toBeTruthy();
		});
	}

	it("sid 格式不對", async () => {
		expect((await put("BAD!", play())).status).toBe(400);
	});

	it("日期離今天太遠", async () => {
		expect((await put(newSid(), play(), "2020-01-01")).status).toBe(400);
		expect((await list(undefined, "2020-01-01")).res.status).toBe(400);
	});

	it("日期不存在", async () => {
		expect((await list(undefined, "2026-02-30")).res.status).toBe(400);
	});

	it("內容太大", async () => {
		const res = await put(newSid(), JSON.stringify({ ...play(), pad: "x".repeat(70 * 1024) }));
		expect(res.status).toBe(413);
	});
});

describe("其他路徑", () => {
	it("不存在的 API 回 404", async () => {
		expect((await SELF.fetch("https://beatboss.test/api/nope")).status).toBe(404);
	});
	it("用錯方法回 405", async () => {
		expect(
			(await SELF.fetch(`https://beatboss.test/api/days/${today}/plays`, { method: "POST" }))
				.status,
		).toBe(405);
	});
});
