// 出手紀錄：驗證、資料表與查詢。
// 一筆紀錄 = 某一天、某台裝置、某個名字（sid）的累計數字；看成績時再依名字加總。

export const KINDS = ["alpaca", "persimmon", "marketer"] as const;
export type Kind = (typeof KINDS)[number];

export const LIMITS = {
	nameChars: 16,
	count: 1_000_000, // 一天一台裝置打一百萬下已經不可能，超過就當成亂送
	bins: 1440, // 一天最多 1440 分鐘
	bodyBytes: 64 * 1024,
	dayWindowMs: 2 * 24 * 60 * 60 * 1000, // 只收前後兩天內的日期（日期以玩家當地時間為準）
	rowsPerDay: 2000,
};

export type Play = {
	name: string;
	total: number;
	kos: number;
	maxCombo: number;
	bins: Record<string, number>;
	vic: Partial<Record<Kind, number>>;
};

export type PublicPlay = Play & { self: boolean };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SID_RE = /^[a-z0-9]{8,40}$/;
const HM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidSid(sid: string): boolean {
	return SID_RE.test(sid);
}

export function checkDay(day: string, now = Date.now()): Result<string> {
	const m = DAY_RE.exec(day);
	if (!m) return { ok: false, error: "day 格式要是 YYYY-MM-DD" };
	const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	const d = new Date(t);
	if (
		d.getUTCFullYear() !== Number(m[1]) ||
		d.getUTCMonth() !== Number(m[2]) - 1 ||
		d.getUTCDate() !== Number(m[3])
	) {
		return { ok: false, error: "day 不是合法日期" };
	}
	if (Math.abs(t - now) > LIMITS.dayWindowMs) return { ok: false, error: "day 離今天太遠" };
	return { ok: true, value: day };
}

const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= LIMITS.count;
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	Object.getPrototypeOf(v) === Object.prototype;

export function normalizeName(v: unknown): string | null {
	if (typeof v !== "string") return null;
	// 規則跟前端（src/client/main.js 的 normName）一致：去掉控制字元與看不見的格式字元、合併空白
	const name = v
		.replace(/[\p{Cc}\p{Cf}]/gu, "")
		.replace(/\s+/g, " ")
		.trim();
	const len = Array.from(name).length; // 以字（code point）計算，中文一個字算一個
	return len >= 1 && len <= LIMITS.nameChars ? name : null;
}

export function parsePlay(input: unknown): Result<Play> {
	if (!isPlainObject(input)) return { ok: false, error: "內容要是 JSON 物件" };
	const name = normalizeName(input.name);
	if (!name) return { ok: false, error: `名字要是 1 到 ${LIMITS.nameChars} 個字` };
	const { total, kos, maxCombo } = input;
	if (!isCount(total) || !isCount(kos) || !isCount(maxCombo))
		return { ok: false, error: "total、kos、maxCombo 要是非負整數" };
	if (kos > total || maxCombo > total) return { ok: false, error: "kos、maxCombo 不能大於 total" };

	const binsIn = input.bins ?? {};
	if (!isPlainObject(binsIn)) return { ok: false, error: "bins 要是物件" };
	const binKeys = Object.keys(binsIn);
	if (binKeys.length > LIMITS.bins) return { ok: false, error: "bins 太多格" };
	const bins: Record<string, number> = {};
	let binSum = 0;
	for (const k of binKeys) {
		const v = binsIn[k];
		if (!HM_RE.test(k) || !isCount(v))
			return { ok: false, error: `bins 的 ${k.slice(0, 8)} 不合法` };
		if (v > 0) bins[k] = v;
		binSum += v;
	}
	if (binSum > total) return { ok: false, error: "bins 加總不能大於 total" };

	const vicIn = input.vic ?? {};
	if (!isPlainObject(vicIn)) return { ok: false, error: "vic 要是物件" };
	const vic: Partial<Record<Kind, number>> = {};
	let vicSum = 0;
	for (const k of Object.keys(vicIn)) {
		const v = vicIn[k];
		if (!(KINDS as readonly string[]).includes(k) || !isCount(v))
			return { ok: false, error: `vic 的 ${k.slice(0, 12)} 不合法` };
		if (v > 0) vic[k as Kind] = v;
		vicSum += v;
	}
	if (vicSum > total) return { ok: false, error: "vic 加總不能大於 total" };

	return { ok: true, value: { name, total, kos, maxCombo, bins, vic } };
}

// ---------------- 資料庫 ----------------

// 資料表在第一次用到時自動建立（每個 Worker 實例只跑一次），部署時不必另外跑 migration。
const SCHEMA = `CREATE TABLE IF NOT EXISTS plays (
	day TEXT NOT NULL,
	sid TEXT NOT NULL,
	name TEXT NOT NULL,
	total INTEGER NOT NULL,
	kos INTEGER NOT NULL,
	max_combo INTEGER NOT NULL,
	bins TEXT NOT NULL,
	vic TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (day, sid)
) WITHOUT ROWID`;

const ready = new WeakMap<D1Database, Promise<unknown>>();
export function ensureSchema(db: D1Database): Promise<unknown> {
	let p = ready.get(db);
	if (!p) {
		p = db.prepare(SCHEMA).run();
		p.catch(() => ready.delete(db)); // 失敗就下次再試
		ready.set(db, p);
	}
	return p;
}

type Row = {
	sid: string;
	name: string;
	total: number;
	kos: number;
	max_combo: number;
	bins: string;
	vic: string;
};

const safeJson = (s: string): Record<string, number> => {
	try {
		const v: unknown = JSON.parse(s);
		return isPlainObject(v) ? (v as Record<string, number>) : {};
	} catch {
		return {};
	}
};

// 同一個 Worker 實例在 2 秒內的查詢共用結果：很多人同時開著排行榜時，D1 不必每次都讀
const CACHE_MS = 2000;
const dayCache = new Map<string, { at: number; rows: Promise<Row[]> }>();

function readDay(db: D1Database, day: string, now: number): Promise<Row[]> {
	const hit = dayCache.get(day);
	if (hit && now - hit.at < CACHE_MS) return hit.rows;
	const rows = ensureSchema(db).then(async () => {
		const { results } = await db
			.prepare(
				"SELECT sid, name, total, kos, max_combo, bins, vic FROM plays WHERE day = ?1 LIMIT ?2",
			)
			.bind(day, LIMITS.rowsPerDay)
			.all<Row>();
		return results;
	});
	rows.catch(() => dayCache.delete(day));
	dayCache.set(day, { at: now, rows });
	if (dayCache.size > 8) dayCache.delete(dayCache.keys().next().value as string);
	return rows;
}

export async function listDay(
	db: D1Database,
	day: string,
	viewerSid: string | null,
	now = Date.now(),
): Promise<PublicPlay[]> {
	const results = await readDay(db, day, now);
	// 不回傳 sid：sid 是寫入那一筆的唯一憑證
	return results.map((r) => ({
		name: r.name,
		total: r.total,
		kos: r.kos,
		maxCombo: r.max_combo,
		bins: safeJson(r.bins),
		vic: safeJson(r.vic),
		self: viewerSid !== null && r.sid === viewerSid,
	}));
}

// 寫入或更新一筆。total 只增不減：比較舊的請求晚到時不會把數字蓋回去。
export async function savePlay(
	db: D1Database,
	day: string,
	sid: string,
	p: Play,
	now = Date.now(),
): Promise<void> {
	await ensureSchema(db);
	await db
		.prepare(
			`INSERT INTO plays (day, sid, name, total, kos, max_combo, bins, vic, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			 ON CONFLICT (day, sid) DO UPDATE SET
			   name = excluded.name, total = excluded.total, kos = excluded.kos, max_combo = excluded.max_combo,
			   bins = excluded.bins, vic = excluded.vic, updated_at = excluded.updated_at
			 WHERE excluded.total >= plays.total`,
		)
		.bind(
			day,
			sid,
			p.name,
			p.total,
			p.kos,
			p.maxCombo,
			JSON.stringify(p.bins),
			JSON.stringify(p.vic),
			now,
		)
		.run();
	dayCache.delete(day);
}
