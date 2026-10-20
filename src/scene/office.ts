/** 像素風辦公室場景:全部用程式畫,內部解析度很小,再用 CSS 整數倍放大 */
import { drawMate } from './mate';
import type { Style } from '../types';

export interface Rect { x: number; y: number; w: number; h: number }

export interface SceneLayout {
  /** 放大倍率(1 個內部像素 = S 個 CSS 像素) */
  S: number;
  /** 內部解析度 */
  W: number;
  H: number;
  /** 上方牆面區高度、桌面起始 y */
  topH: number;
  deskY: number;
  mon: Rect;
  scr: Rect;
  win: Rect;
  clock: { cx: number; cy: number; r: number };
  leftW: number;
  rightW: number;
  /** 房間場景下方的對話框 */
  dlg: Rect;
  /** 桌上馬克杯的位置(畫面夠寬才有),用來疊冒煙動畫 */
  mug: { x: number; y: number } | null;
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeLayout(vw: number, vh: number): SceneLayout {
  const S = vw < 560 ? 3 : 4;
  const W = Math.ceil(vw / S);
  const H = Math.ceil(vh / S);
  // 橫向(寬大於高)時,牆面與桌面讓出空間給螢幕,畫面才不會擠
  const landscape = W > H;
  const topH = Math.round(H * (landscape ? 0.2 : 0.26));
  const deskY = H - Math.round(H * (landscape ? 0.13 : 0.15));
  const mW = Math.min(W - 6, landscape ? 190 : 150);
  const mon: Rect = { x: Math.floor((W - mW) / 2), y: topH, w: mW, h: deskY - topH + 3 };
  const scr: Rect = { x: mon.x + 4, y: mon.y + 4, w: mon.w - 8, h: mon.h - 4 - 8 - 3 };
  const leftW = clamp(Math.round(W * 0.27), 30, 42);
  const rightW = clamp(Math.round(W * 0.25), 28, 40);
  const wx0 = mon.x + leftW + 3;
  const wx1 = mon.x + mon.w - rightW - 3;
  const win: Rect = { x: wx0, y: 5, w: Math.max(20, wx1 - wx0), h: topH - 10 };
  const r = Math.min(9, Math.floor(rightW / 2) - 2);
  const clock = { cx: mon.x + mon.w - Math.floor(rightW / 2), cy: 5 + r, r };
  const dlgY = Math.round(H * 0.5);
  const dlg: Rect = { x: mon.x, y: dlgY, w: mon.w, h: H - dlgY - 6 };
  const mug = W - (mon.x + mon.w) >= 22 ? { x: mon.x + mon.w + 6, y: deskY - 7 } : null;
  return { S, W, H, topH, deskY, mon, scr, win, clock, leftW, rightW, dlg, mug };
}

/* ---------- 色盤 ---------- */

export interface Stage {
  sky: [string, string, string];
  wall: string;
  wallLine: string;
  bld: string;
  bld2: string;
  desk: [string, string, string];
  stars: boolean;
  lit: boolean;
}

/** 一天的五個時段:早晨、中午、下午、傍晚、夜晚 */
export const STAGES: Stage[] = [
  { sky: ['#8fd3ff', '#b9e6ff', '#dff4ff'], wall: '#ece6d9', wallLine: '#e0d9ca', bld: '#6c8cab', bld2: '#58789a', desk: ['#c4915e', '#b4814f', '#8f6238'], stars: false, lit: false },
  { sky: ['#6cc0f5', '#9ad6fa', '#c8ebfd'], wall: '#f1eee3', wallLine: '#e5e1d3', bld: '#5f87ad', bld2: '#4c7299', desk: ['#cb9a66', '#b98757', '#946640'], stars: false, lit: false },
  { sky: ['#f7c27a', '#fbd9a0', '#fde9c4'], wall: '#eddcc3', wallLine: '#e0cdb2', bld: '#9b7f86', bld2: '#826a75', desk: ['#c28a55', '#b07a48', '#8a5c34'], stars: false, lit: false },
  { sky: ['#5a4a8a', '#c8627a', '#f6a56b'], wall: '#c9b3a8', wallLine: '#bba396', bld: '#4d3f66', bld2: '#3d3355', desk: ['#a87448', '#966538', '#744a28'], stars: false, lit: true },
  { sky: ['#0f1630', '#1b2548', '#2a3560'], wall: '#7c829c', wallLine: '#70768f', bld: '#161d38', bld2: '#10162c', desk: ['#7a5636', '#6a4a2e', '#503820'], stars: true, lit: true },
];

export const stageFor = (timeFrac: number): number => clamp(Math.floor(timeFrac * 5), 0, 4);

/* ---------- 繪圖小工具 ---------- */

export type Ctx = CanvasRenderingContext2D;
export type Place = 'desk' | 'boss' | 'meeting' | 'pantry';

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: string): void {
  ctx.fillStyle = c;
  let dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  dx = 0;
}

/** 固定亂數,讓天際線每次畫出來都一樣 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function drawPlant(ctx: Ctx, x: number, baseY: number, big: boolean): void {
  const pot = '#c9704a';
  const potD = '#a2563a';
  const g1 = '#4a9a5a';
  const g2 = '#2f7a45';
  const w = big ? 9 : 7;
  rect(ctx, x, baseY - 6, w, 6, pot);
  rect(ctx, x, baseY - 6, w, 1, potD);
  rect(ctx, x + 1, baseY - 1, w - 2, 1, potD);
  const cx = x + Math.floor(w / 2);
  rect(ctx, cx, baseY - 12, 1, 6, g2);
  rect(ctx, cx - 3, baseY - 12, 3, 2, g1);
  rect(ctx, cx + 1, baseY - 14, 3, 2, g1);
  rect(ctx, cx - 2, baseY - 15, 2, 3, g2);
  rect(ctx, cx + 1, baseY - 11, 3, 2, g2);
  if (big) {
    rect(ctx, cx - 4, baseY - 9, 3, 2, g2);
    rect(ctx, cx + 2, baseY - 17, 2, 3, g1);
  }
}

/** 窗戶:框、天空、天際線、雲或星星 */
export function paintWindow(ctx: Ctx, win: Rect, st: Stage): void {
  rect(ctx, win.x - 2, win.y - 2, win.w + 4, win.h + 4, '#3a4150');
  const bandH = Math.ceil(win.h / 3);
  for (let i = 0; i < 3; i++) rect(ctx, win.x, win.y + i * bandH, win.w, Math.min(bandH, win.h - i * bandH), st.sky[i]);
  const rnd = seeded(7);
  const baseY = win.y + win.h;
  for (let x = 0; x < win.w;) {
    const bw = 4 + Math.floor(rnd() * 6);
    const bh = 6 + Math.floor(rnd() * Math.max(6, win.h * 0.55));
    const w = Math.min(bw, win.w - x);
    rect(ctx, win.x + x, baseY - bh, w, bh, rnd() > 0.5 ? st.bld : st.bld2);
    if (st.lit) {
      for (let wy = baseY - bh + 2; wy < baseY - 2; wy += 3) {
        for (let wx = win.x + x + 1; wx < win.x + x + w - 1; wx += 2) {
          if (rnd() > 0.55) rect(ctx, wx, wy, 1, 1, '#ffd978');
        }
      }
    }
    x += w + (rnd() > 0.6 ? 1 : 0);
  }
  if (st.stars) {
    const sr = seeded(11);
    for (let i = 0; i < Math.round(win.w / 5); i++) rect(ctx, win.x + Math.floor(sr() * win.w), win.y + Math.floor(sr() * (win.h * 0.45)), 1, 1, '#e8eeff');
  } else {
    // 雲
    rect(ctx, win.x + 4, win.y + 4, 8, 2, '#ffffff');
    rect(ctx, win.x + 6, win.y + 3, 5, 1, '#ffffff');
    rect(ctx, win.x + win.w - 16, win.y + 9, 9, 2, '#ffffff');
    rect(ctx, win.x + win.w - 14, win.y + 8, 5, 1, '#ffffff');
  }
  // 窗框十字與窗台
  rect(ctx, win.x + Math.floor(win.w / 2), win.y, 1, win.h, '#3a4150');
  rect(ctx, win.x - 3, win.y + win.h + 2, win.w + 6, 2, '#d8d2c4');

}

/* ---------- 靜態底圖(每個尺寸、每個時段只畫一次) ---------- */

function paintBackground(ctx: Ctx, L: SceneLayout, st: Stage, mate?: Style): void {
  const { W, H, topH, deskY, mon, scr, win } = L;

  // 牆面
  rect(ctx, 0, 0, W, deskY, st.wall);
  for (let x = 10; x < W; x += 14) rect(ctx, x, 0, 1, deskY, st.wallLine);
  rect(ctx, 0, topH - 1, W, 1, st.wallLine);

  paintWindow(ctx, win, st);

  // 牆上的鐘(指針之後再畫)
  const c = L.clock;
  rect(ctx, c.cx - c.r, c.cy - c.r + 1, c.r * 2 + 1, c.r * 2 - 1, '#2a2f3a');
  rect(ctx, c.cx - c.r + 1, c.cy - c.r, c.r * 2 - 1, c.r * 2 + 1, '#2a2f3a');
  rect(ctx, c.cx - c.r + 1, c.cy - c.r + 2, c.r * 2 - 1, c.r * 2 - 3, '#f6f3ea');
  rect(ctx, c.cx - c.r + 2, c.cy - c.r + 1, c.r * 2 - 3, c.r * 2 - 1, '#f6f3ea');
  for (const [dx, dy] of [[0, -(c.r - 1)], [0, c.r - 1], [-(c.r - 1), 0], [c.r - 1, 0]]) rect(ctx, c.cx + dx, c.cy + dy, 1, 1, '#2a2f3a');

  // 兩側的盆栽(畫面夠寬才有)
  if (mon.x >= 14) {
    drawPlant(ctx, mon.x - 12, deskY, true);
    drawPlant(ctx, mon.x + mon.w + 4, deskY, true);
  }

  // 隔壁座位的同事:從螢幕後面探出頭來(牆面右欄有空位才畫,避開時鐘)
  if (mate) {
    const room = topH - 2 - (L.clock.cy + L.clock.r + 3);
    if (room >= 19) drawMate(ctx, mon.x + mon.w - Math.floor(L.rightW / 2) - 2, topH + 1, mate, 1);
  }

  // 桌面
  rect(ctx, 0, deskY, W, H - deskY, st.desk[1]);
  rect(ctx, 0, deskY, W, 3, st.desk[0]);
  rect(ctx, 0, deskY + 3, W, 1, st.desk[2]);
  for (let y = deskY + 9; y < H; y += 6) rect(ctx, 0, y, W, 1, st.desk[2]);

  // 螢幕外殼
  rect(ctx, mon.x, mon.y, mon.w, mon.h, '#2a2f3a');
  rect(ctx, mon.x, mon.y, mon.w, 1, '#434b5e');
  rect(ctx, mon.x, mon.y, 1, mon.h, '#434b5e');
  rect(ctx, scr.x - 1, scr.y - 1, scr.w + 2, scr.h + 2, '#0c1219');
  rect(ctx, scr.x, scr.y, scr.w, scr.h, '#14202b');
  // 下巴:電源燈與品牌小標
  rect(ctx, mon.x + mon.w - 8, scr.y + scr.h + 4, 2, 1, st.lit ? '#ffb347' : '#4cd4a0');
  rect(ctx, mon.x + Math.floor(mon.w / 2) - 3, scr.y + scr.h + 4, 6, 1, '#4a5368');
  // 底座
  rect(ctx, mon.x + Math.floor(mon.w / 2) - 14, deskY + 3, 28, 2, '#1d2230');

  // 螢幕兩側的桌面小物件(空間夠才畫)
  const rightRoom = W - (mon.x + mon.w);
  if (rightRoom >= 22) {
    // 咖啡杯
    const mx = mon.x + mon.w + 6;
    rect(ctx, mx, deskY - 7, 7, 7, '#f4f1ea');
    rect(ctx, mx + 1, deskY - 6, 5, 2, '#5a3a22');
    rect(ctx, mx + 7, deskY - 5, 2, 3, '#f4f1ea');
    // 便利貼
    rect(ctx, mon.x - 15, deskY - 24, 6, 6, '#ffe27a');
    rect(ctx, mon.x - 15, deskY - 17, 6, 6, '#ff9ab0');
  }
  void topH;
}

const bgCache = new Map<string, HTMLCanvasElement>();

/** 畫整個場景。timeFrac:0 = 一天開始,1 = 一天結束 */
export function renderOffice(canvas: HTMLCanvasElement, L: SceneLayout, timeFrac: number, mate?: Style): void {
  if (canvas.width !== L.W || canvas.height !== L.H) {
    canvas.width = L.W;
    canvas.height = L.H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = stageFor(timeFrac);
  const key = `${L.W}x${L.H}:${stage}:${mate ?? ''}`;
  let bg = bgCache.get(key);
  if (!bg) {
    bg = document.createElement('canvas');
    bg.width = L.W;
    bg.height = L.H;
    const bctx = bg.getContext('2d');
    if (bctx) paintBackground(bctx, L, STAGES[stage], mate);
    if (bgCache.size > 12) bgCache.clear();
    bgCache.set(key, bg);
  }
  ctx.drawImage(bg, 0, 0);
  // 鐘的指針:一天從 9:00 走到 18:00
  const hours = 9 + clamp(timeFrac, 0, 1) * 9;
  const c = L.clock;
  const mAng = ((hours % 1) * 2 * Math.PI) - Math.PI / 2;
  const hAng = (((hours % 12) / 12) * 2 * Math.PI) - Math.PI / 2;
  line(ctx, c.cx, c.cy, c.cx + Math.round(Math.cos(mAng) * (c.r - 2)), c.cy + Math.round(Math.sin(mAng) * (c.r - 2)), '#2a2f3a');
  line(ctx, c.cx, c.cy, c.cx + Math.round(Math.cos(hAng) * (c.r - 4)), c.cy + Math.round(Math.sin(hAng) * (c.r - 4)), '#c0392b');
}

/* ---------- 小圖示(UI 用):文字描述的像素圖轉成圖片網址 ---------- */

export function spriteURL(rows: string[], palette: Record<string, string>, scale = 1): string {
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = palette[ch];
      if (col) rect(ctx, x * scale, y * scale, scale, scale, col);
    });
  });
  return cv.toDataURL('image/png');
}

/** 咖啡杯:10x10,四周留白,杯子排在一起時不會互相黏住 */
export const CUP_FULL = [
  '..........',
  '...s.s....',
  '....s.s...',
  '.oooooo...',
  '.okkkko...',
  '.owwwwooo.',
  '.owwwwo.o.',
  '.owwwwooo.',
  '..oooo....',
  '..........',
];
export const CUP_EMPTY = [
  '..........',
  '..........',
  '..........',
  '.oooooo...',
  '.oeeeeo...',
  '.oeeeeooo.',
  '.oeeeeo.o.',
  '.oeeeeooo.',
  '..oooo....',
  '..........',
];
export const CUP_PALETTE = { o: '#2a2f3a', w: '#e8785a', k: '#7a4a28', e: '#b9c0c9', s: '#ffffff' };

/** 警報燈:危急時掛在牆上閃爍 */
export const SIREN = [
  '..oooo..',
  '.orrrro.',
  'orRrrrro',
  'orRrrrro',
  'orrrrrro',
  'oooooooo',
  'obbbbbbo',
  'oooooooo',
];
export const SIREN_PALETTE = { o: '#2a2f3a', r: '#e03c32', R: '#ffb3ab', b: '#59637a' };
