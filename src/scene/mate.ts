/** 同事的像素剪影:依擅長的風格換上不同的小配件。自成一檔,辦公室與茶水間都用得到 */
import type { Style } from '../types';

export const MATE_COLOR: Record<Style, string> = {
  open: '#4aa3df', private: '#e88ab0', quiet: '#8a96a8', generous: '#e2b94b', rigor: '#4cd4a0', fast: '#ff8a3d', hustle: '#e0453a',
};

/** cx、baseY:腳底中心;m:放大倍數(1 單位 = m 個內部像素) */
export function drawMate(ctx: CanvasRenderingContext2D, cx: number, baseY: number, style: Style, m: number): void {
  const body = '#1b1f2a';
  const edge = '#303850';
  const col = MATE_COLOR[style];
  const u = (ux: number, uy: number, uw: number, uh: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(cx + ux * m), Math.round(baseY + uy * m), Math.round(uw * m), Math.round(uh * m));
  };
  // 身體、肩線、頭
  u(-6, -8, 12, 8, body);
  u(-5, -9, 10, 1, body);
  u(-6, -8, 1, 8, edge);
  u(-6, -8, 12, 1, col);
  u(-1, -11, 2, 3, body);
  u(-3, -17, 6, 6, body);
  u(-2, -18, 4, 1, body);
  u(-3, -17, 1, 6, edge);
  switch (style) {
    case 'open': u(-3, -10, 6, 2, col); break; // 圍巾
    case 'private': u(4, -23, 6, 4, col); u(5, -19, 1, 2, col); u(5, -22, 4, 1, '#ffffff'); break; // 對話框
    case 'quiet': u(-4, -18, 8, 2, col); u(-4, -16, 1, 3, col); break; // 連帽
    case 'generous': u(5, -6, 6, 6, col); u(7, -6, 2, 6, '#c0392b'); u(5, -4, 6, 1, '#c0392b'); break; // 禮物盒
    case 'rigor': u(-3, -15, 2, 1, '#e8f4ff'); u(1, -15, 2, 1, '#e8f4ff'); u(5, -8, 6, 8, '#f4efe0'); u(6, -6, 4, 1, col); u(6, -4, 4, 1, col); break; // 眼鏡與資料夾
    case 'fast': u(-3, -16, 6, 1, col); u(-1, -6, 3, 1, col); u(0, -5, 2, 1, col); break; // 頭帶與閃電
    case 'hustle': u(-3, -16, 6, 1, col); u(5, -7, 4, 5, '#f4f1ea'); u(6, -6, 2, 2, '#5a3a22'); u(9, -6, 1, 3, '#f4f1ea'); break; // 頭巾與大杯咖啡
  }
}
