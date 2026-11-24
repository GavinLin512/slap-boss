// 跟 Worker API 溝通的薄薄一層。所有請求都有逾時，失敗時丟出帶 status 的錯誤。
const TIMEOUT_MS = 8000;

async function request(path, { method = 'GET', body, sid, keepalive = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (sid) headers['x-beatboss-sid'] = sid;
    const init = { method, headers, signal: ctl.signal, keepalive };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try { message = (await res.json()).error || message; } catch {}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // 今天所有人的紀錄；帶上自己的 sid，伺服器會把自己那筆標成 self（不會回傳任何人的 sid）
  async listDay(day, sid) {
    const data = await request(`/api/days/${day}/plays`, { sid });
    return Array.isArray(data && data.plays) ? data.plays : [];
  },
  save(day, sid, play, leaving = false) {
    return request(`/api/days/${day}/plays/${sid}`, { method: 'PUT', body: play, keepalive: leaving });
  },
};
