import type { Effects } from './types';

/** 看輿情之後的持續狀態(有天數,會顯示在收件匣上方) */
export type BuffId = 'trustUp' | 'prepared' | 'bossAmp' | 'hype' | 'tired';

export const BUFFS: Record<BuffId, { icon: string; name: string; desc: string }> = {
  trustUp: { icon: '🤝', name: '玩家挺你', desc: '信任的得分多 25%' },
  prepared: { icon: '🧯', name: '有備而來', desc: '客訴、輿情事件的選項少花 1 點' },
  bossAmp: { icon: '🔔', name: '老闆在看', desc: '老闆好感的得失都放大 30%' },
  hype: { icon: '🔥', name: '話題熱度', desc: '每天玩家人數 +0.3%' },
  tired: { icon: '😮‍💨', name: '心很累', desc: '明天少 1 點行動點數' },
};

export interface ScoutCard {
  id: string;
  icon: string;
  /** 看到的情境 */
  name: string;
  /** 你要做的事 */
  action: string;
  /** 會得到什麼;有代價的也寫在這裡 */
  gain: string;
  ap: number;
  weight: number;
  /** 偏壞的卡:抽卡時至少會有一張不是壞的 */
  bad?: boolean;
  effects?: Effects;
  buff?: { id: BuffId; days: number };
  /** 把某個習慣歸零 */
  clearHabit?: string;
  /** 直接減少待填日報 */
  reports?: number;
  /** 明天多出一件客訴或輿情事件 */
  complaintTomorrow?: boolean;
  /** 選下去之後顯示的結果 */
  result: string;
  /** 只有符合條件時才會出現在抽卡裡 */
  needs?: 'reports';
}

export const SCOUT_CARDS: ScoutCard[] = [
  { id: 'allies', icon: '🤝', name: '核心玩家在替官方說話', action: '出面感謝、跟他們互動', gain: '接下來 3 天,信任的得分多 25%', ap: 0, weight: 3,
    buff: { id: 'trustUp', days: 3 }, result: '幾位老玩家在討論串幫你說話,官方的話突然比較有人信了。' },
  { id: 'guide', icon: '📖', name: '玩家自製的攻略爆紅', action: '轉發並標註作者', gain: '玩家人數 +1%', ap: 0, weight: 3,
    effects: { players: 1 }, result: '新手攻略被大量轉發,不少人因此回來玩。' },
  { id: 'calm', icon: '🌿', name: '討論區一片平靜', action: '留言回覆幾則', gain: '信任 +1', ap: 0, weight: 3,
    effects: { trust: 1 }, result: '今天的討論區很平靜。你有在看,玩家感覺得到。' },
  { id: 'brewing', icon: '🚨', name: '論壇有人在串連抱怨', action: '先把處理方式想好', gain: '接下來 2 天,客訴與輿情事件的選項少花 1 點(代價:明天會多一件客訴或輿情)', ap: 0, weight: 2,
    complaintTomorrow: true, buff: { id: 'prepared', days: 2 }, result: '你提前看到風向不對,先把處理方式想好了。' },
  { id: 'defuse', icon: '🧯', name: '有幾串討論開始燒起來', action: '先去回話降溫', gain: '信任 +2,並清掉「忽視玩家」的累積', ap: 1, weight: 2,
    effects: { trust: 2 }, clearHabit: 'ignored_players', result: '你在幾個討論串先回了話,火氣還沒燒起來就小了。' },
  { id: 'trend', icon: '📣', name: '有個熱門話題可以搭', action: '官方跟著發文', gain: '玩家人數 +1.5%、老闆 +1', ap: 1, weight: 2,
    effects: { players: 1.5, boss: 1 }, result: '官方跟著話題發了一則貼文,聲量跟著上來,林總也有看到。' },
  { id: 'community', icon: '🎪', name: '玩家社群自己辦起活動', action: '替他們宣傳', gain: '接下來 3 天,每天玩家人數 +0.3%', ap: 0, weight: 2,
    buff: { id: 'hype', days: 3 }, result: '社群自己辦起了活動,討論度一直在。' },
  { id: 'summary', icon: '📊', name: '玩家把數據整理成圖', action: '拿來當日報素材', gain: '少 1 份待填日報', ap: 0, weight: 2, needs: 'reports',
    reports: 1, result: '玩家整理的圖表剛好可以直接拿來當日報素材。' },
  { id: 'watching', icon: '🔔', name: '老闆也在逛論壇', action: '主動向林總報告', gain: '接下來 2 天,老闆好感的得失都放大 30%(風險與回報並存)', ap: 0, weight: 2,
    buff: { id: 'bossAmp', days: 2 }, result: '林總留言說「我也有在看」。這兩天你的一舉一動他都知道。' },
  { id: 'leak', icon: '🕵️', name: '有人在傳內部消息', action: '出面澄清', gain: '信任 +2、老闆 +2', ap: 1, weight: 1,
    effects: { trust: 2, boss: 2 }, result: '你先出面澄清,傳聞沒有擴大,林總也看到你反應很快。' },
  { id: 'rival', icon: '⚔️', name: '競品在挖角討論', action: '先向林總報告', gain: '老闆 +2(代價:有玩家被吸走,人數 -1.5%)', ap: 0, weight: 2, bad: true,
    effects: { players: -1.5, boss: 2 }, result: '有玩家被競品的活動吸走了。你提前向林總報告,他說了一句「做得好」。' },
  { id: 'harsh', icon: '😮‍💨', name: '一堆傷人的留言', action: '硬著頭皮全部看完', gain: '留存 +1(代價:明天少 1 點行動點數)', ap: 0, weight: 2, bad: true,
    effects: { retention: 1 }, buff: { id: 'tired', days: 2 }, result: '看了一堆難聽的留言,心很累。不過你也看出玩家真正在意什麼。' },
];

export const scoutCard = (id: string): ScoutCard | undefined => SCOUT_CARDS.find((c) => c.id === id);
