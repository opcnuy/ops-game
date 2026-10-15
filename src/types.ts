export type Mode = 'story' | 'endless';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GoalKey = 'players' | 'retention' | 'spend' | 'trust' | 'boss';

export interface Goal {
  key: GoalKey;
  target: number;
}

/** 事件效果:players 為玩家人數的百分比變動,其餘為點數 */
export interface Effects {
  players?: number;
  retention?: number;
  trust?: number;
  boss?: number;
}

export interface Outcome {
  p: number;
  effects?: Effects;
  result: string;
  followUp?: { eventId: string; afterDays: number };
  setFlag?: string;
  reveal?: 'reward' | 'hated';
  /** 累計習慣(日常行為的累積,會在之後引發連鎖事件) */
  habit?: Record<string, number>;
  /** 直接減少待填日報數 */
  reports?: number;
}

export interface EventOption {
  label: string;
  ap: number;
  outcomes: Outcome[];
  /** 「快速抓個大概」類選項,受「快速報表」技能加成 */
  tag?: 'quick';
  /** 由技能解鎖的額外選項 */
  fromSkill?: string;
}

export type EventKind = '老闆' | '原廠' | '技術' | '客訴' | '輿情' | '數據' | '雜務' | '插曲';

export interface GameEvent {
  id: string;
  kind: EventKind;
  from: string;
  title: string;
  /** 一句白話摘要(預設顯示) */
  brief?: string;
  /** 完整描述(收在「詳情」裡) */
  body: string;
  /** 抵達後幾天內要處理(1 = 當天) */
  deadline: number;
  ignore: { effects: Effects; result: string; habit?: Record<string, number> };
  options: EventOption[];
  /** 劇情模式固定在第幾天出現 */
  day?: number;
  /** 隨機事件池權重,0 或缺省表示不進池 */
  weight?: number;
  minDay?: number;
  /** 只在該難度(含)以上出現 */
  minDifficulty?: Difficulty;
  /** 職級達到才會出現在隨機事件池 */
  minLevel?: number;
  /** 連鎖事件:某習慣累計達標時才會出現 */
  trigger?: { habit: string; min: number };
  /** 連鎖事件出現時顯示的因果說明 */
  hint?: string;
}

export interface Mechanic { id: string; name: string; desc: string; fun: number; need: number; hated?: boolean; minLevel?: number }
export interface Reward { id: string; name: string; desc: string; appeal: number; minLevel?: number }
export interface Bundle { id: string; name: string; desc: string; desire: number; risky?: boolean; minLevel?: number }
export interface Promo { id: string; name: string; desc: string; reach: number; ap: number; minLevel?: number }

export interface CampaignContent {
  mechanics: Mechanic[];
  rewards: Reward[];
  bundles: Bundle[];
  promos: Promo[];
}

export interface PlanSel {
  mechanic: string;
  reward: string;
  bundle: string;
  promo: string;
  delay: number;
}

export interface Campaign extends PlanSel {
  launchDay: number;
  polish: number;
  checked: boolean;
  bugged: boolean;
  phase: 'planned' | 'live' | 'done';
  liveDaysLeft: number;
  scores?: { fun: number; appeal: number; desire: number; reach: number };
  lift: number;
}

export interface InboxItem {
  uid: number;
  eventId: string;
  arrived: number;
  /** 當天結束時仍未處理就逾期 */
  deadline: number;
  hint?: string;
  /** 0 = 初次;1 = 逾期後再次催辦(處理成本 +1,再逾期就不了了之) */
  stage?: number;
}

export interface State {
  v: 1;
  mode: Mode;
  difficulty: Difficulty;
  /** 開局時的職級(整局固定),決定可用的活動選項與事件 */
  level: number;
  /** 開局時帶入的技能(整局固定) */
  skills: string[];
  /** 這局達成的成就 */
  ach: string[];
  goals: Goal[];
  goalRound: number;
  maxAp: number;
  rng: number;
  day: number;
  ap: number;
  players: number;
  retention: number;
  trust: number;
  boss: number;
  spendRate: number;
  inbox: InboxItem[];
  flags: Record<string, boolean>;
  seen: Record<string, number>;
  followUps: { eventId: string; day: number; stage?: number }[];
  pendingReports: number;
  /** 上一次日報的題型,避免連續出現同一種 */
  lastReport?: string;
  /** 今天開場的一句氛圍 */
  dayLine?: string;
  /** 今天開場時的數值,用來判斷「今天過得好不好」 */
  dayStart?: { boss: number; trust: number; players: number };
  habits: Record<string, number>;
  campaign?: Campaign;
  taste: { reward: string; hated: string };
  intel: { reward: boolean; hated: boolean };
  history: { day: number; players: number; spend: number }[];
  feed: string[];
  /** 全程紀錄(最近 80 筆),給「紀錄」分頁回顧用 */
  log: { day: number; text: string }[];
  uid: number;
  over?: { title: string; body: string };
  /** 無限模式通過的季度考核數 */
  reviewsPassed?: number;
  /** 這局結算的經驗(結束時寫入一次) */
  award?: { xp: number; lines: string[]; fromXp: number; toXp: number; sp: number; spLines: string[] };
}

export interface DaySummary {
  day: number;
  lines: string[];
  spend: number;
  prevSpend: number;
  players: number;
  retention: number;
  trust: number;
  boss: number;
  before: { players: number; retention: number; trust: number; boss: number };
}
