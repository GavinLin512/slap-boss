// 像素圖繪製：所有角色以 32x32 格子程式化繪製，描邊自動產生。
// 純資料模組，瀏覽器與 Node（預覽圖腳本）共用。

export const SIZE = 32;

export const PAL = {
  o: '#3b2340', // 描邊（深紫）
  e: '#2a1830', // 眼睛線條
  h: '#ffffff', // 白 / 反光
  // 羊駝
  w: '#f6eedb', W: '#d9c6a0', s: '#e3c08f', S: '#b98f5c',
  n: '#f2c4b4', N: '#d79a8c', t: '#fffbe8', p: '#f29aa8',
  r: '#e04848', R: '#a32a3a',
  // 柿子
  O: '#f5892a', q: '#c95e1c', y: '#ffc070', g: '#62b047', G: '#2f7030',
  k: '#26263a', l: '#cfe6ff', b: '#3d6fe0', D: '#284c9e', B: '#e9edf2',
  d: '#6b3b2a', c: '#c06a2c', C: '#8a4520',
  K: '#1d1a24', Z: '#4d4760', // 黑色馬桶蓋
  // 清朝人（原行銷主管）
  f: '#f3c9a2', F: '#cf9672', a: '#a9aeb8', A: '#767c89', L: '#dde1e8', u: '#858c98',
  U: '#5c626e', H: '#f7f7f4', m: '#ff2b2b', Y: '#ffd84a',
  // 清朝官服：深藍袍、海水紋、朝珠
  j: '#34457a', J: '#212c52', i: '#45598f', v: '#8cc0ee', V: '#3e6fb8', x: '#f0a040', X: '#a8582a',
  // 花翎：深墨綠、近黑綠、翎眼的暗青色
  P: '#22382c', Q: '#111b15', M: '#2e6a64',
};

export class Grid {
  constructor(w = SIZE, h = SIZE) {
    this.w = w;
    this.h = h;
    this.p = new Array(w * h).fill(null);
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (this.inb(x, y)) this.p[y * this.w + x] = c;
  }
  get(x, y) { return this.inb(x, y) ? this.p[y * this.w + x] : null; }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  // 橢圓（pow > 2 會比較方），光源在左上
  blob(cx, cy, rx, ry, c, { shade, hi, pow = 2, clip } = {}) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (Math.abs(dx) ** pow + Math.abs(dy) ** pow > 1) continue;
        if (clip && !clip(x, y)) continue;
        let col = c;
        if (shade && dx * 0.55 + dy * 0.8 > 0.5) col = shade;
        if (hi && -dx * 0.6 - dy * 0.8 > 0.62) col = hi;
        this.set(x, y, col);
      }
    }
  }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // 字串貼圖：'.' 跳過，'_' 擦除
  stamp(x, y, rows) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        this.set(x + i, y + j, ch === '_' ? null : ch);
      });
    });
  }
  outline(c = 'o') {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        const nb = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)];
        if (nb.some((v) => v !== null && v !== c)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
  }
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) === null) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { x0, y0, x1, y1 };
  }
  toRGBA() {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    this.p.forEach((c, i) => {
      if (c === null) return;
      const hex = PAL[c] || c;
      out[i * 4] = parseInt(hex.slice(1, 3), 16);
      out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      out[i * 4 + 3] = 255;
    });
    return out;
  }
}

// 共用眼睛（3x3 框，左上角為 x,y）。三隻都是「半睜不屑眼」，擺在一起才像同一組。
const EYES = {
  normal: ['...', 'eee', 'hee'],
  blink: ['...', '...', 'eee'],
  ouch: ['ee.', '..e', 'ee.'],
  ouchL: ['.ee', 'e..', '.ee'],
  dizzy: ['e.e', '.e.', 'e.e'],
  shock: ['.e.', 'ehe', '.e.'],
  happy: ['...', '.e.', 'e.e'],
};
function eye(g, x, y, face, left = false) {
  let key = face;
  if (face === 'ouch' && left) key = 'ouchL';
  if (!EYES[key]) key = 'normal';
  g.stamp(x, y, EYES[key]);
}
const OPEN_MOUTH = ['ouch', 'shock', 'dizzy'];

function cream(g, cx, cy, rx, ry) {
  g.blob(cx, cy, rx, ry, 'h', { shade: 'B' });
  g.set(cx - rx * 0.5, cy + ry + 0.5, 'h');
  g.set(cx - rx * 0.5, cy + ry + 1.5, 'h');
  g.set(cx + rx * 0.4, cy + ry + 0.5, 'h');
  g.set(cx - 1, cy - ry + 0.2, 'r'); // 櫻桃
}

// 頭髮圖層依 sway（像素）逐列錯位後疊上去：離髮根 rootY 越遠位移越大，做出飄動感
function addHair(g, hair, sway, rootY, span) {
  for (let y = 0; y < hair.h; y++) {
    const dx = Math.round(sway * Math.min(1, Math.abs(y - rootY) / span));
    for (let x = 0; x < hair.w; x++) {
      const c = hair.get(x, y);
      if (c !== null) g.set(x + dx, y, c);
    }
  }
}

// ---------------- 羊駝（老闆）：身體側面、頭轉正面 ----------------
export const ALPACA_MOUTH = { x: 21, y: 14 };

// 臉腫：兩頰鼓起來，level 1~3，第 3 級會腫出臉的輪廓
function swollen(g, cheeks, level) {
  if (level <= 0) return;
  for (const [cx, cy] of cheeks) g.blob(cx, cy, 0.9 + level * 0.55, 0.8 + level * 0.4, 'p', { shade: 'r' });
}

// 濕透：一條條往下垂的濕頭髮
function wetStrands(h, xs, y0, len, c) {
  xs.forEach((x, i) => h.line(x, y0, x, y0 + len - (i % 2), c));
}

// 招牌飛機頭：高聳蓬鬆、往一側掃下來蓋住左眼。剃毛時一起被剃短。濕掉時整個塌下來。
function alpacaHair(wool, wet) {
  const h = new Grid();
  if (wet && wool >= 1) {
    h.blob(20.6, 7.4, 5.4, 2.2, 'W', { shade: 'S' });
    wetStrands(h, [16, 18, 20, 22, 24], 8, wool >= 3 ? 5 : 3, 'W');
    return h;
  }
  if (wool >= 3) {
    h.blob(19.4, 5.6, 5.4, 3.4, 'w', { shade: 'W' }); // 蓬鬆主體
    h.blob(21.2, 3, 3.2, 2.4, 'w'); // 往上翹的飛機頭
    h.blob(23.4, 2, 1.6, 1.3, 'w');
    h.blob(18, 9.6, 2.5, 2.8, 'w', { shade: 'W' }); // 往下掃、蓋住左眼的瀏海
    h.blob(15.8, 12, 1.3, 1.6, 'w');
    h.line(15, 7, 19, 3, 'W');
    h.line(17, 8, 21, 4, 'W');
    h.set(19, 2, 'h');
    h.set(20, 1, 'h');
    h.set(21, 1, 'h');
  } else if (wool === 2) {
    h.blob(19.6, 6.2, 5, 2.8, 'w', { shade: 'W' });
    h.blob(18, 9.6, 2.4, 2.6, 'w', { shade: 'W' });
  } else if (wool === 1) {
    h.blob(20.5, 7, 3.4, 1.8, 'w', { shade: 'W' });
  }
  return h;
}

function alpaca(o) {
  const { frame = 0, face = 'normal', wool: woolLevel = 4, cream: hasCream = false, sway = 0, swell = 0, wet = false } = o;
  const g = new Grid();
  const naked = woolLevel <= 0;
  // 濕掉時毛貼在身上，看起來瘦一圈
  const wool = wet ? Math.min(woolLevel, 1) : woolLevel;
  const W1 = naked ? 'n' : (wet ? 'W' : 'w');
  const W2 = naked ? 'N' : (wet ? 'S' : 'W');

  // 腳
  [7, 10, 16, 19].forEach((lx, i) => {
    const alt = frame === 1 && i % 2 === 0;
    const x = lx + (alt ? 1 : 0);
    const bottom = alt ? 29 : 30;
    g.rect(x, 25, 2, bottom - 25 + 1, i < 2 ? 'S' : 's');
    g.rect(x, bottom, 2, 1, 'd');
  });

  // 尾巴
  if (naked) g.blob(5.5, 21.5, 1.3, 1.3, 'n');
  else g.blob(4.5, 21, 2, 2, W1, { shade: W2 });

  // 身體 + 毛球
  if (naked) {
    g.blob(14, 23.5, 7, 3.6, 'n', { shade: 'N' });
  } else {
    g.blob(14, 23, 8 + wool * 0.3, 4.4 + wool * 0.12, W1, { shade: W2 });
    const bumps = [[10.5, 18.6], [14.5, 18.2], [7, 19.6], [5, 22.2], [21.4, 21.6], [6.6, 25.8], [12, 27.4], [17.2, 27.2], [18, 19]];
    bumps.slice(0, Math.round(wool * 2.25)).forEach(([bx, by]) => g.blob(bx, by, 2.1, 2.1, W1, { shade: W2 }));
  }

  // 長脖子
  if (naked) {
    g.rect(19, 13, 4, 9, 'n');
    g.rect(22, 13, 1, 9, 'N');
  } else {
    g.rect(18, 13, 6, 9, 'w');
    g.rect(23, 13, 1, 9, 'W');
  }

  // 耳朵（往兩側翹）
  g.stamp(14, 6, ['ss..', 'sss.', '..ss']);
  g.stamp(24, 6, ['..ss', '.sss', 'ss..']);

  // 正面的臉
  g.blob(21, 12, 4.6, 4.2, 's', { shade: 'S' });
  g.outline();

  // 紅領帶
  g.stamp(19, 16, ['.RR.', '.rr.', '.rr.', 'rrrr', '.rr.']);

  // 五官（左眼平常被瀏海蓋住，頭髮甩開或剃光才看得到）
  eye(g, 22, 9, face);
  eye(g, 17, 9, face, true);
  g.set(20, 13, 'e');
  g.set(22, 13, 'e');
  if (OPEN_MOUTH.includes(face)) {
    g.rect(20, 14, 3, 2, 'e');
    g.set(21, 14, 't');
    g.set(22, 14, 't');
  } else {
    g.line(20, 14, 22, 14, 'e');
    g.set(21, 15, 't'); // 暴牙
    g.set(22, 15, 't');
  }
  g.set(24, 13, 'p');
  g.set(25, 13, 'p');
  if (face === 'happy') g.set(18, 13, 'p');
  swollen(g, [[18, 13.3], [24.6, 13.3]], swell);

  addHair(g, alpacaHair(woolLevel, wet), wet ? Math.round(sway / 3) : sway, 8, 6);
  if (wet) [[17, 15], [23, 14], [11, 27], [19, 26]].forEach(([x, y]) => g.set(x, y, 'l'));
  if (hasCream) cream(g, 21, 11.5, 4.4, 3);
  g.outline();
  return g;
}

// ---------------- 柿子（資訊部主管）：正面、黑色馬桶蓋 ----------------
function persimmon(o) {
  const { frame = 0, face = 'normal', flat = false, glint = false, cream: hasCream = false, sway = 0, swell = 0, wet = false } = o;
  if (flat) return persimmonFlat(sway);
  const g = new Grid();
  const lift = frame === 1 ? 1 : 0;

  // 腳、手
  g.blob(11.5, 28.6 - lift, 2.6, 1.6, 'd');
  g.blob(20.5, 28.6, 2.6, 1.6, 'd');
  g.blob(3.8, 20, 2, 2.6, 'O', { shade: 'q' });
  g.blob(28.2, 20 - lift, 2, 2.6, 'O', { shade: 'q' });

  // 身體（偏方的圓）
  g.blob(16, 19, 12, 9.2, 'O', { shade: 'q', hi: 'y', pow: 2.4 });

  // 頭頂留一小截蒂頭，看得出是柿子
  g.rect(15, 5, 2, 4, 'G');
  g.blob(18.8, 6.4, 2, 1, 'g', { shade: 'G' });
  g.outline();

  // 眼鏡
  for (const lx of [6, 18]) {
    g.rect(lx, 14, 8, 6, 'k');
    g.rect(lx + 1, 15, 6, 4, 'l');
    g.set(lx + 1, 15, 'h');
  }
  g.rect(14, 15, 4, 1, 'k');
  eye(g, 8, 15, face, true);
  eye(g, 20, 15, face);
  if (glint) {
    g.set(10, 15, 'h'); g.set(11, 15, 'h'); g.set(11, 16, 'h');
    g.set(22, 15, 'h'); g.set(23, 15, 'h'); g.set(23, 16, 'h');
  }
  // 嘴
  if (face === 'ouch' || face === 'dizzy') g.stamp(14, 21, ['e.e.e', '.e.e.']);
  else if (face === 'shock') g.stamp(15, 21, ['.e.', 'e.e', '.e.']);
  else if (face === 'happy') g.stamp(14, 21, ['e...e', '.eee.']);
  else g.line(15, 22, 17, 22, 'e');

  // 識別證掛繩 + 識別證
  g.line(9, 20, 13, 24, 'b');
  g.line(23, 20, 19, 24, 'b');
  g.rect(13, 24, 7, 4, 'B');
  g.rect(13, 24, 7, 1, 'b');
  g.set(14, 26, 'p');
  g.line(16, 26, 18, 26, 'k');

  swollen(g, [[7.6, 21.4], [24.4, 21.4]], swell);

  // 黑色馬桶蓋：齊瀏海切在眼鏡上緣，兩側蓋到耳朵高度。濕掉時瀏海變一條條垂到眼鏡上
  const hair = new Grid();
  hair.blob(16, 17.2, 12.8, 8.6, 'K', { clip: (x, y) => y <= 13 || (y <= 16 && (x <= 5 || x >= 26)) });
  if (wet) {
    wetStrands(hair, [7, 9, 11, 13, 19, 21, 23, 25], 14, 4, 'K');
  } else {
    hair.line(8, 12, 11, 10, 'Z');
    hair.line(12, 10, 14, 10, 'Z');
  }
  addHair(g, hair, wet ? Math.round(sway / 3) : sway, 9, 5);
  if (wet) [[5, 18], [27, 22], [10, 26], [21, 27]].forEach(([x, y]) => g.set(x, y, 'l'));

  if (hasCream) cream(g, 16, 16, 8, 3);
  g.outline();
  return g;
}

function persimmonFlat(sway = 0) {
  const g = new Grid();
  g.blob(16, 26.5, 13.5, 3.6, 'c', { shade: 'C', pow: 2.2 });
  g.rect(15, 20, 2, 2, 'G');
  g.outline();
  [[7, 26], [11, 27], [15, 28], [19, 27], [23, 26], [25, 28], [13, 29], [20, 29], [9, 29]].forEach(([x, y]) => g.set(x, y, 'h'));
  // 歪掉的眼鏡 + 叉叉眼
  g.rect(9, 25, 5, 3, 'k'); g.rect(10, 26, 3, 1, 'l');
  g.rect(18, 26, 5, 3, 'k'); g.rect(19, 27, 3, 1, 'l');
  g.line(14, 26, 17, 27, 'k');
  g.set(11, 26, 'e'); g.set(20, 27, 'e');
  // 壓扁的馬桶蓋
  const hair = new Grid();
  hair.blob(16, 24.2, 9.5, 2.4, 'K', { clip: (x, y) => y <= 24 });
  addHair(g, hair, sway, 22, 3);
  g.outline();
  return g;
}

// ---------------- 清朝人（原行銷部主管）：清朝官員造型（不戴帽）。前額剃光、灰辮子從後腦垂在背後、深藍官袍、補子、朝珠 ----------------
// 辮子像鐘擺一樣從後腦垂下，靜止時稍微偏右，只從身旁露出一小截辮穗；甩動時才從身體兩側甩出來
const BRAID_PIVOT = { x: 16, y: 9 };
const BRAID_LEN = 19;

// 只畫在空白處＝疊在現有圖案的後面
function behind(g, layer) {
  for (let y = 0; y < layer.h; y++) {
    for (let x = 0; x < layer.w; x++) {
      const c = layer.get(x, y);
      if (c !== null && g.get(x, y) === null) g.set(x, y, c);
    }
  }
}

// 擺角（弧度，0 = 正下方）。往左要甩很大才會從身體另一側露出來，所以兩邊倍率不同
function braidAngle(sway) {
  return 0.55 + sway * (sway < 0 ? 0.36 : 0.13);
}

// 沿辮子取點，越末端彎越多
function braidPath(th, len) {
  const pts = [];
  let x = BRAID_PIVOT.x;
  let y = BRAID_PIVOT.y;
  for (let d = 0.5; d <= len; d += 0.5) {
    const a = th * (0.6 + 0.4 * d / len);
    x += Math.sin(a) * 0.5;
    y += Math.cos(a) * 0.5;
    pts.push([Math.round(x), Math.round(y), d]);
  }
  return pts;
}

// 燒焦的辮子：縮成三圈焦黑彈簧，從後腦往右邊翹出來
function burntCoils(sway) {
  const k = Math.round(sway * 0.4);
  return [[23, 13], [25, 16], [26, 19]].map(([x, y], i) => [x + Math.round((k * (i + 1)) / 3), y]);
}

// 辮子末端（精靈圖座標），給 main.js 冒煙 / 滴水用
export function marketerBraidTip({ sway = 0, wet = false, soot = false } = {}) {
  if (soot && !wet) { // 同時濕著時畫的是濕辮子
    const [x, y] = burntCoils(sway)[2];
    return { x, y: y - 1 };
  }
  const pts = braidPath(braidAngle(wet ? sway * 0.3 : sway), BRAID_LEN);
  const [x, y] = pts[pts.length - 1];
  return { x, y: Math.min(y + 2, 29) };
}

// 編好的辮子：兩色交錯成麻花紋
function braidSeg(g, x, y, d, wide, c1, c2) {
  const i = Math.floor(d) % 2;
  g.set(x - 1, y, i ? c2 : c1);
  g.set(x, y, i ? c1 : c2);
  if (wide) g.set(x + 1, y, i ? c2 : c1);
}

// 辮穗（不能低於鞋子那一列）
function tassel(g, x, y, c1, c2) {
  g.rect(x - 1, Math.min(y + 1, 28), 2, 1, c1);
  g.set(x - 1, Math.min(y + 2, 29), c2);
  g.set(x, Math.min(y + 2, 29), c1);
}

// 清朝官帽（頂戴）：上翻的黑帽簷、放射狀紅纓帽頂、金頂珠。dx / dy 是位移（單獨畫掉落的帽子時用）
function hatBody(g, dx = 0, dy = 0) {
  const r = (x, y, w, h, c) => g.rect(x + dx, y + dy, w, h, c);
  r(13, 1, 6, 1, 'r');
  r(12, 2, 8, 1, 'r');
  r(10, 3, 12, 1, 'r');
  [[14, 1], [17, 1], [12, 2], [15, 2], [18, 2], [11, 3], [14, 3], [17, 3], [20, 3]].forEach(([x, y]) => g.set(x + dx, y + dy, 'R'));
  r(15, 0, 2, 1, 'Y'); // 頂珠
  r(9, 4, 14, 1, 'Z'); // 帽簷上緣
  r(8, 5, 16, 1, 'K');
  r(9, 6, 14, 1, 'K');
}

// 孔雀花翎：細細的翎管從頂珠旁邊斜 45 度往下伸出，末端是暗青色翎眼，羽枝往外散開。
// 畫在描邊之後、只填空白處（羽枝之間留空隙才看得出散開），越末端跟著 sway 晃得越多
const FEATHER = [
  'Q.......',
  '.Q......',
  '..Q.P...',
  '...Q..P.',
  '..P.M...',
  '.....M.P',
  '...P..P.',
  '.....P..',
];
// 掉在地上時平躺的花翎
const FEATHER_FLAT = [
  '....P.P',
  '...P.P.',
  'QQQQMMP',
  '...P.P.',
  '....P.P',
];
function stampFeather(g, rows, ox, oy, bend = 0) {
  rows.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '.') return;
    const x = ox + i + Math.round((bend * Math.max(i, j)) / rows.length);
    const y = oy + j;
    if (g.get(x, y) === null) g.set(x, y, c);
  }));
}
function hatFeather(g, sway = 0) {
  g.line(18, 1, 21, 4, 'Q'); // 翎管
  stampFeather(g, FEATHER, 21, 4, Math.round(sway * 0.5));
}

// 掉在地上的官帽（單獨一張圖）
function qingHat() {
  const g = new Grid(24, 10);
  hatBody(g, -7, 1);
  g.outline();
  g.line(12, 3, 15, 4, 'Q');
  stampFeather(g, FEATHER_FLAT, 15, 2);
  return g;
}

function marketer(o) {
  const { frame = 0, face = 'normal', mess = 0, comb = -1, talk = false, cream: hasCream = false, sway = 0, swell = 0, wet = false, soot = false, nohat = false } = o;
  const g = new Grid();
  // 辮子散開程度 0~3；重新編辮子時（comb 0→1）慢慢收回去。濕掉、燒焦時不看這個
  const u = wet || soot ? 0 : comb >= 0 ? mess * (1 - comb) : mess;

  // 官袍：上身 + 下襬微微外擴，下襬一圈海水紋；走路時下襬跟著左右擺
  const sk = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  g.rect(11, 16, 10, 10, 'j');
  g.rect(10 + sk, 26, 12, 4, 'j');
  g.rect(19, 17, 2, 9, 'J');
  g.rect(20 + sk, 26, 2, 2, 'J');
  g.set(11, 16, null);
  g.set(20, 16, null);
  for (let x = 10; x < 22; x++) {
    g.set(x + sk, 28, (x % 3) === 0 ? 'v' : 'V');
    g.set(x + sk, 29, (x % 3) === 1 ? 'v' : 'V');
  }
  // 袖子 + 馬蹄袖 + 手
  g.rect(9, 17, 2, 7, 'i');
  g.rect(21, 17, 2, 7, 'J');
  g.rect(8, 24, 3, 1, 'V');
  g.rect(21, 24, 3, 1, 'V');
  g.rect(9, 25, 2, 1, 'f');
  g.rect(21, 25, 2, 1, 'f');
  // 官靴：走路時抬起一隻，另一隻一定踩在最底列
  g.rect(frame === 1 ? 10 : 11, frame === 1 ? 29 : 30, 4, 1, 'k');
  g.rect(frame === 2 ? 18 : 17, frame === 2 ? 29 : 30, 4, 1, 'k');
  g.rect(15, 14, 2, 2, 'f'); // 脖子

  // 頭 + 耳朵
  g.blob(10.4, 9.6, 1.2, 1.6, 'f', { shade: 'F' });
  g.blob(21.6, 9.6, 1.2, 1.6, 'F');
  g.blob(16, 9, 5.6, 5.8, 'f', { shade: 'F' });
  g.outline();
  // 身體本身的左右範圍：碰撞、對話框位置用這個，不算甩出去的辮子
  const core = g.bounds();

  // 領口、補子（仙鶴）、朝珠
  g.rect(14, 16, 4, 1, 'J');
  g.rect(13, 21, 6, 6, 'Y');
  g.rect(14, 22, 4, 4, 'J');
  g.stamp(14, 22, ['..Hr', '..H.', 'HHH.', '.H..']);
  [[12, 17], [12, 18], [13, 19], [14, 20], [15, 20], [16, 20], [17, 20], [18, 19], [19, 18], [19, 17]]
    .forEach(([x, y], i) => g.set(x, y, i % 2 ? 'X' : 'x'));

  // 剃光的前額（亮亮的）
  g.set(13, 4, 'h');
  g.set(14, 4, 'h');
  g.set(13, 5, 'h');

  // 五官
  g.line(12, 7, 14, 7, 'A');
  g.line(17, 7, 19, 7, 'A');
  eye(g, 12, 7, face, true);
  eye(g, 17, 7, face);
  g.set(16, 11, 'F'); // 鼻
  g.set(13, 12, 'F'); // 法令紋
  g.set(18, 12, 'F');
  if (OPEN_MOUTH.includes(face)) {
    g.rect(14, 12, 3, 2, 'e');
  } else if (face === 'happy') {
    g.stamp(13, 12, ['e...e', '.eee.']);
  } else if (talk) {
    g.rect(14, 12, 3, 2, 'e'); // 喋喋不休：嘴巴一開一合
    g.set(15, 13, 'p');
  } else {
    g.line(14, 13, 16, 13, 'e'); // 得意的歪嘴笑
    g.set(17, 12, 'e');
  }
  swollen(g, [[11.8, 11.6], [20.2, 11.6]], swell);

  // 官帽（被打掉時 nohat，露出剃光的前額）
  if (!nohat) hatBody(g);

  // 腦後的灰髮：從正面只看得到耳朵上方兩側一小撮
  const back = new Grid();
  back.blob(16, 8.4, 6.9, 5.4, 'A', { clip: (x, y) => y >= 5 && y <= 9 });
  if (u >= 2.5) {
    // 辮子整個散掉：腦後炸成一圈灰色爆炸頭
    back.blob(16, 8, 9.2, 7.6, 'a', {
      shade: 'A',
      hi: 'L',
      clip: (x, y) => Math.hypot((x + 0.5 - 16) / 9.2, (y + 0.5 - 8) / 7.6) < 0.82 || (x * 7 + y * 13) % 4 !== 0,
    });
  } else if (u >= 1.5) {
    back.line(9, 6, 7, 4, 'a');
    back.line(23, 6, 25, 4, 'a');
    back.line(18, 3, 19, 1, 'L');
  }
  behind(g, back);

  // 辮子（全部畫在身體後面）
  const braid = new Grid();
  if (wet) {
    // 濕透：辮子吸水變粗、變重，幾乎不甩，辮穗一直滴水；腦門有水珠
    const pts = braidPath(braidAngle(sway * 0.3), BRAID_LEN);
    pts.forEach(([x, y, d]) => braidSeg(braid, x, y, d, true, 'A', 'U'));
    const [tx, ty] = pts[pts.length - 1];
    tassel(braid, tx, ty, 'R', 'R');
    if (ty + 3 <= 29) braid.set(tx, ty + 3, 'l');
    g.set(12, 5, 'l');
    g.set(18, 4, 'l');
    [[9, 14], [23, 16], [11, 22], [19, 27]].forEach(([x, y]) => g.set(x, y, 'l'));
  } else if (soot) {
    // 燒焦：辮子縮成一捲一捲的焦黑彈簧，從後腦往外翹
    burntCoils(sway).forEach(([x, y]) => braid.stamp(x - 1, y - 1, ['ZaZ', 'K.K', 'ZKZ']));
  } else {
    const pts = braidPath(braidAngle(sway), BRAID_LEN);
    const neat = BRAID_LEN * (1 - u / 3);
    pts.forEach(([x, y, d]) => {
      if (d <= neat) {
        braidSeg(braid, x, y, d, false, 'a', 'A');
      } else {
        // 散開的部分：三束頭髮往下岔開
        const s = Math.round((d - neat) * 0.4);
        braid.set(x - s - 1, y, 'A');
        braid.set(x, y, 'a');
        braid.set(x + s, y, 'L');
      }
    });
    if (u < 0.5) {
      const [tx, ty] = pts[pts.length - 1];
      tassel(braid, tx, ty, 'r', 'R');
    }
  }
  behind(g, braid);

  // 重新編辮子：手拿梳子在腦後右側一下一下往下梳
  if (comb >= 0 && u > 0) {
    const cy = 4 + (Math.round(comb * 6) % 3) * 3;
    g.rect(21, cy, 5, 1, 'd');
    for (let i = 0; i <= 4; i += 2) g.set(21 + i, cy + 1, 'd');
  }

  if (hasCream) cream(g, 15.5, 9.5, 4.6, 3);
  g.outline();
  if (!nohat) hatFeather(g, sway);
  g.core = { x0: core.x0, x1: core.x1 };
  return g;
}

// ---------------- 道具（16x16） ----------------
function slipper() {
  const g = new Grid(16, 16);
  g.blob(8, 10, 7, 2.6, 'B', { shade: 'A' });
  g.rect(1, 11, 14, 2, 'b');
  g.set(1, 11, null); g.set(14, 12, null);
  // 藍色鞋帶在前端（左側）
  g.stamp(2, 4, ['..bbbb..', '.bbbbbb.', 'bbD..Dbb', 'bb....bb']);
  g.outline();
  return g;
}
function pie() {
  const g = new Grid(16, 16);
  g.stamp(2, 10, ['AAAAAAAAAAAA', '.AAAAAAAAAA.', '..AAAAAAAA..']);
  g.rect(2, 9, 12, 1, 'y');
  g.blob(8, 8, 6.5, 2.8, 'h', { shade: 'B' });
  g.blob(8, 4.6, 1.4, 1.4, 'r', { shade: 'R' });
  g.outline();
  return g;
}
function paper() {
  const g = new Grid(16, 16);
  g.blob(8, 8, 5.5, 5.2, 'H', { shade: 'A', pow: 1.8 });
  g.line(5, 6, 8, 8, 'A'); g.line(9, 5, 11, 9, 'A'); g.line(6, 11, 9, 10, 'A');
  g.outline();
  return g;
}
function toolbox() {
  const g = new Grid(16, 16);
  g.stamp(4, 2, ['.kkkkkk.', 'k......k', 'k......k']);
  g.rect(1, 5, 14, 9, 'r');
  g.rect(1, 5, 14, 2, 'R');
  g.rect(1, 12, 14, 2, 'R');
  g.rect(7, 8, 2, 2, 'Y');
  g.outline();
  return g;
}

// ---------------- 粒子 ----------------
function star() {
  const g = new Grid(9, 9);
  g.stamp(1, 1, ['...Y...', '..YYY..', 'YYYYYYY', '.YYYYY.', '.YY.YY.', 'Y.....Y']);
  g.outline();
  return g;
}
function woolPuff() {
  const g = new Grid(8, 8);
  g.blob(4, 4, 3, 2.6, 'w', { shade: 'W' });
  g.outline();
  return g;
}
function spit() {
  const g = new Grid(5, 5);
  g.blob(2.5, 2.5, 1.6, 1.6, 'l', { hi: 'h' });
  g.outline();
  return g;
}
function scissors() {
  const g = new Grid(12, 12);
  g.line(2, 2, 8, 8, 'L'); g.line(9, 2, 3, 8, 'A');
  g.blob(2.5, 9.5, 1.8, 1.8, 'r'); g.blob(8.5, 9.5, 1.8, 1.8, 'r');
  g.set(2, 9, null); g.set(8, 9, null);
  g.outline();
  return g;
}

function hand() {
  const g = new Grid(16, 16);
  g.blob(2.9, 10.4, 1.4, 2.3, 'f', { shade: 'F' }); // 大拇指
  g.rect(4, 3, 2, 7, 'f');
  g.rect(6, 2, 2, 8, 'f');
  g.rect(8, 3, 2, 7, 'f');
  g.rect(10, 4, 2, 6, 'f');
  g.blob(7.9, 10.6, 4.1, 3.2, 'f', { shade: 'F' }); // 手掌
  g.outline();
  for (const x of [5, 7, 9]) g.line(x, x === 7 ? 3 : 4, x, 8, 'F');
  return g;
}
function bucket() {
  const g = new Grid(16, 16);
  for (let y = 6; y <= 13; y++) {
    const hw = 6 - Math.floor((y - 6) * 0.35);
    g.rect(8 - hw, y, hw * 2, 1, y === 9 || y === 12 ? 'D' : 'b');
    g.set(7 + hw, y, 'D');
  }
  g.rect(2, 6, 12, 1, 'B');
  g.rect(3, 7, 10, 1, 'l');
  g.outline();
  g.line(3, 5, 5, 2, 'k');
  g.line(5, 2, 10, 2, 'k');
  g.line(10, 2, 12, 5, 'k');
  return g;
}
function banana() {
  const g = new Grid(16, 16);
  // 三片果皮往左、右、前攤開
  g.stamp(0, 2, [
    '........d.......',
    '........d.......',
    '.......YYy......',
    '.......YYy......',
    '......YYYYy.....',
    '.....YYyYYyy....',
    '....YYy.YY.yYy..',
    '...YYy..YY..yYy.',
    '..YYy...Yy...yYy',
    '.dYy....Yy....yd',
    '.d......dd......',
  ]);
  g.outline();
  return g;
}
function note() {
  const g = new Grid(16, 16);
  g.rect(2, 2, 12, 12, 'Y');
  g.set(13, 13, null); g.set(12, 13, null); g.set(13, 12, null);
  g.set(12, 12, 'y');
  g.outline();
  g.line(4, 5, 11, 5, 'A'); g.line(4, 8, 11, 8, 'A'); g.line(4, 11, 8, 11, 'A');
  return g;
}

function rocket() {
  const g = new Grid(16, 16);
  g.stamp(6, 1, ['.rr.', 'rrrr']); // 尖頭
  g.rect(6, 3, 4, 8, 'r');
  g.rect(9, 3, 1, 8, 'R');
  g.rect(6, 5, 4, 1, 'h');
  g.rect(6, 8, 4, 1, 'h');
  g.stamp(4, 9, ['RR....RR', 'RR....RR']); // 尾翼
  g.rect(7, 11, 2, 1, 'A');
  g.line(7, 12, 7, 15, 'd'); // 沖天炮的竹籤
  g.outline();
  g.set(9, 12, 'k'); g.set(10, 13, 'k'); // 引信
  return g;
}
function smoke() {
  const g = new Grid(8, 8);
  g.blob(4, 4, 3, 2.7, 'a', { shade: 'A' });
  g.outline('A');
  return g;
}

// 滿臉黑灰：顏色整體燒深一階，再撒少量黑點；描邊和眼睛不動
const BURNT = {
  w: 'S', W: 'd', s: 'S', S: 'd', n: 'N', N: 'd', t: 'S', p: 'R', r: 'R',
  O: 'c', q: 'C', y: 'c', g: 'G', l: 'A', B: 'A', H: 'a', h: 'a',
  f: 'F', F: 'd', a: 'A', A: 'U', L: 'a', u: 'U', Y: 'c',
  j: 'J', i: 'J', J: 'k', v: 'A', V: 'U', x: 'c', X: 'C', P: 'K', Q: 'K', M: 'Z',
};
function sooty(g) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const c = g.get(x, y);
      if (c === null || c === 'o' || c === 'e') continue;
      const hash = (x * 73 + y * 151 + x * y * 7) % 11;
      g.set(x, y, hash === 0 ? 'K' : (BURNT[c] || c));
    }
  }
}

// 鍵盤：灰色機身、白色按鍵、紅色 Esc、上面接一條線。half = 'L' / 'R' 是砸斷後的半邊
function keyboard(half) {
  const g = new Grid(16, 16);
  g.rect(1, 6, 14, 6, 'u');
  g.rect(1, 11, 14, 1, 'U');
  for (let x = 2; x <= 13; x += 2) g.set(x, 7, 'h');
  for (let x = 3; x <= 13; x += 2) g.set(x, 8, 'h');
  for (let x = 2; x <= 13; x += 2) g.set(x, 9, 'h');
  g.rect(5, 10, 6, 1, 'h'); // 空白鍵
  g.set(2, 7, 'r'); // Esc
  g.line(8, 5, 8, 4, 'k'); // 線
  g.line(9, 3, 11, 1, 'k');
  if (half) {
    // 從中間鋸齒狀斷開
    for (let y = 0; y < 16; y++) {
      const cut = 8 + (y % 2);
      for (let x = 0; x < 16; x++) if (half === 'L' ? x >= cut : x < cut) g.set(x, y, null);
    }
  }
  g.outline();
  return g;
}

// 臉上的鍵盤印：壓出一格一格的格線（每排錯開半格），只壓在皮膚上（不蓋到眼睛、描邊）
const KB_FACE = { alpaca: [18, 10, 8, 6], persimmon: [7, 22, 19, 5], marketer: [11, 3, 11, 10] };
const KB_INK = { f: 'F', F: 'd', O: 'q', q: 'C', w: 'S', W: 'S', s: 'S', S: 'd', n: 'N', t: 'S' };
function kbPrint(g, kind) {
  const r = KB_FACE[kind];
  if (!r) return;
  const [x0, y0, w, h] = r;
  for (let y = y0; y < y0 + h; y++) {
    const row = Math.floor((y - y0) / 3);
    const edge = (y - y0) % 3 === 2;
    for (let x = x0; x < x0 + w; x++) {
      if (!edge && (x - x0 + (row % 2) * 2) % 4 !== 3) continue;
      const c = g.get(x, y);
      if (KB_INK[c]) g.set(x, y, KB_INK[c]);
    }
  }
}

const BUILDERS = { alpaca, persimmon, marketer, slipper, pie, paper, toolbox, star, woolPuff, spit, scissors, hand, bucket, banana, note, rocket, smoke, qingHat, keyboard: () => keyboard(), kbL: () => keyboard('L'), kbR: () => keyboard('R') };

export function build(kind, opts = {}) {
  const fn = BUILDERS[kind];
  if (!fn) throw new Error(`unknown sprite ${kind}`);
  const g = fn(opts);
  if (opts.kb) kbPrint(g, kind);
  if (opts.soot) sooty(g);
  return g;
}
