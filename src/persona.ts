import type { Style } from './types';

/** 個人風格:每局用到的做法會累積成跨局的風格值,越常用越熟練 */
export type PersonaPoints = Partial<Record<Style, number>>;

export const STYLES: Style[] = ['open', 'private', 'quiet', 'generous', 'rigor', 'fast', 'hustle'];

/** 累積到這些點數,風格升到 Lv1、Lv2、Lv3 */
export const PERSONA_STEPS = [8, 24, 48];
/** 每局每種風格最多算幾點,避免一局猛按同一種就練滿 */
export const PERSONA_RUN_CAP = 12;
/** 每級讓該做法有不確定性的結果,成功率多 4% */
export const PERSONA_BOOST = 0.04;

export const PERSONA_INFO: Record<Style, { name: string; titles: [string, string, string]; blurb: string }> = {
  open: { name: '公開透明', titles: ['愛說明的人', '透明派', '公開透明的代言人'], blurb: '凡事攤開來講,玩家看得到你在做什麼。' },
  private: { name: '私下溝通', titles: ['愛私下聊的人', '溝通達人', '玩家的知心朋友'], blurb: '一對一把話說開,不讓事情上檯面。' },
  quiet: { name: '低調處理', titles: ['低調的人', '沉穩派', '不動聲色的老手'], blurb: '不聲張、不表態,讓事情自己過去。' },
  generous: { name: '補償讓步', titles: ['大方的人', '慷慨派', '有求必應的營運'], blurb: '願意讓一步,用誠意換信任。' },
  rigor: { name: '查證講證據', titles: ['愛查證的人', '查證派', '證據至上的稽核官'], blurb: '先查清楚再開口,凡事有憑有據。' },
  fast: { name: '快速簡化', titles: ['手腳快的人', '效率派', '閃電營運'], blurb: '抓重點、先動手,速度就是競爭力。' },
  hustle: { name: '親自硬扛', titles: ['肯扛的人', '拚命三郎', '一個人撐全場的超人'], blurb: '自己下場,多花力氣也要做到好。' },
};

export const personaLevel = (points = 0): number => PERSONA_STEPS.filter((n) => points >= n).length;

/** 帶進一局的熟練等級(整局固定) */
export function personaLevels(p: PersonaPoints): PersonaPoints {
  const out: PersonaPoints = {};
  for (const st of STYLES) { const l = personaLevel(p[st]); if (l > 0) out[st] = l; }
  return out;
}

/** 目前的稱號:點數最高的那種風格;還沒有任何一種到 Lv1 就沒有稱號 */
export function personaTitle(p: PersonaPoints): { style: Style; level: number; title: string } | undefined {
  const best = [...STYLES].sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0))[0];
  const level = personaLevel(p[best]);
  return level > 0 ? { style: best, level, title: PERSONA_INFO[best].titles[level - 1] } : undefined;
}

/** 讀檔時逐項檢查:只留認得的風格,點數限制在合理範圍 */
export function sanitizePersona(v: unknown, max = 9999): PersonaPoints {
  const out: PersonaPoints = {};
  if (!v || typeof v !== 'object') return out;
  for (const st of STYLES) {
    const n = (v as Record<string, unknown>)[st];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[st] = Math.min(max, Math.floor(n));
  }
  return out;
}

/** 這局的使用次數併進跨局累計,回傳新的累計與要顯示的說明 */
export function mergePersona(p: PersonaPoints, use: PersonaPoints): { next: PersonaPoints; lines: string[] } {
  const next: PersonaPoints = { ...p };
  const lines: string[] = [];
  for (const st of STYLES) {
    const add = Math.min(PERSONA_RUN_CAP, use[st] ?? 0);
    if (!add) continue;
    const from = p[st] ?? 0;
    const to = Math.min(9999, from + add);
    next[st] = to;
    const lv0 = personaLevel(from), lv1 = personaLevel(to);
    lines.push(`${PERSONA_INFO[st].name} +${add}${lv1 > lv0 ? `,升到 Lv${lv1}「${PERSONA_INFO[st].titles[lv1 - 1]}」` : ''}`);
  }
  return { next, lines };
}
