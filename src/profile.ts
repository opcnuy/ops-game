import { storageKey } from './storage';
import { decodeCard } from './colleague';
import { ALL_UNLOCK, DEFAULT_UNLOCK, SHOP, curseById, roleById } from './cards';
import { sanitizePersona, type PersonaPoints } from './persona';

/** 跨局的職級、資歷與解鎖(存在玩家自己的瀏覽器) */
export interface Profile {
  v: 1;
  xp: number;
  runs: number;
  /** 已達成的成就 */
  ach: string[];
  /** 各事件跨局累計看過幾次(用來讓新局優先出現沒看過的事件) */
  seen?: Record<string, number>;
  /** 個人風格:各種做法累積的點數 */
  persona?: PersonaPoints;
  /** 收到的同事卡代碼(最多 5 張)與這局要帶的那一張(-1 = 不帶) */
  colleagues?: string[];
  colleagueSel?: number;
  /** 資歷(每局結算得到,在檔案室花掉)、已解鎖的項目、選的職位 */
  credits?: number;
  unlock?: string[];
  role?: string;
  /** 下一局要帶的挑戰(沒選就是空的) */
  curse?: string;
}

export interface LevelDef {
  lv: number;
  title: string;
  /** 達到此職級所需的累積經驗 */
  xp: number;
  /** 升到這級解鎖的內容(給玩家看的文字) */
  unlocks: string[];
}

export const LEVELS: LevelDef[] = [
  { lv: 1, title: '實習營運', xp: 0, unlocks: ['基本活動玩法與獎勵', '日常事件'] },
  { lv: 2, title: '營運專員', xp: 100, unlocks: ['活動:限時副本、限定造型、限定造型禮包、社群貼文宣傳', '新事件:法務條款、行銷合作、大額玩家、公會糾紛、績效面談等', '選項:翻譯類的事可以請窗口審稿'] },
  { lv: 3, title: '資深營運', xp: 300, unlocks: ['活動:爬塔競賽、免費十連抽券、實況主合作', '新事件:資料外流、預算縮減、實況主失言、雙重危機、檢討會推責任、原廠季度規劃、獵頭來訊', '選項:報表與新人的事可以授權給同事,省行動點'] },
  { lv: 4, title: '營運主管', xp: 600, unlocks: ['活動:豪華尊爵禮包', '新事件:原廠稽核、老闆與原廠的衝突、下一季預算與人力、新人闖禍、論壇長文抹黑'] },
  { lv: 5, title: '營運總監', xp: 1000, unlocks: ['全部內容解鎖', '最高職級(更多職位開發中)'] },
];

const KEY = storageKey('ops-game-profile');

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    if (p && p.v === 1 && typeof p.xp === 'number') {
      const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1e7, Math.max(0, v)) : d);
      const xp = n(p.xp, 0);
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : []);
      const prof: Profile = {
        v: 1, xp, runs: n(p.runs, 0),
        ach: list(p.ach), seen: sanitizeSeen(p.seen), persona: sanitizePersona(p.persona), ...sanitizeColleagues(p.colleagues, p.colleagueSel), ...sanitizeMeta(p.credits, p.unlock, p.role, p.curse),
      };
      // 舊版有技能樹與技能點:技能樹已併進策略,累計獲得的技能點一點換 10 資歷,只換一次
      const oldSp = (p as { sp?: unknown }).sp;
      if (oldSp !== undefined || (p as { skills?: unknown }).skills !== undefined) {
        prof.credits = (prof.credits ?? 0) + Math.round(n(oldSp, 0) * 10);
        saveProfile(prof);
      }
      return prof;
    }
  } catch { /* 讀不到就當新玩家 */ }
  return { v: 1, xp: 0, runs: 0, ach: [], credits: 0, unlock: [...DEFAULT_UNLOCK], role: 'intern' };
}

/** 讀檔時逐項檢查:資歷要是合理的數字,解鎖清單只留認得的項目並補上預設,職位要是已解鎖的 */
function sanitizeMeta(credits: unknown, unlock: unknown, role: unknown, curse?: unknown): { credits: number; unlock: string[]; role: string; curse?: string } {
  const c = typeof credits === 'number' && Number.isFinite(credits) ? Math.min(1e7, Math.max(0, Math.floor(credits))) : 0;
  const u = Array.isArray(unlock) ? (unlock as unknown[]).filter((x): x is string => typeof x === 'string' && ALL_UNLOCK.includes(x)) : [];
  const all = [...new Set([...DEFAULT_UNLOCK, ...u])];
  const r = typeof role === 'string' && roleById(role) && all.includes(role) ? role : 'intern';
  return { credits: c, unlock: all, role: r, curse: typeof curse === 'string' && curseById(curse) ? curse : undefined };
}

/** 在檔案室買一項:資歷夠、還沒解鎖才成立。回傳新的檔案或錯誤訊息 */
export function buyItem(p: Profile, id: string): { ok: true; profile: Profile } | { ok: false; msg: string } {
  const item = SHOP.find((x) => x.id === id);
  if (!item) return { ok: false, msg: '沒有這項' };
  const unlock = p.unlock ?? [...DEFAULT_UNLOCK];
  if (unlock.includes(id)) return { ok: false, msg: '已經解鎖' };
  const credits = p.credits ?? 0;
  if (credits < item.cost) return { ok: false, msg: `資歷不足(還差 ${item.cost - credits})` };
  return { ok: true, profile: { ...p, credits: credits - item.cost, unlock: [...unlock, id] } };
}

/** 升一級、每個成就第一次達成,各給多少資歷 */
export const CREDITS_PER_LEVEL = 20;
export const CREDITS_PER_ACH = 10;
export const MAX_COLLEAGUES = 5;

/** 讀檔時逐項檢查:只留能解開的代碼,選擇的編號也要在範圍內 */
function sanitizeColleagues(list: unknown, sel: unknown): { colleagues: string[]; colleagueSel: number } {
  const colleagues = Array.isArray(list)
    ? list.filter((x): x is string => typeof x === 'string' && x.length <= 40 && decodeCard(x) !== null).slice(0, MAX_COLLEAGUES) : [];
  const n = typeof sel === 'number' && Number.isInteger(sel) ? sel : -1;
  return { colleagues, colleagueSel: n >= 0 && n < colleagues.length ? n : -1 };
}

/** 讀檔時逐項檢查:鍵名要短、次數要合理,數量也設上限 */
function sanitizeSeen(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>).slice(0, 300)) {
    if (k.length <= 60 && typeof n === 'number' && Number.isFinite(n)) out[k] = Math.min(99, Math.max(0, Math.floor(n)));
  }
  return out;
}

/** 這一局的事件出現次數併進跨局累計 */
export function mergeSeen(p: Profile, runSeen: Record<string, number>): Record<string, number> {
  const out = { ...(p.seen ?? {}) };
  for (const [k, n] of Object.entries(runSeen)) out[k] = Math.min(99, (out[k] ?? 0) + n);
  return out;
}


export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 略過 */ }
}

export function levelFor(xp: number): LevelDef {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  return cur;
}

export function nextLevel(xp: number): LevelDef | undefined {
  return LEVELS.find((l) => l.xp > xp);
}
