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
  reveal?: 'reward' | 'hated' | 'boss' | 'community';
  /** 累計習慣(日常行為的累積,會在之後引發連鎖事件) */
  habit?: Record<string, number>;
  /** 直接減少待填日報數 */
  reports?: number;
}

/** 做法類型:決定這個選項在不同的老闆、玩家社群與氣氛下,吃不吃香 */
export type Style = 'open' | 'private' | 'quiet' | 'generous' | 'rigor' | 'fast' | 'hustle';

export interface EventOption {
  style?: Style;
  label: string;
  ap: number;
  outcomes: Outcome[];
  /** 「快速抓個大概」類選項,受「快速報表」策略加成 */
  tag?: 'quick';
  /** 「搏一把」:高風險高報酬,贏了大賺、輸了大賠 */
  gamble?: boolean;
  /** 由策略解鎖的額外選項 */
  fromSkill?: string;
  /** 職級達到才會出現的選項(例如高階可以授權給專員);放在選項最後面,避免影響前面選項的編號 */
  minLevel?: number;
}

/** 一季(10 天)裡的階段:事件池會偏向當下階段的事件 */
export type Phase = 'prep' | 'launch' | 'ops' | 'review';

export type EventKind = '老闆' | '原廠' | '技術' | '客訴' | '輿情' | '數據' | '雜務' | '插曲';

export interface GameEvent {
  id: string;
  kind: EventKind;
  from: string;
  title: string;
  /** 一句白話摘要(預設顯示) */
  brief?: string;
  /** 做法層面的實務說明(只講怎麼做比較好,不放沒有出處的數據);處理完事件後顯示 */
  insight?: string;
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
  /** 偏好出現的階段(缺省表示不限);隨機事件池抽選時優先考慮符合當下階段的 */
  phase?: Phase[];
  /** 只在該難度(含)以上出現 */
  minDifficulty?: Difficulty;
  /** 職級達到才會出現在隨機事件池 */
  minLevel?: number;
  /** 只有帶了同事卡才會出現;colStyle 有填的話,還要同事擅長那種做法 */
  colleague?: boolean;
  colStyle?: Style;
  /** 首領事件:固定每 5 天出現一個,依你的路線挑選;answers 是對它有幫助的路線 */
  boss?: boolean;
  answers?: string[];
  /** 這件事的內容跟活動有關:any = 要有進行中或辦過的活動;done = 要有辦完過的活動 */
  needsCampaign?: 'any' | 'done';
  /** 風格事件:風格達到指定等級才會出現(跨局風格的專屬機會) */
  persona?: Style;
  personaLv?: number;
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
  /** 突發事件:一天中途才冒出來,當天就到期 */
  sudden?: boolean;
  /** 這件事的隨機種子:決定敘述版本、選項順序與額外選項 */
  v?: number;
}

/** 剛做完的選擇「好不好」:給畫面做演出 */
export interface Verdict { tier: 'great' | 'good' | 'flat' | 'bad' | 'awful'; line: string; eff: Effects }

export interface State {
  v: 1;
  mode: Mode;
  difficulty: Difficulty;
  /** 開局時的職級(整局固定),決定可用的活動選項與事件 */
  level: number;
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
  /** 開局時帶入的「過去幾局各事件看過幾次」(整局固定),抽事件時優先抽看得比較少的 */
  pastSeen?: Record<string, number>;
  followUps: { eventId: string; day: number; stage?: number }[];
  pendingReports: number;
  /** 上一次日報的題型,避免連續出現同一種 */
  lastReport?: string;
  /** 今天開場的一句氛圍 */
  dayLine?: string;
  /** 今天開場時的數值,用來判斷「今天過得好不好」 */
  dayStart?: { boss: number; trust: number; players: number };
  habits: Record<string, number>;
  /** 開局時帶入的風格熟練等級(整局固定) */
  persona?: Partial<Record<Style, number>>;
  /** 這局搭檔的同事(來自同事卡,整局固定) */
  colleague?: { style: Style; level: number; title: string };
  /** 同事今天已經幫過幾次 */
  colHelp?: { day: number; n: number };
  /** 同事今天說的一句話 */
  colSay?: string;
  /** 這局各種做法用了幾次 */
  styleUse?: Partial<Record<Style, number>>;
  /** 連續選中對方胃口的次數 */
  rapport?: number;
  /** 這局的策略與等級、經驗、等著選的升級次數與候選 */
  strat?: Record<string, number>;
  /** 這局已解鎖的策略、進化與職位(開局時從檔案室帶入,整局固定),以及選的職位 */
  unlock?: string[];
  role?: string;
  /** 這局選的挑戰(整局固定) */
  curse?: string;
  /** 明天要登場的首領事件(前一天結算時決定並預告) */
  bossNext?: string;
  /** 今天預定的突發事件(下午、晚上)與最新的突發通知 */
  sudden?: { at: 'pm' | 'eve'; fired?: boolean }[];
  alert?: string;
  /** 衝刺策略:今天已經少花過幾次 */
  sprintUsed?: { day: number; n: number };
  /** 首領:已經播過登場畫面的那一件(uid),與剛打完的結果(給結果畫面) */
  bossIntro?: number;
  bossResult?: { title: string; win: boolean; text: string; eff: string; xp: number };
  xp?: number;
  lv?: number;
  pendingPicks?: number;
  cardPick?: string[];
  /** 活動結束後的消費透支:到 until 為止,日營收少 pct(0~1) */
  spendDip?: { until: number; pct: number };
  /** 這局日報答對幾次 */
  quizRight?: number;
  verdict?: Verdict;
  campaign?: Campaign;
  taste: { reward: string; hated: string };
  intel: { reward: boolean; hated: boolean };
  /** 最近一次「看輿情」的那一天:當天與隔天,事件會先看得出氣氛,客訴、輿情也更好處理 */
  pulse?: number;
  /** 這局隱藏的老闆與玩家社群性格,以及玩家有沒有摸清 */
  traits?: { boss: string; community: string; known: { boss: boolean; community: boolean } };
  /** 看輿情後抽到、還沒選的發現卡(日期,三張卡,有沒有順便聽見玩家) */
  scout?: { day: number; cards: string[]; listened?: boolean; found?: string };
  /** 看輿情帶來的持續狀態,until 是最後一個有效的日子 */
  buffs?: { id: string; until: number }[];
  history: { day: number; players: number; spend: number }[];
  feed: string[];
  /** 全程紀錄(最近 80 筆),給「紀錄」分頁回顧用 */
  log: { day: number; text: string }[];
  uid: number;
  over?: { title: string; body: string; style?: { name: string; text: string } };
  /** 整局累計的行為習慣次數(不會衰減),結局用來判斷「這一局的你」是什麼風格 */
  styleTotals?: Record<string, number>;
  /** 無限模式通過的季度考核數 */
  reviewsPassed?: number;
  /** 這局的難忘時刻(最多 40 筆,依重要程度保留) */
  moments?: Moment[];
  /** 這局結算的經驗(結束時寫入一次) */
  award?: { credits?: number; curseMult?: number; personaLines?: string[]; firstCard?: boolean; xp: number; lines: string[]; fromXp: number; toXp: number; creditLines: string[] };
}

/** 這局值得回顧的時刻:結局畫面會挑最重的幾筆列出來 */
export interface Moment { day: number; icon: string; text: string; w: number }

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
