import { build } from './sprites.js';
import { api } from './api.js';

// ================= 畫布 =================
const LW = 360, LH = 640;
const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const helpEl = document.getElementById('help');
let K = 1;
function resize() {
  const wrap = document.getElementById('wrap');
  const s = Math.min(Math.min(wrap.clientWidth, 520) / LW, (wrap.clientHeight - 8) / LH);
  cv.style.width = LW * s + 'px';
  cv.style.height = LH * s + 'px';
  K = s * (devicePixelRatio || 1);
  cv.width = Math.round(LW * K);
  cv.height = Math.round(LH * K);
}
addEventListener('resize', resize);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;

// ================= 精靈圖 =================
const cache = new Map();
function toCanvas(g) {
  const c = document.createElement('canvas');
  c.width = g.w;
  c.height = g.h;
  c.getContext('2d').putImageData(new ImageData(g.toRGBA(), g.w, g.h), 0, 0);
  return c;
}
function spr(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  let c = cache.get(key);
  if (!c) { c = toCanvas(build(kind, opts)); cache.set(key, c); }
  return c;
}
function drawImg(img, x, y, scale = 3, rot = 0, alpha = 1, flip = false) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
  ctx.restore();
}
// ================= 音效 =================
const Sound = {
  on: true,
  ctx: null,
  nb: null,
  unlock() {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.5;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* 沒有音效也能玩 */ }
  },
  tone(type, f0, f1, dur, vol = 0.12, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.15, freq = 1200, type = 'bandpass', delay = 0) {
    const c = this.ctx;
    if (!this.nb) {
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nb = b;
    }
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.nb;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  },
  play(name, p = 1) {
    if (!this.on || !this.ctx || this.ctx.state === 'closed') return;
    switch (name) {
      case 'slap': this.noise(0.07, 0.45, 2600 * p, 'highpass'); this.tone('triangle', 220 * p, 70, 0.1, 0.28); break;
      case 'bonk': this.tone('triangle', 300 * p, 80, 0.15, 0.32); this.noise(0.06, 0.25, 1500 * p); break;
      case 'punch': this.tone('sine', 150 * p, 45, 0.18, 0.5); this.noise(0.09, 0.4, 900 * p, 'lowpass'); break;
      case 'ko': this.noise(0.6, 0.45, 500, 'lowpass'); this.tone('sine', 140, 35, 0.5, 0.45); this.tone('square', 880, 1760, 0.25, 0.05, 0.1); break;
      case 'pop': this.tone('sine', 300 * p, 900 * p, 0.08, 0.1); break;
      case 'whoosh': this.noise(0.18, 0.15, 900); break;
      case 'blip': this.tone('square', 200 * p, 200 * p, 0.03, 0.025); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.06, i * 0.1)); break;
      default: break;
    }
  },
};
const sndBtn = document.getElementById('snd');
try { Sound.on = localStorage.getItem('beatboss-snd') !== '0'; } catch {}
const sndLabel = () => { sndBtn.textContent = '音效 ' + (Sound.on ? '開' : '關'); };
sndLabel();
sndBtn.addEventListener('click', () => {
  Sound.on = !Sound.on;
  sndLabel();
  Sound.unlock();
  sndBtn.blur();
  try { localStorage.setItem('beatboss-snd', Sound.on ? '1' : '0'); } catch {}
});

// ================= 今日成績：以名字為準，每台裝置寫自己那一筆，看的時候再加總 =================
const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`; };
const hmStr = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// 名字規則跟伺服器（src/worker/plays.ts 的 normalizeName）一致：去掉控制與格式字元、合併空白、最多 16 個字
const normName = (v) => (typeof v === 'string' ? Array.from(v.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('').trim() : '');
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const newSid = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const Stats = {
  day: todayStr(),
  name: '',
  sid: '', // 這台裝置今天、這個名字的紀錄編號；也是寫入憑證，不會出現在伺服器的回應裡
  mine: null,
  others: { total: 0, kos: 0, maxCombo: 0, bins: {} },
  dirty: false,
  writing: false,
  synced: false,
  init() {
    setInterval(() => void this.flush(), 4000);
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.flush(true); });
    addEventListener('pagehide', () => void this.flush(true));
  },
  needName() { return !ls.get('beatboss-name') || ls.get('beatboss-name-day') !== this.day; },
  blank() { return { name: this.name, total: 0, kos: 0, maxCombo: 0, bins: {}, vic: {} }; },
  copy(d) { return { ...this.blank(), name: this.name, total: d.total || 0, kos: d.kos || 0, maxCombo: d.maxCombo || 0, bins: { ...d.bins }, vic: { ...d.vic } }; },
  localKey() { return `beatboss-plays-${this.day}`; },
  localAll() { try { return JSON.parse(ls.get(this.localKey()) || '{}') || {}; } catch { return {}; } },
  saveLocal() { const all = this.localAll(); all[this.sid] = this.mine; ls.set(this.localKey(), JSON.stringify(all)); },
  // 連不到伺服器時，用這台裝置自己存的紀錄
  localDocs() { return Object.entries(this.localAll()).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ ...v, self: id === this.sid })); },
  async begin(name) {
    Board.reset();
    this.name = name;
    ls.set('beatboss-name', name);
    ls.set('beatboss-name-day', this.day);
    const sk = `beatboss-sid-${this.day}-${name}`;
    this.sid = ls.get(sk) || newSid();
    ls.set(sk, this.sid);
    const local = this.localAll()[this.sid];
    this.mine = local && local.name === name ? this.copy(local) : this.blank();
    this.others = { total: 0, kos: 0, maxCombo: 0, bins: {} };
    await this.refresh(true);
    if (name === this.name) Board.rebase();
  },
  // 讀今天所有人的紀錄，挑出這個名字在其他裝置的部分；自己這台用記憶體裡最新的
  async refresh(adoptOwn = false) {
    const name = this.name, sid = this.sid;
    let docs = null;
    try {
      docs = await api.listDay(this.day, sid);
      this.synced = true;
    } catch {
      this.synced = false;
    }
    if (name !== this.name) return;
    if (docs) { Board.docs = docs; Board.live = true; }
    this.absorb(docs || this.localDocs(), adoptOwn);
  },
  absorb(docs, adoptOwn = false) {
    if (!this.mine) return;
    const o = { total: 0, kos: 0, maxCombo: 0, bins: {} };
    for (const d of docs) {
      if (!d || d.name !== this.name) continue;
      if (d.self) {
        // 換了瀏覽器資料或清過快取時，接回伺服器上比較多的那份
        if (adoptOwn && (d.total || 0) > this.mine.total) this.mine = this.copy(d);
        continue;
      }
      o.total += d.total || 0;
      o.kos += d.kos || 0;
      o.maxCombo = Math.max(o.maxCombo, d.maxCombo || 0);
      for (const [k, v] of Object.entries(d.bins || {})) o.bins[k] = (o.bins[k] || 0) + (Number(v) || 0);
    }
    this.others = o;
  },
  touch() { this.dirty = true; },
  hit(k = 1, kind) {
    if (!this.mine) return;
    const key = hmStr();
    this.mine.total += k;
    this.mine.bins[key] = (this.mine.bins[key] || 0) + k;
    if (kind) this.mine.vic[kind] = (this.mine.vic[kind] || 0) + k;
    this.touch();
    try { Board.onHit(); } catch {} // 排行榜出錯也不能影響打人
  },
  ko() { if (this.mine) { this.mine.kos++; this.touch(); } },
  combo(n) { if (this.mine && n > this.mine.maxCombo) { this.mine.maxCombo = n; this.touch(); } },
  total() { return (this.mine ? this.mine.total : 0) + this.others.total; },
  merged() {
    const m = this.mine || this.blank();
    const bins = { ...this.others.bins };
    for (const [k, v] of Object.entries(m.bins)) bins[k] = (bins[k] || 0) + v;
    return { total: m.total + this.others.total, kos: m.kos + this.others.kos, maxCombo: Math.max(m.maxCombo, this.others.maxCombo), bins };
  },
  // 只在有新紀錄時寫，一次只寫一筆；離開頁面時用 keepalive 讓請求送得出去
  async flush(leaving = false) {
    if (!this.mine || !this.dirty || this.writing) return;
    this.writing = true;
    this.dirty = false;
    const m = this.mine;
    const body = { name: m.name, total: m.total, kos: m.kos, maxCombo: m.maxCombo, bins: { ...m.bins }, vic: { ...m.vic } };
    this.saveLocal();
    try {
      await api.save(this.day, this.sid, body, leaving);
    } catch (e) {
      // 4xx 是資料被伺服器拒收，重送也一樣；其他錯誤（斷線、5xx）下次再送
      if (!(e && e.status >= 400 && e.status < 500)) this.dirty = true;
      else console.warn('紀錄被伺服器拒收', e.status, e.message);
    }
    this.writing = false;
  },
};
// 舊程式用的計數介面，接到今日成績
const Count = { add: (k = 1, kind) => Stats.hit(k, kind), get n() { return Stats.total(); } };
Stats.init();

// ================= 特效 =================
let floats = [], parts = [], glyphs = [], swings = [];
let shakeT = 0, shakeA = 0, flashT = 0, flashC = '#fff', freeze = 0;
function floatText(text, x, y, color = '#fff', size = 18) { floats.push({ text, x, y, t: 0, color, size }); }
function shake(a, t) { shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, t); }
function flash(c, t = 0.2) { flashC = c; flashT = t; }
function burst(img, x, y, n, { scale = 2, sp = 200, up = 260, life = [0.4, 0.8], grav = 700 } = {}) {
  for (let i = 0; i < n; i++) {
    parts.push({ img, x, y, vx: rand(-sp, sp), vy: rand(-up, -up * 0.2), r: rand(0, 6), vr: rand(-9, 9), t: 0, life: rand(...life), scale, grav });
  }
}
// 被打斷的話：一個字一個字噴出去
function glyphBurst(s, x, y, dir = 0) {
  const chars = [...s].filter((c) => c.trim()).slice(-12);
  chars.forEach((ch, i) => {
    glyphs.push({ ch, x: x + (i - chars.length / 2) * 13, y, vx: dir * rand(160, 360) + rand(-130, 130), vy: rand(-420, -160), r: 0, vr: rand(-10, 10), t: 0, life: rand(0.7, 1.1) });
  });
}
function swing(img, x0, y0, x1, y1, r0, r1, scale, life, flip = false) {
  swings.push({ img, x0, y0, x1, y1, r0, r1, scale, life, t: 0, flip });
}
function updateFx(dt) {
  floats.forEach((f) => (f.t += dt));
  floats = floats.filter((f) => f.t < 1.1);
  parts.forEach((p) => { p.t += dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; });
  parts = parts.filter((p) => p.t < p.life);
  glyphs.forEach((g) => { g.t += dt; g.vy += 800 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.r += g.vr * dt; });
  glyphs = glyphs.filter((g) => g.t < g.life);
  swings.forEach((s) => (s.t += dt));
  swings = swings.filter((s) => s.t < s.life + 0.06);
  shakeT -= dt;
  if (shakeT <= 0) shakeA = 0;
  flashT -= dt;
}
function drawFx() {
  parts.forEach((p) => drawImg(p.img, p.x, p.y, p.scale, p.r, 1 - p.t / p.life));
  glyphs.forEach((g) => {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.r);
    outlined(g.ch, 0, 0, 20, '#fffbe8', 1 - g.t / g.life);
    ctx.restore();
  });
  swings.forEach((s) => {
    const u = Math.min(1, s.t / s.life);
    const e = 1 - (1 - u) * (1 - u);
    drawImg(s.img, lerp(s.x0, s.x1, e), lerp(s.y0, s.y1, e), s.scale, lerp(s.r0, s.r1, e), s.t > s.life ? 1 - (s.t - s.life) / 0.06 : 1, s.flip);
  });
  floats.forEach((f) => {
    const a = f.t < 0.7 ? 1 : 1 - (f.t - 0.7) / 0.4;
    outlined(f.text, f.x, f.y - f.t * 40, f.size, f.color, a);
  });
}
function outlined(s, x, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e1a24';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function txt(s, x, y, { size = 14, color = '#f3eee6', align = 'center', bold = false, base = 'middle', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function wrapText(s, maxW) {
  const out = [];
  let cur = '';
  for (const ch of s) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function bubble(x, yb, s, st = {}) {
  ctx.save();
  const size = st.size || 15;
  ctx.font = `${st.bold ? '700 ' : ''}${size}px ${FONT}`;
  const lines = wrapText(s || ' ', st.maxW || 170);
  const lh = size * 1.3;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
  const h = lines.length * lh + 12;
  const bx = clamp(x - w / 2, 6, LW - 6 - w);
  const by = yb - h - 10;
  const tx = clamp(x, bx + 14, bx + w - 14);
  ctx.fillStyle = st.bg || '#fffbe8';
  ctx.strokeStyle = st.border || '#3b2340';
  ctx.lineWidth = 2;
  rrect(bx, by, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx - 7, by + h - 1);
  ctx.lineTo(tx, by + h + 9);
  ctx.lineTo(tx + 7, by + h - 1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx - 7, by + h);
  ctx.lineTo(tx, by + h + 9);
  ctx.lineTo(tx + 7, by + h);
  ctx.stroke();
  ctx.fillStyle = st.fg || '#2a1830';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 6 + i * lh));
  ctx.restore();
}

// ================= 角色：台詞、受傷、講話 =================
const NAME = { alpaca: '羊駝', persimmon: '柿子', marketer: '清朝人' };
const TOP = { alpaca: 0, persimmon: 4, marketer: 0 };
const CPS = { alpaca: 0.07, persimmon: 0.1, marketer: 0.045 };
const LINES = {
  alpaca: {
    idle: ['這個很簡單吧？', '明天早上給我', '我沒有要聽你的理由', '這個我們再討論一下', '我們要做全球市場', '我只是提個想法', '週末弄一下就好'],
    hit: ['你知道我是誰嗎？', '小心你的績效考核！', '你是哪個部門的？', '我的毛！很貴的！'],
    rocket: ['等一下啊啊啊——', '我要飛去全球市場了——'],
  },
  persimmon: {
    idle: ['痾...你...有試過重開機嗎？', '這個喔...我...覺得', '這個...權限好像...不能開', '系統...沒問題，就是...是你的問題', '工單呢？', '這邊沒有收到你的工單'],
    hit: ['恩...喔....', '你被列入...黑名單了', 'IP 我記下了', '錯誤代碼 0x柿餅'],
    rocket: ['系統…過載…啊——', '這…不在…SOP裡——'],
  },
  marketer: {
    idle: ['這個要更有感', '不夠 wow', '這個我用AI就可以做了，很簡單的', '要有記憶點', '這個 KPI 很簡單', '注意你的品牌調性'],
    rant: ['然後我跟你說…', '這個我們之前就講過了', '重點是…', '我再補充一點', '等一下，我還沒講完', '所以說呢…', '你先聽我說完', '還有一件事'],
    hit: ['我的形象！', '這不在提案裡', '髮型就是品牌形象'],
    rocket: ['這聲量也太大了吧——', '我的髮型啊啊——'],
  },
};
function pickLine(kind) {
  const L = LINES[kind];
  return kind === 'marketer' && Math.random() < 0.5 ? pick(L.rant) : pick(L.idle);
}
function makeFoe(kind, x, y, scale, hp) {
  return { kind, x, y, scale, hp, maxHp: hp, rot: 0, rv: 0, ox: 0, ov: 0, face: 'normal', faceT: 0, talk: null, talkWait: rand(0.1, 0.5), hits: 0 };
}
// 受傷程度 d（0~1）→ 精靈圖狀態；全部量化，快取不會無限長
function foeSprite(f, now, d) {
  const o = { face: f.faceT > 0 ? f.face : d >= 0.75 ? 'dizzy' : 'normal' };
  const sw = Math.min(3, Math.floor(d * 4));
  if (sw) o.swell = sw;
  if (f.kind === 'alpaca') { const w = 4 - Math.min(4, Math.floor(d * 5)); if (w !== 4) o.wool = w; }
  if (f.kind === 'marketer') {
    const m = Math.min(3, Math.floor(d * 4));
    if (m) o.mess = m;
    if (d >= 0.5) o.nohat = true;
    if (f.talk && f.talk.ci < f.talk.text.length && Math.floor(now / 110) % 2) o.talk = true;
  }
  return spr(f.kind, o);
}
function dmgFx(kind, d0, d1, x, y, scale = 3) {
  if (kind === 'alpaca' && Math.floor(d0 * 5) < Math.floor(d1 * 5)) {
    burst(spr('woolPuff'), x, y, 6, { scale, up: 320, sp: 240, life: [0.7, 1.2], grav: 500 });
    floatText('我的毛！', x, y - 30, '#ffd84a', 16);
  }
  if (kind === 'marketer' && d0 < 0.5 && d1 >= 0.5) {
    parts.push({ img: spr('qingHat'), x, y: y - 10, vx: rand(-140, 140), vy: -560, r: 0, vr: rand(-9, 9), t: 0, life: 1.4, scale, grav: 900 });
    floatText('我的形象！', x, y - 30, '#ff6b6b', 16);
  }
  if (kind === 'persimmon' && d0 < 0.75 && d1 >= 0.75) floatText('藍屏了…', x, y - 30, '#9ec8ff', 16);
}
const headTop = (f) => f.y - 16 * f.scale + TOP[f.kind] * f.scale;
function updateFoe(f, dt) {
  f.faceT -= dt;
  f.rv += (-f.rot * 90 - f.rv * 9) * dt;
  f.rot += f.rv * dt;
  f.ov += (-f.ox * 120 - f.ov * 10) * dt;
  f.ox += f.ov * dt;
}
function newTalk(f, text) { f.talk = { text, ci: 0, t: 0, hold: 0 }; }
function shout(f, text) { f.talk = { text, ci: text.length, t: 0, hold: 0.2 }; }
function tickTalk(f, dt, blip = false) {
  if (!f.talk) {
    f.talkWait -= dt;
    if (f.talkWait <= 0) newTalk(f, pickLine(f.kind));
    return;
  }
  const tk = f.talk;
  if (tk.ci < tk.text.length) {
    tk.t += dt;
    while (tk.t >= CPS[f.kind] && tk.ci < tk.text.length) {
      tk.t -= CPS[f.kind];
      tk.ci++;
      if (blip && tk.ci % 2) Sound.play('blip', { alpaca: 0.9, persimmon: 1.3, marketer: 1.7 }[f.kind]);
    }
  } else {
    tk.hold += dt;
    if (tk.hold > 1.2) { f.talk = null; f.talkWait = rand(0.2, 0.6); }
  }
}
const talkText = (f) => (f.talk ? f.talk.text.slice(0, f.talk.ci) : '');
function cutTalk(f, x, y, dir) {
  if (!f.talk) return;
  glyphBurst(talkText(f), x, y, dir);
  f.talk = null;
  f.talkWait = rand(0.5, 0.9);
}
function drawWall(h) {
  ctx.fillStyle = '#2f2839';
  ctx.fillRect(0, 0, LW, LH);
  ctx.fillStyle = '#3d3449';
  ctx.fillRect(0, 0, LW, h);
  ctx.fillStyle = '#4b5d7a';
  ctx.fillRect(252, 46, 88, 58);
  ctx.strokeStyle = '#2a2333';
  ctx.lineWidth = 3;
  ctx.strokeRect(252, 46, 88, 58);
  ctx.beginPath(); ctx.moveTo(296, 46); ctx.lineTo(296, 104); ctx.stroke();
}
function hud(extra) {
  txt(`今日出手 ${Count.n}`, 16, 22, { align: 'left', size: 14, bold: true, color: '#ffd84a' });
  const rk = Board.rank();
  if (rk) txt(`全公司第 ${rk} 名`, 16, 39, { align: 'left', size: 12, color: rk === 1 ? '#ffd84a' : '#cfc8dc' });
  if (extra) txt(extra, 344, 22, { align: 'right', size: 13, color: '#bbb' });
}

// ================= D：來回巴掌 =================
const D = {
  help: '點畫面，或大拇指左右來回滑 = 一直甩巴掌。打倒換下一個。',
  ORDER: ['alpaca', 'persimmon', 'marketer'],
  init() {
    this.idx = 0;
    this.round = 0;
    this.combo = 0;
    this.comboT = 0;
    this.side = 1;
    this.drag = null;
    this.out = null;
    this.nextT = 0;
    this.lastSlap = 0;
    this.spawn();
  },
  spawn() {
    const kind = this.ORDER[this.idx % 3];
    const f = makeFoe(kind, 180, 372, 7, 24 + this.round * 8);
    f.ox = 280;
    this.f = f;
    newTalk(f, pickLine(kind));
  },
  slap(side) {
    const now = performance.now();
    if (now - this.lastSlap < 55) return;
    this.lastSlap = now;
    const f = this.f;
    const cy = f ? f.y - 20 : 340;
    swing(spr('hand'), 180 - side * 170, cy - 30, 180 + side * 20, cy, -side * 0.7, side * 0.2, 6, 0.1, side < 0);
    if (!f) {
      // 換人空檔：空揮不計數，但連打不斷
      Sound.play('whoosh');
      if (this.comboT > 0) this.comboT = 0.9;
      return;
    }
    this.combo++;
    this.comboT = 0.9;
    Count.add(1, f.kind);
    Stats.combo(this.combo);
    Sound.play('slap', rand(0.85, 1.15) + Math.min(this.combo, 30) * 0.012);
    f.rv += side * 7;
    f.ov += side * 280;
    f.face = 'ouch';
    f.faceT = 0.3;
    const d0 = 1 - f.hp / f.maxHp;
    f.hp -= this.combo >= 15 ? 2 : 1;
    const d1 = clamp(1 - f.hp / f.maxHp, 0, 1);
    cutTalk(f, f.x, headTop(f) - 20, side);
    burst(spr('star'), f.x + side * 60, f.y - 30, 3, { scale: 3 });
    shake(2 + Math.min(this.combo, 12) * 0.35, 0.09);
    floatText(pick(['啪', '啪！', '啪啪']), f.x + rand(-80, 80), f.y - rand(50, 120), '#fff', 20 + Math.min(this.combo, 20));
    f.hits++;
    if (f.hits % 7 === 0) shout(f, pick(LINES[f.kind].hit));
    dmgFx(f.kind, d0, d1, f.x, f.y - 60, 5);
    if (f.hp <= 0) this.ko(side);
  },
  ko(side) {
    const f = this.f;
    freeze = 0.13;
    Stats.ko();
    flash('#fff', 0.15);
    shake(14, 0.45);
    Sound.play('ko');
    floatText('KO！', 180, 220, '#ffd84a', 56);
    this.out = { f, dx: 0, dy: 0, vx: side * 520, vy: -950, r: 0, vr: side * 14, t: 0, line: pick(LINES[f.kind].rocket) };
    this.f = null;
    this.idx++;
    if (this.idx % 3 === 0) this.round++;
    this.nextT = 0.35;
  },
  update(dt) {
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.f) { updateFoe(this.f, dt); tickTalk(this.f, dt, true); }
    if (this.out) {
      const o = this.out;
      o.t += dt; o.vy += 900 * dt; o.dx += o.vx * dt; o.dy += o.vy * dt; o.r += o.vr * dt;
      if (o.t > 1.6) this.out = null;
    }
    if (!this.f) { this.nextT -= dt; if (this.nextT <= 0) this.spawn(); }
  },
  down(x, y, isKey) {
    if (isKey) { this.side = -this.side; this.slap(this.side); return; }
    const side = x < 180 ? 1 : -1;
    this.side = side;
    this.slap(side);
    this.drag = { lx: x, acc: 0 };
  },
  move(x) {
    const d = this.drag;
    if (!d) return;
    d.acc += x - d.lx;
    d.lx = x;
    if (Math.abs(d.acc) > 30) { this.slap(Math.sign(d.acc)); d.acc = 0; }
  },
  up() { this.drag = null; },
  key(code) {
    if (code === 'ArrowLeft') this.slap(-1);
    else if (code === 'ArrowRight') this.slap(1);
    else this.down(null, null, true);
  },
  draw(now) {
    drawWall(500);
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(20, 46, 116, 54);
    txt('Q4：全球市場', 78, 64, { size: 12, color: '#a32a3a', bold: true });
    txt('預算：—', 78, 84, { size: 11, color: '#555' });
    if (this.out) {
      const o = this.out;
      drawImg(foeSprite(o.f, now, 1), 180 + o.dx, 372 + o.dy, 7 * Math.max(0.3, 1 - o.t * 0.45), o.r);
      outlined(o.line, clamp(180 + o.dx * 0.5, 90, 270), 300 + o.dy * 0.4, 17, '#fff', 1 - o.t / 1.6);
    }
    const f = this.f;
    if (f) {
      const d = clamp(1 - f.hp / f.maxHp, 0, 1);
      drawImg(foeSprite(f, now, d), f.x + f.ox, f.y, f.scale, f.rot);
      const s = talkText(f);
      if (s) bubble(f.x + f.ox * 0.3, headTop(f) - 4, s, { size: 17, maxW: 230 });
      txt(NAME[f.kind], 180, 124, { size: 14, bold: true });
      ctx.fillStyle = '#1e1a24';
      rrect(40, 136, 280, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#e04848';
      rrect(40, 136, Math.max(0, (280 * f.hp) / f.maxHp), 14, 7);
      ctx.fill();
    } else txt('下一位…', 180, 140, { size: 14, color: '#bbb' });
    hud(`第 ${this.round + 1} 輪`);
    if (this.combo >= 3) outlined(`${this.combo} 連打`, 180, 548, 24 + Math.min(this.combo, 30) * 0.6, this.combo >= 15 ? '#ff6b6b' : '#ffd84a');
    txt('點，或左右來回滑', 180, 612, { size: 12, color: '#888' });
  },
};

// ================= 切換、輸入、主迴圈 =================
const mode = D;
function startGame() {
  mode.init();
  helpEl.textContent = mode.help;
  resize();
}

function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * LW, y: ((e.clientY - r.top) / r.height) * LH };
}
let activePtr = null;
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Sound.unlock();
  if (activePtr !== null) return;
  activePtr = e.pointerId;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = toLogical(e);
  mode.down?.(p.x, p.y, false);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePtr) return;
  const p = toLogical(e);
  mode.move?.(p.x, p.y);
});
function endPtr(e) {
  Sound.unlock(); // 手機觸控要在放開時才算使用者手勢
  if (e.pointerId !== activePtr) return;
  activePtr = null;
  const p = toLogical(e);
  mode.up?.(p.x, p.y, e.type === 'pointercancel');
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('lostpointercapture', endPtr);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (document.querySelector('.ov:not([hidden])')) return; // 面板開著時不打
  if (e.code !== 'Space' && !e.code.startsWith('Arrow')) return;
  e.preventDefault();
  Sound.unlock();
  if (e.repeat) return;
  mode.key?.(e.code);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (freeze > 0) freeze -= dt;
  else {
    mode.update(dt, now);
    updateFx(dt);
  }
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2f2839';
  ctx.fillRect(0, 0, LW, LH);
  if (shakeT > 0) ctx.translate(rand(-shakeA, shakeA), rand(-shakeA, shakeA));
  mode.draw(now);
  drawFx();
  drawToast(dt);
  if (flashT > 0) {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.globalAlpha = Math.min(1, flashT * 3);
    ctx.fillStyle = flashC;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}

// ================= 名字與今日成績面板 =================
const $ = (id) => document.getElementById(id);
const nameBox = $('nameBox'), nameIn = $('nameIn'), statBox = $('statBox');
function askName() {
  nameIn.value = ls.get('beatboss-name') || '';
  nameBox.hidden = false;
  setTimeout(() => nameIn.focus(), 60);
}
$('nameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = normName(nameIn.value);
  if (!n) { nameIn.focus(); return; }
  nameIn.blur();
  nameBox.hidden = true;
  await Stats.flush();
  await Stats.begin(n);
});
$('rename').addEventListener('click', () => { statBox.hidden = true; askName(); });
$('stClose').addEventListener('click', () => { statBox.hidden = true; });
statBox.addEventListener('click', (e) => { if (e.target === statBox) statBox.hidden = true; });
$('stats').addEventListener('click', (e) => { e.currentTarget.blur(); void openStats(); });

async function openStats() {
  statBox.hidden = false;
  $('stName').textContent = Stats.name ? `${Stats.name} 的今日成績` : '今日成績';
  renderStats();
  $('stNote').textContent = '讀取中…';
  await Stats.flush();
  await Stats.refresh();
  renderStats();
  $('stNote').textContent = Stats.synced ? '已合併這個名字今天在所有裝置的紀錄。' : '連不到伺服器，先顯示這台裝置的紀錄。';
}

const toMin = (k) => Number(k.slice(0, 2)) * 60 + Number(k.slice(3, 5));
const fmtMin = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
// 依時間跨度自動決定一格幾分鐘，最多 24 格
function bucketize(bins) {
  const keys = Object.keys(bins).filter((k) => /^\d\d:\d\d$/.test(k) && bins[k] > 0).sort();
  if (!keys.length) return null;
  const first = toMin(keys[0]), last = toMin(keys[keys.length - 1]);
  const size = [1, 5, 10, 15, 30, 60, 120].find((s) => Math.floor(last / s) - Math.floor(first / s) + 1 <= 24) || 120;
  const start = Math.floor(first / size) * size;
  const n = Math.floor(last / size) - Math.floor(first / size) + 1;
  const bars = Array.from({ length: n }, (_, i) => ({ t: start + i * size, v: 0 }));
  for (const k of keys) bars[Math.floor((toMin(k) - start) / size)].v += bins[k];
  return { bars, size };
}
function niceStep(max) {
  const raw = Math.max(1, max / 4);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
function renderStats() {
  const m = Stats.merged();
  $('stTotal').textContent = m.total;
  $('stKo').textContent = m.kos;
  $('stCombo').textContent = m.maxCombo;
  const chart = $('chart'), tip = $('tip'), table = $('stTable');
  tip.hidden = true;
  chart.textContent = '';
  table.textContent = '';
  const b = bucketize(m.bins);
  if (!b) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '今天還沒有紀錄，先去打幾下。';
    chart.appendChild(d);
    $('stBin').textContent = '';
    return;
  }
  $('stBin').textContent = `（每 ${b.size} 分鐘一格）`;
  const W = Math.max(260, chart.clientWidth || 300), H = 190;
  const L = 36, R = 8, T = 12, B = 24;
  const pw = W - L - R, ph = H - T - B;
  const maxV = Math.max(...b.bars.map((x) => x.v));
  const step = niceStep(maxV);
  const top = Math.max(step, Math.ceil(maxV / step) * step);
  const slot = pw / b.bars.length;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v) => T + ph - (v / top) * ph;
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `今天每 ${b.size} 分鐘的出手次數，最多一格 ${maxV} 次`);
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  for (let v = 0; v <= top; v += step) {
    if (v > 0) el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: tok('--grid'), 'stroke-width': 1 });
    el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: tok('--muted') }, String(v));
  }
  const every = Math.ceil(b.bars.length / 5);
  b.bars.forEach((bar, i) => {
    const cx = L + slot * i + slot / 2;
    if (bar.v > 0) {
      const h = Math.max(2, y(0) - y(bar.v)), x0 = cx - bw / 2, y0 = y(0) - h, r = Math.min(4, bw / 2, h);
      el('path', { d: `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z`, fill: tok('--accent') });
    }
    if (i % every === 0) el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: tok('--muted') }, fmtMin(bar.t));
    const hit = el('rect', { x: L + slot * i, y: T, width: slot, height: ph, fill: 'transparent' });
    const show = () => {
      const sx = chart.clientWidth / W;
      tip.textContent = `${fmtMin(bar.t)}–${fmtMin(bar.t + b.size)}　${bar.v} 次`;
      tip.style.left = `${clamp(cx * sx, 60, chart.clientWidth - 60)}px`;
      tip.style.top = `${y(bar.v) * sx - 6}px`;
      tip.hidden = false;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerdown', show);
  });
  el('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: tok('--muted'), 'stroke-width': 1 });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
  chart.appendChild(svg);
  // 明細表：有出手的時段
  const tr = (cells, th) => {
    const r = document.createElement('tr');
    for (const c of cells) { const d = document.createElement(th ? 'th' : 'td'); d.textContent = c; r.appendChild(d); }
    table.appendChild(r);
  };
  tr(['時段', '次數'], true);
  for (const bar of b.bars) if (bar.v > 0) tr([`${fmtMin(bar.t)}–${fmtMin(bar.t + b.size)}`, String(bar.v)]);
}

// ================= 今日怒氣榜：所有人今天的紀錄 =================
const KINDS = ['alpaca', 'persimmon', 'marketer'];
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const shortName = (s, n = 7) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);
const fmtN = (n) => n.toLocaleString('en-US');
// 別人寫的資料一律當不可信：名字要是字串、數字要是有限正整數
// docs 裡 self 為 true 的是這台裝置自己的那筆，改用記憶體裡最新的 mine
function aggregate(docs, mine) {
  const by = new Map();
  const add = (d) => {
    const name = normName(d && d.name);
    if (!name) return;
    let r = by.get(name);
    if (!r) { r = { name, total: 0, kos: 0, maxCombo: 0, vic: { alpaca: 0, persimmon: 0, marketer: 0 }, first: '', last: '', lunch: 0 }; by.set(name, r); }
    r.total += num(d.total);
    r.kos += num(d.kos);
    r.maxCombo = Math.max(r.maxCombo, num(d.maxCombo));
    const vic = d.vic && typeof d.vic === 'object' ? d.vic : {};
    for (const k of KINDS) r.vic[k] += num(vic[k]);
    const bins = d.bins && typeof d.bins === 'object' ? d.bins : {};
    for (const [k, v] of Object.entries(bins)) {
      const n = num(v);
      if (!n || !/^\d\d:\d\d$/.test(k)) continue;
      if (!r.first || k < r.first) r.first = k;
      if (!r.last || k > r.last) r.last = k;
      if (k >= '12:00' && k < '13:30') r.lunch += n;
    }
  };
  for (const d of docs) if (d && !d.self) add(d);
  if (mine) add(mine);
  const rows = [...by.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r) => { r.rank = 1 + rows.filter((o) => o.total > r.total).length; });
  return rows;
}
const TIERS = [[3000, '已經不是人了'], [1500, '怒氣核電廠'], [700, '手不會痠嗎'], [300, '打紅眼了'], [100, '火氣上來了'], [30, '手開始癢了'], [1, '輕輕拍一下']];
const tierOf = (t) => (TIERS.find(([min]) => t >= min) || [0, '還沒出手'])[1];
const favOf = (r) => { const k = KINDS.reduce((a, b) => (r.vic[b] > r.vic[a] ? b : a)); return r.vic[k] > 0 ? k : ''; };
const AWARDS = [
  { label: '連打狂魔', val: (r) => r.maxCombo, min: 5, say: (r) => `最高 ${r.maxCombo} 連打` },
  { label: 'KO 收割機', val: (r) => r.kos, min: 1, say: (r) => `打倒 ${r.kos} 個` },
  { label: '老闆剋星', val: (r) => r.vic.alpaca, min: 1, say: (r) => `打羊駝 ${fmtN(r.vic.alpaca)} 下` },
  { label: 'IT 的惡夢', val: (r) => r.vic.persimmon, min: 1, say: (r) => `打柿子 ${fmtN(r.vic.persimmon)} 下` },
  { label: '行銷終結者', val: (r) => r.vic.marketer, min: 1, say: (r) => `打清朝人 ${fmtN(r.vic.marketer)} 下` },
  { label: '早鳥出拳', val: (r) => (r.first ? 1440 - toMin(r.first) : 0), min: 1, say: (r) => `${r.first} 就開打` },
  { label: '午休不休息', val: (r) => r.lunch, min: 1, say: (r) => `午休打了 ${fmtN(r.lunch)} 下` },
  { label: '下班還在打', val: (r) => (r.last >= '18:30' ? toMin(r.last) : 0), min: 1, say: (r) => `${r.last} 還在打` },
];

let toast = null;
function showToast(a, b, color) { toast = { a, b, color, t: 0 }; }
function drawToast(dt) {
  if (!toast) return;
  toast.t += dt;
  const T = 2.2, t = toast.t;
  if (t > T) { toast = null; return; }
  const alpha = Math.min(1, t * 6, (T - t) * 3);
  const y = 52 + Math.min(0, (t - 0.18) * 180);
  ctx.save();
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.font = `bold 20px ${FONT}`;
  const w = Math.min(320, Math.max(ctx.measureText(toast.a).width, toast.b ? 140 : 0) + 36);
  ctx.fillStyle = 'rgba(30,26,36,.94)';
  rrect(180 - w / 2, y, w, toast.b ? 54 : 36, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = toast.color;
  ctx.stroke();
  txt(toast.a, 180, y + 18, { size: 20, bold: true, color: toast.color, alpha });
  if (toast.b) txt(toast.b, 180, y + 40, { size: 13, color: '#f3eee6', alpha });
  ctx.restore();
}

const Board = {
  docs: null, live: false, busy: false, fails: 0, timer: 0, gen: 0,
  rows: [], rivals: [], p: 0, base: 0, above: new Set(), armed: false, begun: false, cool: new Map(),
  start() {
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.kick(); });
    this.kick();
  },
  // 輪詢：看排行榜時每 4 秒、玩的時候每 10 秒，分頁在背景就不抓；失敗時逐步拉長間隔
  kick() {
    clearTimeout(this.timer);
    void this.tick();
  },
  async tick() {
    const gen = ++this.gen;
    await this.poll();
    if (gen !== this.gen) return;
    const wait = this.fails ? Math.min(60000, 5000 * 2 ** Math.min(this.fails, 4)) : rankBox.hidden ? 10000 : 4000;
    this.timer = setTimeout(() => this.tick(), wait);
  },
  async poll() {
    if (this.busy || document.visibilityState !== 'visible' || !Stats.mine) return;
    if (todayStr() !== Stats.day) { location.reload(); return; } // 過了午夜：換新的一天，重新問名字
    this.busy = true;
    const name = Stats.name;
    try {
      const docs = await api.listDay(Stats.day, Stats.sid);
      if (name !== Stats.name) return;
      this.docs = docs;
      this.live = true;
      this.fails = 0;
      Stats.absorb(docs); // 同名其他裝置的次數也一起更新，左上角的今日出手才不會落後
      this.sync();
      if (this.begun) this.armed = true; // 拿到第一份伺服器資料後才開始報超車
    } catch {
      this.live = false;
      this.fails++;
    } finally {
      this.busy = false;
    }
    if (!rankBox.hidden) renderBoard();
  },
  reset() { this.armed = false; this.begun = false; this.above = new Set(); this.cool.clear(); this.rivals = []; this.p = 0; },
  rebase() { this.begun = true; this.sync(); if (this.live) this.armed = true; },
  sync() {
    if (!Stats.mine) return;
    this.rows = aggregate(this.docs || Stats.localDocs(), Stats.mine);
    const me = this.rows.find((r) => r.name === Stats.name);
    this.base = (me ? me.total : 0) - Stats.mine.total; // 同名其他裝置的次數
    this.rivals = this.rows.filter((r) => r.name !== Stats.name).map((r) => ({ name: r.name, total: r.total }));
    const mine = this.base + Stats.mine.total;
    let p = 0;
    while (p < this.rivals.length && this.rivals[p].total > mine) p++;
    this.p = p;
    const above = new Set(this.rivals.slice(0, p).map((r) => r.name));
    if (this.armed) {
      let by = '';
      for (const n of above) if (!this.above.has(n)) by = n;
      if (by && this.cooled(by + '<')) { showToast(`${shortName(by)} 超車你了！`, `你掉到第 ${p + 1} 名，快打回來`, '#ff8a8a'); Sound.play('bonk', 0.7); }
    }
    this.above = above;
  },
  // 同一個對手、同一個方向 8 秒內只報一次：兩人拉鋸時不要一直跳
  cooled(key) {
    const now = performance.now();
    if (now - (this.cool.get(key) ?? -1e9) < 8000) return false;
    this.cool.set(key, now);
    return true;
  },
  onHit() {
    if (!this.p || !Stats.mine) return;
    const mine = this.base + Stats.mine.total;
    let passed = '';
    while (this.p > 0 && mine > this.rivals[this.p - 1].total) {
      this.p--;
      passed = this.rivals[this.p].name;
      this.above.delete(passed);
    }
    if (passed && this.armed && this.cooled(passed + '>')) {
      const r = this.p + 1;
      showToast(`超車 ${shortName(passed)}！`, r === 1 ? '登上全公司第 1 名' : `現在第 ${r} 名`, r === 1 ? '#ffd84a' : '#7fe0ff');
      Sound.play('win');
    }
  },
  rank() { return this.rivals.length ? this.p + 1 : 0; },
};

const urlCache = new Map();
function spriteURL(c) { let u = urlCache.get(c); if (!u) { u = c.toDataURL(); urlCache.set(c, u); } return u; }
const beaten = (kind, d) => foeSprite({ kind, face: 'normal', faceT: 0, talk: null }, 0, d);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rankBox = $('rankBox');

function renderBoard() {
  const rows = Board.rows;
  const sum = rows.reduce((a, r) => a + r.total, 0), kos = rows.reduce((a, r) => a + r.kos, 0);
  $('rkSum').textContent = rows.length ? `今天 ${rows.length} 個人一共甩了 ${fmtN(sum)} 巴掌，打倒 ${fmtN(kos)} 次。` : '今天還沒有人出手。';

  // 受害者：三個角色今天各被打幾下，最多的那個腫最大
  const vt = Object.fromEntries(KINDS.map((k) => [k, rows.reduce((a, r) => a + r.vic[k], 0)]));
  const vmax = Math.max(...KINDS.map((k) => vt[k]));
  const vic = $('rkVic');
  vic.textContent = '';
  for (const k of KINDS) {
    const box = mk('div', vmax > 0 && vt[k] === vmax ? 'worst' : '');
    if (vmax > 0 && vt[k] === vmax) box.appendChild(mk('em', '', '今日最慘'));
    const img = mk('img');
    img.src = spriteURL(beaten(k, vmax > 0 ? vt[k] / vmax : 0));
    img.alt = NAME[k];
    box.append(img, mk('span', '', NAME[k]), mk('b', '', fmtN(vt[k])), mk('span', '', '下'));
    vic.appendChild(box);
  }

  // 你在哪裡
  const meEl = $('rkMe');
  const me = rows.find((r) => r.name === Stats.name);
  meEl.hidden = !Stats.name;
  if (!me) meEl.textContent = '你今天還沒出手，先去打幾下。';
  else if (rows.length === 1) meEl.textContent = '全公司今天只有你在打。把網址丟給同事吧。';
  else if (me.rank === 1) {
    const second = rows.find((r) => r.name !== me.name);
    meEl.textContent = me.total > second.total ? `你是今天的怒氣王，領先第 2 名 ${fmtN(me.total - second.total)} 下。` : `你跟 ${second.name} 並列第 1，再 1 下就甩開。`;
  } else {
    const above = rows.filter((r) => r.total > me.total).pop();
    meEl.textContent = `你第 ${me.rank} 名，再 ${fmtN(above.total - me.total + 1)} 下就超車 ${above.name}。`;
  }

  // 排行
  const list = $('rkList');
  list.textContent = '';
  const top = rows.length ? rows[0].total : 1;
  rows.slice(0, 30).forEach((r) => {
    const li = mk('li', `r${r.rank}${r.name === Stats.name ? ' me' : ''}`);
    li.appendChild(mk('span', 'rk', String(r.rank)));
    const fav = favOf(r);
    const img = mk('img');
    img.src = spriteURL(spr(fav || 'alpaca', { face: fav ? 'ouch' : 'normal' }));
    img.alt = fav ? `專打${NAME[fav]}` : '';
    li.appendChild(img);
    const who = mk('div', 'who');
    const nm = mk('b', '', r.name);
    if (r.name === Stats.name) nm.appendChild(mk('span', 'tag', '你'));
    who.append(nm, mk('span', '', fav ? `${tierOf(r.total)}・專打${NAME[fav]}` : tierOf(r.total)));
    li.append(who, mk('span', 'n', fmtN(r.total)));
    const bar = mk('div', 'bar');
    const fill = mk('i');
    fill.style.width = `${Math.max(2, (r.total / top) * 100)}%`;
    bar.appendChild(fill);
    li.appendChild(bar);
    list.appendChild(li);
  });
  if (rows.length > 30) list.appendChild(mk('li', 'more', `還有 ${rows.length - 30} 人`));

  // 頒獎：每個獎只給一個人；只有一個人時不頒
  const aw = $('rkAward');
  aw.textContent = '';
  if (rows.length < 2) aw.appendChild(mk('li', 'solo', rows.length ? '至少要兩個人打才頒獎，不然獎全是你的，太寂寞了。' : '等有人出手再頒。'));
  else {
    for (const a of AWARDS) {
      let best = null;
      for (const r of rows) if (a.val(r) >= a.min && (!best || a.val(r) > a.val(best))) best = r;
      if (!best) continue;
      const li = mk('li');
      const s = mk('span', '', best.name);
      s.appendChild(mk('i', '', `　${a.say(best)}`));
      li.append(mk('b', '', a.label), s);
      aw.appendChild(li);
    }
    if (!aw.children.length) aw.appendChild(mk('li', 'solo', '大家都還打得太客氣，沒有人得獎。'));
  }

  $('rkNote').textContent = Board.live ? '每幾秒自動更新，別人打的時候這裡會跟著變。' : '連不到伺服器，先顯示這台裝置的紀錄。';
}
async function openBoard() {
  rankBox.hidden = false;
  rankBox.querySelector('.card').scrollTop = 0;
  Board.sync();
  renderBoard();
  await Stats.flush(); // 讓別人也看到你最新的次數
  Board.kick(); // 馬上抓一次最新的，之後改成看榜的頻率
}
$('rank').addEventListener('click', (e) => { e.currentTarget.blur(); void openBoard(); });
$('rkClose').addEventListener('click', () => { rankBox.hidden = true; });
rankBox.addEventListener('click', (e) => { if (e.target === rankBox) rankBox.hidden = true; });

// 開發模式才開放的測試掛鉤（npm run dev）；正式版不會有
if (import.meta.env?.DEV) window.__beatboss = { Stats, Board, aggregate, count: () => Count.n };

resize();
startGame();
if (Stats.needName()) askName();
else void Stats.begin(ls.get('beatboss-name'));
Board.start();
requestAnimationFrame(frame);
