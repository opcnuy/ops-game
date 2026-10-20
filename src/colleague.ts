import { PERSONA_INFO, STYLES, personaLevel, personaTitle, type PersonaPoints } from './persona';
import type { Style } from './types';

/** 同事卡:只放風格值,不放名字。把個人風格打包成一段代碼,朋友貼進自己的遊戲,就會多一位同事 */
export interface Colleague { style: Style; level: number; title: string }

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VERSION = 1;
const MAX_POINT = 99;

function checksum(bytes: number[]): number {
  let h = 0x811c;
  for (const b of bytes) h = ((h ^ b) * 0x193) & 0xffff;
  return h;
}

function toBase32(bytes: number[]): string {
  let bits = 0; let acc = 0; let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(acc >> (bits - 5)) & 31]; bits -= 5; }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

function fromBase32(s: string): number[] | null {
  let bits = 0; let acc = 0; const out: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v; bits += 5;
    if (bits >= 8) { out.push((acc >> (bits - 8)) & 255); bits -= 8; acc &= (1 << bits) - 1; }
  }
  return out;
}

/** 目前的風格值 → 同事卡代碼;還沒有稱號(沒有任何一種風格到 Lv1)就沒有卡 */
export function encodeCard(p: PersonaPoints): string | null {
  if (!personaTitle(p)) return null;
  const body = [VERSION, ...STYLES.map((st) => Math.min(MAX_POINT, p[st] ?? 0))];
  const sum = checksum(body);
  const raw = toBase32([...body, sum >> 8, sum & 255]);
  return 'OPS-' + (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** 代碼 → 同事;格式或檢查碼不對就回傳 null */
export function decodeCard(input: string): Colleague | null {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^OPS/, '');
  const bytes = fromBase32(clean.replace(/O/g, '0').replace(/[IL]/g, '1'));
  if (!bytes || bytes.length < STYLES.length + 3) return null;
  const body = bytes.slice(0, STYLES.length + 1);
  if (body[0] !== VERSION) return null;
  if (checksum(body) !== ((bytes[STYLES.length + 1] << 8) | bytes[STYLES.length + 2])) return null;
  const p: PersonaPoints = {};
  STYLES.forEach((st, i) => { const n = body[i + 1]; if (n > 0 && n <= MAX_POINT) p[st] = n; });
  const t = personaTitle(p);
  return t ? { style: t.style, level: t.level, title: t.title } : null;
}

export const colleagueBlurb = (c: { style: Style; level: number }): string =>
  `擅長「${PERSONA_INFO[c.style].name}」:遇到這類做法會幫你分擔,但也偶爾自作主張。`;

export const colleagueLevel = (p: PersonaPoints, st: Style): number => personaLevel(p[st]);
