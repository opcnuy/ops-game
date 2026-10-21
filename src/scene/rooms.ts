/** 其他地點的像素場景:老闆辦公室、會議室、茶水間(人物都是剪影) */
import { STAGES, clamp, drawPlant, paintWindow, rect, seeded, stageFor } from './office';
import type { Ctx, Place, SceneLayout } from './office';
import { drawMate } from './mate';
import type { Style } from '../types';

export type Room = Exclude<Place, 'desk'>;

export const ROOMS: Record<Room, { name: string; icon: string; who: string }> = {
  boss: { name: '老闆辦公室', icon: '🏢', who: '林總' },
  meeting: { name: '會議室', icon: '📹', who: '原廠代表' },
  pantry: { name: '茶水間', icon: '☕', who: '同事' },
};

export type Person = 'boss' | 'vendor' | 'coworker' | 'planner' | 'engineer' | 'support';

/** 剪影:深色輪廓加一點身分特徵。m 是放大倍數(1 單位 = m 個內部像素) */
export function drawPerson(ctx: Ctx, cx: number, baseY: number, kind: Person, m: number): void {
  const body = '#1b1f2a';
  const edge = '#303850';
  const u = (ux: number, uy: number, uw: number, uh: number, c: string) => rect(ctx, cx + ux * m, baseY + uy * m, uw * m, uh * m, c);
  // 身體與肩膀
  u(-6, -8, 12, 8, body);
  u(-5, -9, 10, 1, body);
  u(-6, -8, 1, 8, edge);
  // 脖子與頭
  u(-1, -11, 2, 3, body);
  u(-3, -17, 6, 6, body);
  u(-2, -18, 4, 1, body);
  u(-3, -17, 1, 6, edge);
  if (kind === 'boss') {
    u(-1, -9, 2, 7, '#c0392b'); // 領帶
    u(-2, -9, 4, 1, '#e8e4da'); // 領口
  } else if (kind === 'vendor') {
    u(-1, -8, 2, 5, '#e2c14b'); // 識別證
    u(5, -4, 6, 5, '#394a63'); // 手提電腦
  } else if (kind === 'planner') {
    u(-1, -20, 2, 2, body); // 髮髻
    u(-1, -8, 2, 3, '#e2c14b'); // 識別證
  } else if (kind === 'engineer') {
    u(-4, -18, 8, 1, '#4cd4a0'); // 耳機頭帶
    u(-4, -17, 1, 4, '#4cd4a0');
    u(3, -17, 1, 4, '#4cd4a0');
    u(-6, -8, 12, 2, '#2a3a5a'); // 連帽衣
  } else if (kind === 'support') {
    u(-4, -16, 1, 4, '#e8785a'); // 頭戴式耳麥
    u(-4, -12, 3, 1, '#e8785a');
    u(-3, -18, 6, 1, '#e8785a');
  } else {
    u(-5, -10, 10, 2, body); // 連帽衣領
    u(5, -6, 3, 3, '#e8785a'); // 馬克杯
    u(8, -5, 1, 1, '#e8785a');
  }
}

function tile(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, line: string, step: number): void {
  rect(ctx, x, y, w, h, base);
  for (let xx = x; xx < x + w; xx += step) rect(ctx, xx, y, 1, h, line);
  for (let yy = y; yy < y + h; yy += step) rect(ctx, x, yy, w, 1, line);
}

function paintBoss(ctx: Ctx, L: SceneLayout, stage: number): void {
  const { W, H } = L;
  const rh = L.dlg.y;
  const st = STAGES[stage];
  rect(ctx, 0, 0, W, rh, '#46685b');
  for (let x = 8; x < W; x += 12) rect(ctx, x, 0, 1, rh, '#3f5f53');
  rect(ctx, 0, rh - 34, W, 34, '#385549');
  rect(ctx, 0, rh - 35, W, 1, '#c9b27a');
  rect(ctx, 0, rh, W, H - rh, '#5a4a63');
  for (let y = rh + 3; y < H; y += 5) rect(ctx, 0, y, W, 1, '#4e3f57');
  // 窗戶(右)與書架(左)
  paintWindow(ctx, { x: W - 50, y: 10, w: 40, h: 46 }, st);
  const rnd = seeded(21);
  rect(ctx, 6, 10, 34, 56, '#6a4a2e');
  for (let r = 0; r < 3; r++) {
    const y = 12 + r * 18;
    rect(ctx, 8, y + 14, 30, 2, '#4f351f');
    let x = 9;
    while (x < 36) {
      const w = 2 + Math.floor(rnd() * 3);
      const h = 8 + Math.floor(rnd() * 5);
      rect(ctx, x, y + 14 - h, w, h, ['#c0392b', '#2e6f9e', '#d9b84a', '#4a9a5a', '#8a5aa8'][Math.floor(rnd() * 5)]);
      x += w + 1;
    }
  }
  // 獎狀
  rect(ctx, Math.floor(W / 2) - 9, 14, 18, 13, '#c9b27a');
  rect(ctx, Math.floor(W / 2) - 8, 15, 16, 11, '#f4efe0');
  rect(ctx, Math.floor(W / 2) - 5, 19, 10, 1, '#9aa3ad');
  rect(ctx, Math.floor(W / 2) - 5, 22, 7, 1, '#9aa3ad');
  // 椅背、老闆、辦公桌
  const cx = Math.floor(W / 2);
  rect(ctx, cx - 14, rh - 58, 28, 36, '#6b7690');
  rect(ctx, cx - 13, rh - 59, 26, 1, '#6b7690');
  rect(ctx, cx - 14, rh - 58, 2, 36, '#58627a');
  drawPerson(ctx, cx, rh - 23, 'boss', 2);
  rect(ctx, 10, rh - 26, W - 20, 5, '#8a5a34');
  rect(ctx, 10, rh - 21, W - 20, 21, '#6b4527');
  rect(ctx, 10, rh - 21, W - 20, 1, '#4f351f');
  rect(ctx, cx - 9, rh - 13, 18, 4, '#d9b84a');
  rect(ctx, 14, rh - 30, 8, 4, '#394a63');
  drawPlant(ctx, W - 28, rh - 26, false);
}

function paintMeeting(ctx: Ctx, L: SceneLayout, crowd: boolean): void {
  const { W, H } = L;
  const rh = L.dlg.y;
  rect(ctx, 0, 0, W, rh, '#d9dde2');
  for (let x = 6; x < W; x += 16) rect(ctx, x, 0, 1, rh, '#cdd2d8');
  rect(ctx, 0, rh - 30, W, 30, '#c3c9d1');
  tile(ctx, 0, rh, W, H - rh, '#7a8088', '#70767d', 8);
  // 白板
  const bw = Math.min(62, Math.floor(W * 0.52));
  rect(ctx, 6, 10, bw, 44, '#9aa3ad');
  rect(ctx, 8, 12, bw - 4, 40, '#f7f8fa');
  const rnd = seeded(5);
  for (let i = 0; i < 4; i++) rect(ctx, 11, 16 + i * 6, 14 + Math.floor(rnd() * (bw - 26)), 1, i % 2 ? '#2e6f9e' : '#c0392b');
  rect(ctx, bw - 18, 14, 7, 7, '#ffe27a');
  rect(ctx, bw - 9, 20, 7, 7, '#ff9ab0');
  rect(ctx, bw - 20, 30, 7, 7, '#9be29b');
  // 電視:視訊畫面裡是原廠代表
  const tx = W - 54;
  rect(ctx, tx, 12, 46, 32, '#1d2230');
  rect(ctx, tx + 2, 14, 42, 28, '#2d5b8a');
  rect(ctx, tx + 2, 14, 42, 4, '#26507a');
  if (crowd) {
    // 討論中:電視上放簡報圖表,沒有視訊對象
    rect(ctx, tx + 6, 34, 5, 6, '#e8785a');
    rect(ctx, tx + 14, 28, 5, 12, '#4cd4a0');
    rect(ctx, tx + 22, 22, 5, 18, '#ffe27a');
    rect(ctx, tx + 30, 30, 5, 10, '#9ab8e8');
    rect(ctx, tx + 5, 41, 34, 1, '#9ab8e8');
  } else {
    drawPerson(ctx, tx + 23, 41, 'vendor', 1);
    rect(ctx, tx + 30, 20, 12, 8, '#3a6f9e');
    rect(ctx, tx + 4, 20, 10, 8, '#3a6f9e');
  }
  rect(ctx, tx + 21, 44, 4, 4, '#1d2230');
  // 長桌與椅背
  rect(ctx, 14, rh - 34, 14, 14, '#2b3042');
  rect(ctx, W - 28, rh - 34, 14, 14, '#2b3042');
  if (crowd) {
    // 圍著長桌討論的三位同事(剪影),桌子會擋住下半身
    const kinds: Person[] = ['planner', 'engineer', 'support'];
    [0.22, 0.5, 0.78].forEach((f, i) => drawPerson(ctx, Math.floor(W * f), rh - 17, kinds[i], 2));
  }
  rect(ctx, 8, rh - 22, W - 16, 4, '#c9a46f');
  rect(ctx, 8, rh - 18, W - 16, 18, '#a98652');
  rect(ctx, 8, rh - 18, W - 16, 1, '#8a6a3a');
  rect(ctx, 24, rh - 27, 10, 5, '#394a63');
  rect(ctx, W - 40, rh - 27, 10, 5, '#394a63');
  drawPlant(ctx, 8, rh - 22, false);
}

function paintPantry(ctx: Ctx, L: SceneLayout, mate?: Style): void {
  const { W, H } = L;
  const rh = L.dlg.y;
  tile(ctx, 0, 0, W, rh, '#cfe3d6', '#bcd4c6', 8);
  tile(ctx, 0, rh, W, H - rh, '#8c8f97', '#80838b', 8);
  rect(ctx, 0, rh - 2, W, 2, '#6f7480');
  // 吊燈
  rect(ctx, Math.floor(W / 2) - 1, 0, 2, 8, '#2a2f3a');
  rect(ctx, Math.floor(W / 2) - 7, 8, 14, 4, '#ffe27a');
  // 冰箱
  rect(ctx, W - 32, rh - 66, 22, 66, '#e7ebef');
  rect(ctx, W - 32, rh - 66, 22, 1, '#cfd5db');
  rect(ctx, W - 32, rh - 36, 22, 1, '#9aa3ad');
  rect(ctx, W - 14, rh - 58, 2, 10, '#6f7480');
  rect(ctx, W - 14, rh - 30, 2, 10, '#6f7480');
  // 流理台、咖啡機、微波爐
  rect(ctx, 6, rh - 26, W - 42, 4, '#e8e2d4');
  rect(ctx, 6, rh - 22, W - 42, 22, '#9a8f7a');
  rect(ctx, 6, rh - 22, W - 42, 1, '#7d7360');
  rect(ctx, 12, rh - 46, 16, 20, '#3a4150');
  rect(ctx, 14, rh - 44, 12, 5, '#2a2f3a');
  rect(ctx, 18, rh - 36, 4, 5, '#e8785a');
  rect(ctx, 24, rh - 31, 2, 2, '#c0392b');
  rect(ctx, W - 58, rh - 38, 18, 12, '#2a2f3a');
  rect(ctx, W - 56, rh - 36, 10, 8, '#4a5368');
  rect(ctx, W - 44, rh - 35, 2, 2, '#4cd4a0');
  // 同事剪影,手拿馬克杯
  if (mate) drawMate(ctx, Math.floor(W * 0.4), rh - 22, mate, 2);
  else drawPerson(ctx, Math.floor(W * 0.4), rh - 22, 'coworker', 2);
}

const roomCache = new Map<string, HTMLCanvasElement>();

export function renderRoom(canvas: HTMLCanvasElement, L: SceneLayout, room: Room, timeFrac: number, crowd = false, mate?: Style, frame = 0, forceStage?: number): void {
  if (canvas.width !== L.W || canvas.height !== L.H) {
    canvas.width = L.W;
    canvas.height = L.H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = forceStage ?? stageFor(timeFrac);
  const key = `${L.split ? 's' : ''}${L.W}x${L.H}:${room}:${stage}:${crowd ? 'c' : ''}:${mate ?? ''}`;
  let bg = roomCache.get(key);
  if (!bg) {
    bg = document.createElement('canvas');
    bg.width = L.W;
    bg.height = L.H;
    const c = bg.getContext('2d');
    if (c) {
      if (room === 'boss') paintBoss(c, L, stage);
      else if (room === 'meeting') paintMeeting(c, L, crowd);
      else paintPantry(c, L, mate);
      // 傍晚與夜晚:整體蓋一層色調
      if (stage === 3) rect(c, 0, 0, L.W, L.H, 'rgba(255,140,60,0.10)');
      if (stage === 4) rect(c, 0, 0, L.W, L.H, 'rgba(10,20,60,0.38)');
    }
    if (roomCache.size > 24) roomCache.clear();
    roomCache.set(key, bg);
  }
  ctx.drawImage(bg, 0, 0);
  paintRoomLive(ctx, L, room, crowd, frame);
  void clamp;
}

/** 房間裡會動的小地方:窗外的雲、視訊的錄影燈與簡報圖表、咖啡機的蒸氣 */
function paintRoomLive(ctx: Ctx, L: SceneLayout, room: Room, crowd: boolean, f: number): void {
  const { W } = L;
  const rh = L.dlg.y;
  if (room === 'boss') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(W - 50, 10, 40, 15);
    ctx.clip();
    for (let k = 0; k < 2; k++) {
      const cx = W - 50 + (((f * 0.5 + k * 24) % 58) - 10);
      rect(ctx, cx, 12 + k * 5, 9, 2, 'rgba(255,255,255,0.9)');
      rect(ctx, cx + 2, 11 + k * 5, 5, 1, 'rgba(255,255,255,0.9)');
    }
    ctx.restore();
    // 辦公桌上的小燈:偶爾閃一下,像在收信
    if (f % 8 < 2) rect(ctx, 16, rh - 31, 2, 1, '#ffd978');
  } else if (room === 'meeting') {
    const tx = W - 54;
    if (crowd) {
      rect(ctx, tx + 3, 19, 40, 22, '#2d5b8a');
      const base = [6, 12, 18, 10];
      const cols = ['#e8785a', '#4cd4a0', '#ffe27a', '#9ab8e8'];
      base.forEach((h, i) => {
        const hh = Math.max(3, h + Math.round(Math.sin((f + i * 2) / 2) * 3));
        rect(ctx, tx + 6 + i * 8, 40 - hh, 5, hh, cols[i]);
      });
      rect(ctx, tx + 5, 41, 34, 1, '#9ab8e8');
    } else if (f % 6 < 3) {
      rect(ctx, tx + 38, 16, 3, 3, '#e03c32');
    }
  } else {
    // 茶水間:咖啡機冒蒸氣、燈號閃爍
    for (let k = 0; k < 2; k++) {
      const s1 = (f + k * 3) % 6;
      rect(ctx, 17 + k * 4 + (s1 > 2 ? 1 : 0), rh - 50 - (s1 % 3), 1, 2, 'rgba(255,255,255,0.8)');
    }
    if (f % 4 < 2) rect(ctx, 24, rh - 31, 2, 2, '#ff6a5a');
  }
}
