// Worker：只處理 /api/*，其他路徑由靜態檔（遊戲頁面）直接回應。
//
//   GET /api/days/:day/plays        今天所有人的紀錄（標頭 x-beatboss-sid 帶自己的 sid，會標出 self）
//   PUT /api/days/:day/plays/:sid   寫入或更新自己這台裝置的那一筆
import { env } from "cloudflare:workers";
import { LIMITS, checkDay, isValidSid, listDay, parsePlay, savePlay } from "./plays.ts";

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, error: string) => json({ error }, status);

const LIST_RE = /^\/api\/days\/([^/]+)\/plays$/;
const ONE_RE = /^\/api\/days\/([^/]+)\/plays\/([^/]+)$/;

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function readBody(req: Request): Promise<unknown> {
	const declared = Number(req.headers.get("content-length") || 0);
	if (declared > LIMITS.bodyBytes) throw new HttpError(413, "內容太大");
	const text = await req.text();
	if (new TextEncoder().encode(text).length > LIMITS.bodyBytes)
		throw new HttpError(413, "內容太大");
	try {
		return JSON.parse(text);
	} catch {
		throw new HttpError(400, "內容不是 JSON");
	}
}

async function handleApi(req: Request, url: URL): Promise<Response> {
	let m = LIST_RE.exec(url.pathname);
	if (m) {
		if (req.method !== "GET") return fail(405, "只支援 GET");
		const day = checkDay(m[1]);
		if (!day.ok) return fail(400, day.error);
		const sid = req.headers.get("x-beatboss-sid");
		const plays = await listDay(env.DB, day.value, sid && isValidSid(sid) ? sid : null);
		return json({ plays });
	}
	m = ONE_RE.exec(url.pathname);
	if (m) {
		if (req.method !== "PUT") return fail(405, "只支援 PUT");
		const day = checkDay(m[1]);
		if (!day.ok) return fail(400, day.error);
		if (!isValidSid(m[2])) return fail(400, "sid 格式不對");
		const play = parsePlay(await readBody(req));
		if (!play.ok) return fail(400, play.error);
		await savePlay(env.DB, day.value, m[2], play.value);
		return new Response(null, { status: 204 });
	}
	return fail(404, "沒有這個 API");
}

export default {
	async fetch(req) {
		const url = new URL(req.url);
		if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
		try {
			return await handleApi(req, url);
		} catch (e) {
			if (e instanceof HttpError) return fail(e.status, e.message);
			console.error("api error", e);
			return fail(500, "伺服器出錯了");
		}
	},
} satisfies ExportedHandler;
