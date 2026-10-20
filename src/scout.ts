import type { Effects } from './types';

/** 看輿情之後的持續狀態(有天數,會顯示在收件匣上方) */
export type BuffId = 'trustUp' | 'prepared' | 'bossAmp' | 'hype' | 'tired' | 'rapport';

export const BUFFS: Record<BuffId, { icon: string; name: string; desc: string }> = {
  trustUp: { icon: '🤝', name: '玩家挺你', desc: '信任的得分多 25%' },
  prepared: { icon: '🧯', name: '有備而來', desc: '客訴、輿情事件的選項少花 1 點' },
  bossAmp: { icon: '🔔', name: '老闆在看', desc: '老闆好感的得失都放大 30%' },
  hype: { icon: '🔥', name: '話題熱度', desc: '每天玩家人數 +0.3%' },
  rapport: { icon: '🤝', name: '默契', desc: '好的結果(老闆、信任的增加)多 50%' },
  tired: { icon: '😮‍💨', name: '心很累', desc: '明天少 1 點行動點數' },
};

export interface ScoutCard {
  id: string;
  icon: string;
  /** 看到的情境 */
  name: string;
  /** 你要做的事 */
  action: string;
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
  /** 揭露這局的隱藏性格(老闆或玩家社群) */
  reveal?: 'boss' | 'community';
  /** 只有符合條件時才會出現在抽卡裡 */
  needs?: 'reports' | 'boss' | 'community';
}

export const SCOUT_CARDS: ScoutCard[] = [
  { id: 'allies', icon: '🤝', name: '核心玩家在替官方說話', action: '出面感謝、跟他們互動', ap: 0, weight: 3,
    buff: { id: 'trustUp', days: 3 }, result: '幾位老玩家在討論串幫你說話,官方的話突然比較有人信了。' },
  { id: 'guide', icon: '📖', name: '玩家自製的攻略爆紅', action: '轉發並標註作者', ap: 0, weight: 3,
    effects: { players: 1 }, result: '新手攻略被大量轉發,不少人因此回來玩。' },
  { id: 'calm', icon: '🌿', name: '討論區一片平靜', action: '留言回覆幾則', ap: 0, weight: 3,
    effects: { trust: 1 }, result: '今天的討論區很平靜。你有在看,玩家感覺得到。' },
  { id: 'brewing', icon: '🚨', name: '論壇有人在串連抱怨', action: '先把處理方式想好', ap: 0, weight: 2,
    complaintTomorrow: true, buff: { id: 'prepared', days: 2 }, result: '你提前看到風向不對,先把處理方式想好了。' },
  { id: 'defuse', icon: '🧯', name: '有幾串討論開始燒起來', action: '先去回話降溫', ap: 1, weight: 2,
    effects: { trust: 2 }, clearHabit: 'ignored_players', result: '你在幾個討論串先回了話,火氣還沒燒起來就小了。' },
  { id: 'trend', icon: '📣', name: '有個熱門話題可以搭', action: '官方跟著發文', ap: 1, weight: 2,
    effects: { players: 1.5, boss: 1 }, result: '官方跟著話題發了一則貼文,聲量跟著上來,林總也有看到。' },
  { id: 'community', icon: '🎪', name: '玩家社群自己辦起活動', action: '替他們宣傳', ap: 0, weight: 2,
    buff: { id: 'hype', days: 3 }, result: '社群自己辦起了活動,討論度一直在。' },
  { id: 'summary', icon: '📊', name: '玩家把數據整理成圖', action: '拿來當日報素材', ap: 0, weight: 2, needs: 'reports',
    reports: 1, result: '玩家整理的圖表剛好可以直接拿來當日報素材。' },
  { id: 'watching', icon: '🔔', name: '老闆也在逛論壇', action: '主動向林總報告', ap: 0, weight: 2,
    buff: { id: 'bossAmp', days: 2 }, result: '林總留言說「我也有在看」。這兩天你的一舉一動他都知道。' },
  { id: 'leak', icon: '🕵️', name: '有人在傳內部消息', action: '出面澄清', ap: 1, weight: 1,
    effects: { trust: 2, boss: 2 }, result: '你先出面澄清,傳聞沒有擴大,林總也看到你反應很快。' },
  { id: 'creator', icon: '🎨', name: '有人畫了官方角色的同人圖', action: '按讚並留言感謝', ap: 0, weight: 2,
    effects: { players: 0.8, trust: 1 }, result: '創作者收到官方的回應很開心,圖又被轉了一輪。' },
  { id: 'faq', icon: '❓', name: '同一個問題被問了很多次', action: '整理成常見問題公告', ap: 1, weight: 2,
    effects: { trust: 2 }, buff: { id: 'prepared', days: 2 }, result: '公告貼出後,重複的提問少了一大半,接下來的客訴也比較好應付。' },
  { id: 'nostalgia', icon: '🕰️', name: '老玩家在回憶當年', action: '加入討論、丟一點彩蛋', ap: 0, weight: 2,
    buff: { id: 'hype', days: 2 }, effects: { retention: 0.5 }, result: '老玩家聊得很開心,有人說想回來看看。' },
  { id: 'streamer_note', icon: '🎥', name: '有實況主在玩你們的遊戲', action: '留言打個招呼', ap: 0, weight: 1,
    effects: { players: 1.2 }, result: '實況主在直播裡念出你的留言,聊天室跟著湧進來。' },
  { id: 'insider', icon: '💌', name: '有位老玩家私訊你', action: '好好聽他說完', ap: 0, weight: 1, needs: 'community',
    reveal: 'community', result: '他花了半小時告訴你這群玩家真正吃哪一套,你收穫不少。' },
  { id: 'rating', icon: '⭐', name: '商店評分在下滑', action: '逐則回覆低分評論', ap: 1, weight: 1, bad: true,
    effects: { trust: 1, boss: 1 }, result: '你一則一則回覆,評分沒有立刻回升,但玩家看得到你在處理。' },
  { id: 'bug_rumor', icon: '🐛', name: '有人說領獎有 bug', action: '先查證再回覆', ap: 1, weight: 1, bad: true,
    effects: { trust: 2 }, clearHabit: 'sloppy_report', result: '查下來是誤會,你附上證據澄清,玩家反而更信任你了。' },
  { id: 'rival', icon: '⚔️', name: '競品在挖角討論', action: '先向林總報告', ap: 0, weight: 2, bad: true,
    effects: { players: -1.5, boss: 2 }, result: '有玩家被競品的活動吸走了。你提前向林總報告,他說了一句「做得好」。' },
  { id: 'harsh', icon: '😮‍💨', name: '一堆傷人的留言', action: '硬著頭皮全部看完', ap: 0, weight: 2, bad: true,
    effects: { retention: 1 }, buff: { id: 'tired', days: 2 }, result: '看了一堆難聽的留言,心很累。不過你也看出玩家真正在意什麼。' },
];

export const TRAIT_CARDS: ScoutCard[] = [
  { id: 'read_boss', icon: '🧭', name: '林總最近的反應有跡可循', action: '花點時間整理他這陣子對各種做法的反應', ap: 1, weight: 3, needs: 'boss',
    reveal: 'boss', result: '你把林總最近點頭和皺眉的時機排了一遍,心裡有底了。' },
  { id: 'read_community', icon: '🧭', name: '玩家社群的脾氣越來越明顯', action: '翻幾個大串,看他們吃哪一套', ap: 1, weight: 3, needs: 'community',
    reveal: 'community', result: '你翻完幾個大串,大概知道這群玩家吃哪一套了。' },
];
SCOUT_CARDS.push(...TRAIT_CARDS);

export const scoutCard = (id: string): ScoutCard | undefined => SCOUT_CARDS.find((c) => c.id === id);
