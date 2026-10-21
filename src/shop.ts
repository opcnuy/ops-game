/** 商店(示意用,不串金流):付費點只賣外觀與便利,不賣數值。購買只記在這個瀏覽器的存檔裡 */

export type ProductKind = 'theme' | 'pet' | 'perk' | 'ticket' | 'month' | 'bundle';

export interface Product {
  id: string;
  kind: ProductKind;
  icon: string;
  name: string;
  desc: string;
  /** 示意價格(新台幣) */
  price: number;
  /** 買斷型:已擁有就不能再買 */
  once?: boolean;
}

export const PRODUCTS: Product[] = [
  { id: 'starter', kind: 'bundle', icon: '🎁', name: '首購禮包', desc: '重抽券 ×10、貓咪、櫻花辦公室', price: 30, once: true },
  { id: 'month', kind: 'month', icon: '🗓️', name: '營運月卡', desc: '30 天:快速模式、每局 2 次免費重抽', price: 90 },
  { id: 'theme_dusk', kind: 'theme', icon: '🌇', name: '黃昏辦公室', desc: '整天都是夕陽的辦公室', price: 30, once: true },
  { id: 'theme_night', kind: 'theme', icon: '🌃', name: '夜景辦公室', desc: '整天都是夜景,窗外亮著燈', price: 30, once: true },
  { id: 'theme_sakura', kind: 'theme', icon: '🌸', name: '櫻花辦公室', desc: '粉色牆面與暖色桌面', price: 30, once: true },
  { id: 'pet_cat', kind: 'pet', icon: '🐈', name: '貓咪', desc: '桌上多一隻會甩尾巴的貓', price: 30, once: true },
  { id: 'fast', kind: 'perk', icon: '⏩', name: '快速模式', desc: '跳過轉場與動畫,操作更俐落', price: 60, once: true },
  { id: 'slots', kind: 'perk', icon: '👥', name: '同事欄位擴充', desc: '同事卡可存的張數 5 → 8', price: 30, once: true },
  { id: 'tickets10', kind: 'ticket', icon: '🔄', name: '重抽券 ×10', desc: '升級時不喜歡候選,可以重抽', price: 30 },
  { id: 'tickets30', kind: 'ticket', icon: '🔄', name: '重抽券 ×30', desc: '比單買省一些', price: 75 },
];

export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);

/** 外觀主題:對應場景的時段色盤(5 = 櫻花) */
export const THEMES: Record<string, { name: string; stage: number }> = {
  theme_dusk: { name: '黃昏', stage: 3 },
  theme_night: { name: '夜景', stage: 4 },
  theme_sakura: { name: '櫻花', stage: 5 },
};

export const MONTH_FREE_REROLLS = 2;
const DAY = 86400000;

export interface ShopState {
  owned: string[];
  tickets: number;
  /** 月卡到期時間(毫秒時間戳),0 = 沒有 */
  monthUntil: number;
  /** 目前套用的主題(商品 id,空 = 預設) */
  theme: string;
  /** 貓咪有沒有擺出來 */
  pet: boolean;
  /** 快速模式有沒有打開 */
  fast: boolean;
  log: { id: string; price: number; ts: number }[];
}

export const emptyShop = (): ShopState => ({ owned: [], tickets: 0, monthUntil: 0, theme: '', pet: false, fast: false, log: [] });

export function sanitizeShop(v: unknown): ShopState {
  const out = emptyShop();
  if (!v || typeof v !== 'object') return out;
  const r = v as Record<string, unknown>;
  const num = (x: unknown, hi: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(0, Math.floor(x))) : 0);
  const known = (id: unknown): id is string => typeof id === 'string' && !!productById(id);
  out.owned = Array.isArray(r.owned) ? [...new Set((r.owned as unknown[]).filter(known).filter((id) => productById(id)!.once))].slice(0, 20) : [];
  out.tickets = num(r.tickets, 9999);
  out.monthUntil = num(r.monthUntil, 4102444800000);
  out.theme = typeof r.theme === 'string' && THEMES[r.theme] && out.owned.includes(r.theme) ? r.theme : '';
  out.pet = r.pet === true && out.owned.includes('pet_cat');
  out.fast = r.fast === true;
  out.log = Array.isArray(r.log) ? (r.log as { id?: unknown; price?: unknown; ts?: unknown }[]).filter((x) => x && known(x.id)).slice(-50)
    .map((x) => ({ id: x.id as string, price: num(x.price, 99999), ts: num(x.ts, 4102444800000) })) : [];
  return out;
}

export const monthActive = (sh: ShopState, now = Date.now()): boolean => sh.monthUntil > now;
/** 快速模式:買了、或月卡期間,而且玩家有打開 */
export const fastOn = (sh: ShopState, now = Date.now()): boolean => sh.fast && (sh.owned.includes('fast') || monthActive(sh, now));
export const canFast = (sh: ShopState, now = Date.now()): boolean => sh.owned.includes('fast') || monthActive(sh, now);
export const colleagueSlots = (sh: ShopState): number => (sh.owned.includes('slots') ? 8 : 5);
export const totalSpent = (sh: ShopState): number => sh.log.reduce((a, x) => a + x.price, 0);

/** 示意購買:不扣款,只更新存檔裡的擁有與紀錄 */
export function purchase(sh: ShopState, id: string, now = Date.now()): { ok: true; shop: ShopState; gain: string } | { ok: false; msg: string } {
  const p = productById(id);
  if (!p) return { ok: false, msg: '沒有這項商品' };
  if (p.once && sh.owned.includes(id)) return { ok: false, msg: '已經擁有' };
  const next: ShopState = { ...sh, owned: [...sh.owned], log: [...sh.log, { id, price: p.price, ts: now }].slice(-50) };
  let gain = `${p.name}`;
  if (id === 'starter') {
    next.owned.push('starter', 'pet_cat', 'theme_sakura'); next.tickets += 10; next.pet = true; gain = '重抽券 ×10、貓咪、櫻花辦公室';
  } else if (id === 'month') {
    next.monthUntil = Math.max(now, sh.monthUntil) + 30 * DAY; gain = '月卡 30 天';
  } else if (id === 'tickets10') { next.tickets += 10; gain = '重抽券 ×10'; }
  else if (id === 'tickets30') { next.tickets += 30; gain = '重抽券 ×30'; }
  else {
    next.owned.push(id);
    if (THEMES[id] && !next.theme) next.theme = id;
    if (id === 'pet_cat') next.pet = true;
    if (id === 'fast') next.fast = true;
  }
  next.owned = [...new Set(next.owned)];
  return { ok: true, shop: next, gain };
}
