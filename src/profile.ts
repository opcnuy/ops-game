import { sanitizeSkills, skillById } from './skills';
import { storageKey } from './storage';

/** 跨局的職級與技能(存在玩家自己的瀏覽器) */
export interface Profile {
  v: 1;
  xp: number;
  runs: number;
  /** 累計獲得的技能點(升級每級 +2,成就每個 +1) */
  sp: number;
  /** 已學會的技能 */
  skills: string[];
  /** 已達成的成就 */
  ach: string[];
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
  { lv: 2, title: '營運專員', xp: 100, unlocks: ['活動:限時副本、限定造型、限定造型禮包、社群貼文宣傳', '新事件:法務條款、行銷合作、大額玩家、公會糾紛等'] },
  { lv: 3, title: '資深營運', xp: 300, unlocks: ['活動:爬塔競賽、免費十連抽券、實況主合作', '新事件:資料外流、預算縮減、實況主失言、雙重危機'] },
  { lv: 4, title: '營運主管', xp: 600, unlocks: ['活動:豪華尊爵禮包', '新事件:原廠稽核、老闆與原廠的衝突'] },
  { lv: 5, title: '營運總監', xp: 1000, unlocks: ['全部內容解鎖', '最高職級(更多職位開發中)'] },
];

const KEY = storageKey('ops-game-profile');

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    if (p && p.v === 1 && typeof p.xp === 'number') {
      // 舊存檔沒有技能點:依目前職級補發升級獎勵
      const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1e7, Math.max(0, v)) : d);
      const xp = n(p.xp, 0);
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : []);
      return {
        v: 1, xp, runs: n(p.runs, 0),
        sp: n(p.sp, (levelFor(xp).lv - 1) * SP_PER_LEVEL),
        skills: sanitizeSkills(list(p.skills)), ach: list(p.ach),
      };
    }
  } catch { /* 讀不到就當新玩家 */ }
  return { v: 1, xp: 0, runs: 0, sp: 0, skills: [], ach: [] };
}

export const SP_PER_LEVEL = 2;

export function spentSp(p: Profile): number {
  return p.skills.reduce((n, id) => n + (skillById(id)?.cost ?? 0), 0);
}

export const availableSp = (p: Profile): number => p.sp - spentSp(p);

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
