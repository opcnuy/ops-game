import { storageKey } from './storage';
import { STYLES, sanitizePersona } from './persona';
import eventsData from './content/events.json';
import campaignData from './content/campaigns.json';
import variantData from './content/variants.json';
import optLabelData from './content/optlabels.json';
import extraData from './content/extraOptions.json';
import endingsData from './content/endings.json';
import { ALL_UNLOCK, MAX_SLOTS, STRATEGIES, THEME_LABEL, curseById, roleById, strategyById, xpNeed, type Theme } from './cards';
import { BUFFS, SCOUT_CARDS, scoutCard, type BuffId, type ScoutCard } from './scout';
import { BOSS_TRAITS, COMMUNITY_TRAITS, MOOD_CLUES, MOOD_FLAVOR, MOOD_LEVELS, type BossTrait, type CommunityTrait, type Mood } from './traits';

const BUFF_IDS = BUFFS;
import type { EventKind, Style, Verdict,
  Moment, Phase,
  EventOption, InboxItem,
  Campaign, CampaignContent, DaySummary, Difficulty, Effects, GameEvent, Goal, GoalKey, Mode, Outcome, PlanSel, State,
} from './types';

export const EVENTS: Record<string, GameEvent> = Object.fromEntries(
  (eventsData as unknown as GameEvent[]).map((e) => [e.id, e]),
);
export const CONTENT = campaignData as unknown as CampaignContent;

export interface DiffConfig {
  label: string;
  desc: string;
  maxAp: number;
  boss: number;
  trust: number;
  /** 逾期處罰倍率 */
  ignoreMult: number;
  /** 事件期限增減(天) */
  deadlineDelta: number;
  /** 每天額外隨機事件數 */
  extraEvents: number;
  /** 從第幾天起才會有額外事件 */
  extraFrom: number;
  /** 額外事件每天出現的機率 */
  extraChance: number;
  goals: Goal[];
}

export const DIFFS: Record<Difficulty, DiffConfig> = {
  easy: {
    label: '簡單', desc: '2 個目標,事件較少,期限寬鬆。', maxAp: 6, boss: 70, trust: 62, ignoreMult: 0.7, deadlineDelta: 1, extraEvents: 0, extraFrom: 99, extraChance: 0,
    goals: [{ key: 'players', target: 12500 }, { key: 'trust', target: 76 }],
  },
  normal: {
    label: '普通', desc: '3 個目標,事件偏多,選擇會連帶引出新的事。', maxAp: 6, boss: 60, trust: 60, ignoreMult: 1, deadlineDelta: 0, extraEvents: 1, extraFrom: 3, extraChance: 0.5,
    goals: [{ key: 'players', target: 13800 }, { key: 'spend', target: 60 }, { key: 'trust', target: 80 }],
  },
  hard: {
    label: '困難', desc: '5 個目標,每天少 1 點,事件更多更複雜,逾期代價更重。', maxAp: 5, boss: 60, trust: 58, ignoreMult: 1.1, deadlineDelta: 0, extraEvents: 1, extraFrom: 6, extraChance: 1,
    goals: [
      { key: 'players', target: 14300 }, { key: 'retention', target: 38 }, { key: 'spend', target: 63 },
      { key: 'trust', target: 82 }, { key: 'boss', target: 84 },
    ],
  },
};
export const HABITS: Record<string, { label: string; good?: boolean }> = {
  sloppy_report: { label: '草率填報' },
  ignored_players: { label: '忽視玩家' },
  yes_man: { label: '唯命是從' },
  pushback: { label: '據理力爭' },
  rushed: { label: '趕工省步驟' },
  overtime: { label: '熬夜加班' },
  transparency: { label: '公開透明', good: true },
  precedent: { label: '開過先例' },
  late_reports: { label: '日報積壓' },
  procrastinate: { label: '拖延積壓' },
  blame: { label: '推責任' },
};

const NOTE_MARK = '||🦋';

function addHabits(s: State, h?: Record<string, number>): string {
  if (!h) return '';
  const parts: string[] = [];
  for (const [k, n] of Object.entries(h)) {
    if (k === 'overtime' && n > 0 && s.day < 3) continue; // 剛到職的前兩天不會有「熬夜加班」
    s.habits[k] = Math.max(0, (s.habits[k] ?? 0) + n);
    if (n > 0 && k in HABITS) (s.styleTotals ??= {})[k] = (s.styleTotals[k] ?? 0) + n;
    parts.push(`${HABITS[k]?.label ?? k} ${n > 0 ? '+' : ''}${n}`);
  }
  return parts.length ? `${NOTE_MARK}${parts.join('、')}` : '';
}

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

export const GOAL_INFO: Record<GoalKey, { label: string; unit: string; digits: number }> = {
  players: { label: '玩家人數', unit: '人', digits: 0 },
  retention: { label: '留存率', unit: '%', digits: 1 },
  spend: { label: '近 5 天平均日營收', unit: '萬點', digits: 1 },
  trust: { label: '玩家信任', unit: '', digits: 0 },
  boss: { label: '老闆滿意', unit: '', digits: 0 },
};
export const STORY_DAYS = 10;

/** 結局文字放在內容檔裡,依職能分開(目前只有營運) */
const ENDINGS = endingsData.ops;
export const ENDING_STYLES = ENDINGS.styles as Record<string, { name: string; habits: string[]; good: string; rough: string }>;

/** 這一局累計最多的行為風格;最多的次數不到門檻、或和第二名並列時,就不下定論 */
export function endingStyle(s: State, good: boolean): { name: string; text: string } | undefined {
  const totals = s.styleTotals ?? {};
  const scored = Object.values(ENDING_STYLES)
    .map((st) => ({ st, n: st.habits.reduce((a, h) => a + (totals[h] ?? 0), 0) }))
    .sort((a, b) => b.n - a.n);
  if (!scored.length || scored[0].n < ENDINGS.styleMinCount || scored[0].n === (scored[1]?.n ?? -1)) return undefined;
  return { name: scored[0].st.name, text: good ? scored[0].st.good : scored[0].st.rough };
}

/** 每 10 天一季,分四個階段;不同階段遇到的事不太一樣 */
export const PHASES: Record<Phase, { name: string; blurb: string }> = {
  prep: { name: '籌備期', blurb: '新的一季開始了。這幾天多半在談預算、排活動、對齊方向。' },
  launch: { name: '上線期', blurb: '活動上線的這幾天,伺服器、客服和輿情都會同時盯著你。' },
  ops: { name: '維運期', blurb: '最忙的那陣子過了,開始有人問成效、查帳、挑細節。' },
  review: { name: '檢討期', blurb: '一季快結束了,要交檢討、對數字、回答「這季到底做得怎樣」。' },
};
const PHASE_DAYS: [number, Phase][] = [[1, 'prep'], [4, 'launch'], [7, 'ops'], [9, 'review']];

export function phaseOf(day: number): { key: Phase; first: boolean } {
  const d = ((day - 1) % 10) + 1;
  let cur = PHASE_DAYS[0];
  for (const p of PHASE_DAYS) if (d >= p[0]) cur = p;
  return { key: cur[1], first: d === cur[0] };
}
export const CAMPAIGN_TARGET = 0.3;
export const LIVE_DAYS = 3;
const SAVE_KEY = storageKey('ops-game-save-v1');

/* ---------- 工具 ---------- */

function rand(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function applyEffects(s: State, e: Effects = {}): void {
  if (e.players) s.players = Math.max(0, Math.round(s.players * (1 + e.players / 100)));
  if (e.retention) s.retention = clamp(s.retention + e.retention, 0, 100);
  if (e.trust) s.trust = clamp(s.trust + e.trust, 0, 100);
  if (e.boss) s.boss = clamp(s.boss + e.boss, 0, 100);
}

function gainAch(s: State, id: string): void {
  if (!s.ach.includes(id)) s.ach.push(id);
}

/* ---------- 小插曲:每天開場、下班前、活動留言 ---------- */

const WEEKDAY_LINES: string[][] = [
  ['週一早晨,咖啡機前排了三個人。', '週一的信箱,比你的心情還滿。', '電梯裡有人小聲說:「又是週一。」'],
  ['週二,辦公室的鍵盤聲特別整齊。', '茶水間有人在討論昨天的連續劇。'],
  ['週三,一週的中間,每個人看起來都有點恍神。', '窗外下起小雨,辦公室的燈顯得特別亮。'],
  ['週四,有人已經開始倒數週五。', '印表機今天心情不錯,沒有卡紙。'],
  ['週五了,每個人都在假裝專心。', '週五的辦公室,有種大家都很有默契的安靜。'],
];
const CLOSING_GOOD = ['下班前,同事路過說:「今天數字很好看。」', '你關電腦時,發現今天居然沒有半個催辦。', '電梯裡有人對你點頭,你猜是好事。'];
const CLOSING_BAD = ['下班路上你滑了一下論壇,還有人在吵。', '林總辦公室的燈還亮著,你決定走樓梯。', '你把今天的事在腦中複習一遍,然後決定明天再想。'];
const CLOSING_NEUTRAL = ['今天沒什麼大事,這大概是最好的結果。', '窗外的天色暗了,你把椅子推回去。', '你關掉螢幕,螢幕上映出自己有點累的臉。'];
const CLOSING_FRIDAY = ['週五下班,辦公室的人走得特別快。', '你收拾桌面時,聽到有人哼著歌。'];
const QUOTES_HIT = ['「這次活動超有誠意,抽到手軟!」', '「營運今天是不是吃了什麼?好強。」', '「終於有活動讓我想回坑。」'];
const QUOTES_OK = ['「還行啦,不過上次的比較好玩。」', '「獎勵普通,但我有拿到,就好。」'];
const QUOTES_MISS = ['「所以……這個活動是在做什麼?」', '「我以為是公告,結果是活動。」', '「蛤?已經結束了?我才剛看到。」'];
const REPORT_ASIDES = ['隔壁座位的同事也在填日報,表情很認真。', '你瞄到鄰座的日報,他寫了一整頁。', '印表機那邊,又有人在吐日報。', '遠處有人在問:「日報寫好了嗎?」', '你桌上的咖啡已經涼了,日報還沒寫完。'];

/** 同事的口頭禪:同意你的做法、平常閒聊、闖了禍 */
const MATE_LINES: Record<Style, { agree: string[]; idle: string[]; oops: string }> = {
  open: { agree: ['「對,大家都有權利知道。」', '「這樣講出來,心裡舒服多了。」'], idle: ['「我在想要不要多回覆幾則留言。」', '「有些事講開就好了啊。」'], oops: '「呃……我好像講太多了。」' },
  private: { agree: ['「這種事就是要好好聊。」', '「私下講,對方比較聽得進去。」'], idle: ['「我昨天跟一位玩家聊了很久。」', '「有些話,不適合在公開場合講。」'], oops: '「那個……我私下跟對方說了一些話。」' },
  quiet: { agree: ['「對,不用把事情搞大。」', '「低調處理,最好。」'], idle: ['「安靜的一天,真好。」', '「有些事,放一放就過了。」'], oops: '「我本來想先壓著……」' },
  generous: { agree: ['「大方一點,大家都開心。」', '「這點誠意,值得。」'], idle: ['「我在想有什麼小禮物可以送。」', '「玩家這麼支持,我們也該回饋一下。」'], oops: '「我當場答應了,希望沒問題。」' },
  rigor: { agree: ['「對,凡事要有憑據。」', '「你查得比我還仔細。」'], idle: ['「我又發現一個數字對不上。」', '「資料不會騙人,但報表會。」'], oops: '「我再查一下,應該快好了……」' },
  fast: { agree: ['「對,就是要這種速度。」', '「先動手,再調整!」'], idle: ['「我有個更快的做法,等一下跟你說。」', '「時間就是一切。」'], oops: '「我趕出來了,應該沒問題吧?」' },
  hustle: { agree: ['「對,自己動手最踏實。」', '「這種事,扛起來就對了!」'], idle: ['「我再撐一下就好。」', '「今天又是一個咖啡日。」'], oops: '「我沒事,真的,再一下就好。」' },
};

const pickOf = <T,>(s: State, a: T[]): T => a[Math.floor(rand(s) * a.length)];

function dayOpeningLine(s: State): string {
  const mood: string[] = [];
  if (s.trust <= 40) mood.push('論壇的氣氛今天有點冷。');
  if (s.boss <= 40) mood.push('林總今天沒跟你打招呼。');
  if (s.trust >= 75 && s.boss >= 70) mood.push('今天大家看起來心情都不錯。');
  if (s.pendingReports >= 3) mood.push('你的日報資料夾,今天看起來又厚了一點。');
  if (mood.length && rand(s) < 0.5) return pickOf(s, mood);
  return pickOf(s, WEEKDAY_LINES[(s.day - 1) % 5]);
}

function pushLog(s: State, day: number, text: string): void {
  s.log.unshift({ day, text });
  if (s.log.length > 80) s.log.length = 80;
}

/** 記下一個值得回顧的時刻;超過 40 筆時丟掉最不重要的(同樣重要就丟比較早的) */
function addMoment(s: State, w: number, icon: string, text: string): void {
  const list = s.moments ?? (s.moments = []);
  list.push({ day: s.day, icon, text: text.slice(0, 140), w });
  if (list.length > 40) {
    let drop = 0;
    list.forEach((m, i) => { if (m.w < list[drop].w) drop = i; });
    list.splice(drop, 1);
  }
}

/** 事件標題有的本身就是一整句「引號」:不要再多包一層 */
const quoted = (t: string): string => (t.startsWith('「') && t.endsWith('」') && t.indexOf('」') === t.length - 1 ? t : `「${t}」`);

/** 一筆效果的「份量」:老闆與信任看絕對值,玩家人數變動比較難得所以加權 */
const impactOf = (e?: Effects): number => Math.abs(e?.boss ?? 0) + Math.abs(e?.trust ?? 0) + Math.abs(e?.players ?? 0) * 1.5;
const netOf = (e?: Effects): number => (e?.boss ?? 0) + (e?.trust ?? 0) + (e?.players ?? 0) * 1.5;

function pushFeed(s: State, line: string): void {
  pushLog(s, s.day, line);
  s.feed.unshift(line);
  if (s.feed.length > 14) s.feed.length = 14;
}

export const find = <T extends { id: string }>(list: T[], id: string): T =>
  list.find((x) => x.id === id) ?? list[0];

/** 日營收(萬點):玩家當天在遊戲內花掉的點數 */
export function spendToday(s: State): number {
  const lift = s.campaign?.phase === 'live' ? s.campaign.lift : 0;
  const trustFactor = 0.8 + s.trust / 250;
  const dip = s.spendDip && s.spendDip.until >= s.day ? 1 - s.spendDip.pct : 1;
  return (s.players * s.spendRate * trustFactor * (1 + lift) * dip) / 10000;
}

export function goalValue(s: State, key: GoalKey): number {
  if (key === 'spend') {
    const recent = s.history.slice(-5).map((h) => h.spend);
    return recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
  }
  return s[key];
}

export const goalMet = (s: State, g: Goal): boolean => goalValue(s, g.key) >= g.target;

export function weekdayLabel(day: number): string {
  const names = ['週一', '週二', '週三', '週四', '週五'];
  return `第 ${Math.ceil(day / 5)} 週 ${names[(day - 1) % 5]}`;
}

/* ---------- 新遊戲 / 存檔 ---------- */

export function newGame(mode: Mode, difficulty: Difficulty = 'normal', seed = Date.now(), level = 1, pastSeen: Record<string, number> = {}, persona: Partial<Record<Style, number>> = {}, colleague?: { style: Style; level: number; title: string }, unlock: string[] = ALL_UNLOCK, role = 'intern', curse?: string): State {
  const cfg = DIFFS[difficulty];
  const s: State = {
    v: 1, mode, difficulty, level, persona: { ...persona }, colleague: colleague ? { ...colleague } : undefined, ach: [], goals: cfg.goals.map((g) => ({ ...g })), goalRound: 0, maxAp: cfg.maxAp - (curse === 'tight' ? 1 : 0),
    rng: seed | 0, day: 1, ap: cfg.maxAp - (curse === 'tight' ? 1 : 0),
    players: 12000, retention: 36, trust: cfg.trust - (curse === 'angry' ? 10 : 0), boss: cfg.boss, spendRate: 38,
    strat: {}, xp: 0, lv: 1, pendingPicks: 0, unlock: [...unlock], role, curse,
    inbox: [], flags: {}, seen: {}, pastSeen: { ...pastSeen }, followUps: [], pendingReports: 0, habits: {},
    taste: { reward: '', hated: '' }, intel: { reward: false, hated: false },
    history: [], feed: [], log: [], uid: 1,
  };
  s.taste.reward = CONTENT.rewards[Math.floor(rand(s) * CONTENT.rewards.length)].id;
  const hated = CONTENT.mechanics.filter((m) => m.hated);
  s.taste.hated = hated[Math.floor(rand(s) * hated.length)].id;
  const bossKeys = Object.keys(BOSS_TRAITS); const commKeys = Object.keys(COMMUNITY_TRAITS);
  s.traits = {
    boss: bossKeys[Math.floor(rand(s) * bossKeys.length)], community: commKeys[Math.floor(rand(s) * commKeys.length)],
    known: { boss: false, community: false },
  };
  s.history.push({ day: 0, players: s.players, spend: spendToday(s) });
  if (s.colleague) pushLog(s, 1, `👥 這局和你搭檔的同事:${s.colleague.title}。`);
  spawnDay(s);
  const start = roleById(role)?.start;
  if (start) { s.strat = { [start]: 1 }; onGain(s, start, 1); }
  if (role === 'secretary') revealIntel(s, 'boss');
  s.pendingPicks = 1;
  drawPick(s);
  return s;
}

/* ---------- 導演:依你的路線出題 ---------- */

function themeLevels(s: State): Record<Theme, number> {
  const out: Record<Theme, number> = { trust: 0, revenue: 0, boss: 0, data: 0, grind: 0, steady: 0, community: 0, speed: 0, risk: 0 };
  for (const c of STRATEGIES) out[c.theme] += stratLv(s, c.id);
  return out;
}

/** 你偏重哪個路線(沒有任何策略就沒有) */
export function dominantTheme(s: State): Theme | undefined {
  const lv = themeLevels(s);
  const top = (Object.keys(lv) as Theme[]).sort((a, b) => lv[b] - lv[a])[0];
  return lv[top] > 0 ? top : undefined;
}

/** 針對你的路線,今天的事件裡哪幾類會變多(越偏重某個打法,越會被它的反面盯上) */
const COUNTER_KINDS: Record<Theme, EventKind[]> = {
  trust: ['老闆', '數據'], revenue: ['客訴', '輿情'], boss: ['原廠', '技術'], data: ['雜務', '輿情'], grind: ['客訴', '雜務'],
  steady: ['原廠', '老闆'], community: ['輿情', '原廠'], speed: ['技術', '雜務'], risk: ['老闆', '客訴'],
};
const BOSS_OF: Record<Theme, string> = {
  revenue: 'boss_storm', trust: 'boss_growth', boss: 'boss_audit', data: 'boss_outage', grind: 'boss_outage', steady: 'boss_audit',
  community: 'boss_rival', speed: 'boss_leak', risk: 'boss_leak',
};
const BOSS_IDS = ['boss_storm', 'boss_growth', 'boss_audit', 'boss_outage', 'boss_rival', 'boss_leak'];

/** 首領資訊:它在考什麼、你的對策有多少、能加多少成功率(給首領畫面用) */
export function bossInfo(s: State, ev: GameEvent): { bonus: number; parts: { theme: Theme; label: string; lv: number }[]; focus?: Theme } {
  const lv = themeLevels(s);
  const parts = (ev.answers ?? []).map((k) => ({ theme: k as Theme, label: THEME_LABEL[k as Theme], lv: lv[k as Theme] ?? 0 }));
  return { bonus: Math.min(0.3, 0.05 * parts.reduce((a, p) => a + p.lv, 0)), parts, focus: dominantTheme(s) };
}

/** 挑首領:專門考你最偏重的那個打法 */
function pickBoss(s: State): string {
  const th = dominantTheme(s);
  return th ? BOSS_OF[th] : pickOf(s, BOSS_IDS);
}

/* ---------- 策略:經驗、升級、三選一 ---------- */

export const stratLv = (s: State, id: string): number => s.strat?.[id] ?? 0;

/** 得到經驗;夠了就升級,升級會排隊等玩家選策略。回傳升了幾級 */
export function gainXp(s: State, n: number): number {
  s.xp = (s.xp ?? 0) + Math.round(n * (1 + (s.role === 'intern' ? 0.1 : 0) + 0.15 * stratLv(s, 'tutor') + 0.08 * stratLv(s, 'notes') + (stratLv(s, 'evo_mentor') ? 0.5 : 0)));
  let up = 0;
  for (;;) {
    const lv = s.lv ?? 1;
    if ((s.xp ?? 0) < xpNeed(lv)) break;
    s.xp = (s.xp ?? 0) - xpNeed(lv);
    s.lv = lv + 1;
    s.pendingPicks = (s.pendingPicks ?? 0) + 1;
    up++;
  }
  if (up) drawPick(s);
  return up;
}

/** 抽候選:進化優先,其次是已有可升級的,再來是新的(槽位未滿);有「時間管理」多一張 */
function drawPick(s: State, avoid: string[] = []): void {
  if (s.cardPick || s.over || (s.pendingPicks ?? 0) <= 0) return;
  const owned = (id: string): number => stratLv(s, id);
  const base = STRATEGIES.filter((c) => !c.evolve);
  const slots = base.filter((c) => owned(c.id) > 0).length;
  const open = (id: string): boolean => (s.unlock ?? ALL_UNLOCK).includes(id);
  const evo = STRATEGIES.filter((c) => c.evolve && open(c.id) && owned(c.id) === 0 && c.evolve.from.every(([id, lv]) => owned(id) >= lv));
  const pool: { id: string; w: number }[] = [];
  // 劇情後期活動來不及辦了:效果要靠活動的策略不再出現(已經有活動在跑或辦過的不受影響)
  const lateStory = s.mode === 'story' && s.day >= 8 && s.campaign?.phase !== 'live' && s.campaign?.phase !== 'planned';
  for (const c of base) {
    if (c.needsCampaign && lateStory) continue;
    if (owned(c.id) > 0 && owned(c.id) < c.max) pool.push({ id: c.id, w: 3 });
    else if (owned(c.id) === 0 && slots < MAX_SLOTS && open(c.id)) pool.push({ id: c.id, w: c.pure ? 1.2 : 2 });
  }
  const want = 3 + ((s.unlock ?? ALL_UNLOCK).includes('perk_pick') ? 1 : 0);
  // 重抽:盡量換掉目前這幾張(候選不夠多時才允許重複)
  if (avoid.length && pool.filter((x) => !avoid.includes(x.id)).length >= want) for (const a of avoid) { const i = pool.findIndex((x) => x.id === a); if (i >= 0) pool.splice(i, 1); }
  const picks: string[] = evo.slice(0, 1).map((c) => c.id);
  while (picks.length < want && pool.length) {
    let r = rand(s) * pool.reduce((a, c) => a + c.w, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    picks.push(pool.splice(i, 1)[0].id);
  }
  if (!picks.length) {
    s.pendingPicks = (s.pendingPicks ?? 1) - 1;
    applyEffects(s, { trust: 2 });
    pushFeed(s, '⭐ 策略都練滿了,玩家信任 +2。');
    return;
  }
  s.cardPick = picks;
}

/** 得到或升級某個策略時,立刻生效的部分(行動點數、摸清性格) */
function onGain(s: State, id: string, lv: number): string {
  if ((id === 'all_hands' && (lv === 1 || lv === 4)) || id === 'evo_iron') { s.maxAp++; s.ap++; }
  if (id === 'insight' && lv === 1) return ' ' + revealIntel(s, 'boss');
  if (id === 'insight' && lv === 2) return ' ' + revealIntel(s, 'community');
  return '';
}

/** 重抽目前的升級候選(花不花券由呼叫端決定);換不出新的就維持原樣並回傳 false */
export function rerollPick(s: State): boolean {
  const prev = s.cardPick;
  if (!prev || s.over) return false;
  s.cardPick = undefined;
  drawPick(s, prev);
  if (!s.cardPick) { s.cardPick = prev; return false; }
  s.rerolls = (s.rerolls ?? 0) + 1;
  return true;
}

export function pickCard(s: State, id: string): string | null {
  if (!s.cardPick?.includes(id)) return '沒有這張卡';
  const c = strategyById(id);
  if (!c) return '沒有這張卡';
  const lv = Math.min(c.max, stratLv(s, id) + 1);
  (s.strat ??= {})[id] = lv;
  s.cardPick = undefined;
  s.pendingPicks = Math.max(0, (s.pendingPicks ?? 1) - 1);
  const note = onGain(s, id, lv);
  pushFeed(s, `${c.icon} ${c.name} Lv${lv}:${c.good(lv)};${c.bad(lv)}${note}`);
  drawPick(s);
  return null;
}

export function save(s: State): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 隱私模式等情況略過 */ }
}

/** 讀檔時把文字裡的角括號與引號換成全形,避免被竄改的存檔帶入 HTML */
const cleanText = (v: unknown, max = 400): string =>
  String(v ?? '').slice(0, max).replace(/</g, '＜').replace(/>/g, '＞').replace(/"/g, '”').replace(/'/g, '’');
const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const strs = (v: unknown, max = 100): string[] =>
  Array.isArray(v) ? v.slice(0, max).filter((x) => typeof x === 'string').map((x) => cleanText(x)) : [];

/** 存檔是玩家可改的本機資料:逐欄檢查型別與範圍,不合格就當沒有存檔 */
function sanitizeState(raw: unknown): State | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || (r.mode !== 'story' && r.mode !== 'endless')) return null;
  if (r.difficulty !== 'easy' && r.difficulty !== 'normal' && r.difficulty !== 'hard') return null;
  if (!Array.isArray(r.goals) || !Array.isArray(r.inbox)) return null;
  const goalKeys = ['players', 'retention', 'spend', 'trust', 'boss'];
  const goals = r.goals.slice(0, 8).filter((g): g is Goal => !!g && goalKeys.includes((g as Goal).key) && typeof (g as Goal).target === 'number')
    .map((g) => ({ key: g.key, target: num(g.target, 0, 1e9, 0) }));
  if (!goals.length) return null;
  const inbox = (r.inbox as InboxItem[]).slice(0, 60).filter((i) => i && typeof i.eventId === 'string' && Object.hasOwn(EVENTS, i.eventId))
    .map((i) => ({ uid: num(i.uid, 0, 1e9, 0), eventId: i.eventId, arrived: num(i.arrived, 0, 1e5, 0), deadline: num(i.deadline, 0, 1e5, 0), v: i.v === undefined ? undefined : num(i.v, 0, 1e9, 0),
      hint: i.hint === undefined ? undefined : cleanText(i.hint), stage: num(i.stage, 0, 2, 0), sudden: i.sudden === true ? true : undefined }));
  const followUps = (Array.isArray(r.followUps) ? (r.followUps as State['followUps']) : []).slice(0, 60)
    .filter((f) => f && typeof f.eventId === 'string' && Object.hasOwn(EVENTS, f.eventId))
    .map((f) => ({ eventId: f.eventId, day: num(f.day, 0, 1e5, 0), stage: num(f.stage, 0, 2, 0) }));
  const rec = (v: unknown): Record<string, number> => {
    const o: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as object).slice(0, 200)) if (typeof x === 'number' && Number.isFinite(x)) o[cleanText(k, 40)] = x;
    return o;
  };
  const flags: Record<string, boolean> = {};
  if (r.flags && typeof r.flags === 'object') for (const [k, x] of Object.entries(r.flags as object).slice(0, 200)) flags[cleanText(k, 40)] = !!x;
  const s = { ...(r as unknown as State) };
  s.goals = goals; s.inbox = inbox; s.followUps = followUps; s.flags = flags;
  s.seen = rec(r.seen); s.pastSeen = rec(r.pastSeen); s.habits = rec(r.habits);
  s.level = num(r.level, 1, 5, 1); s.ach = strs(r.ach);
  s.goalRound = num(r.goalRound, 0, 1e4, 0); s.maxAp = num(r.maxAp, 1, 12, 6);
  s.rng = num(r.rng, -2147483648, 2147483647, 1); s.day = num(r.day, 1, 1e5, 1); s.ap = num(r.ap, 0, 12, 0);
  s.players = num(r.players, 0, 1e9, 0); s.retention = num(r.retention, 0, 100, 0); s.trust = num(r.trust, 0, 100, 0);
  s.boss = num(r.boss, 0, 100, 0); s.spendRate = num(r.spendRate, 0, 1e6, 0); s.uid = num(r.uid, 0, 1e9, 0);
  s.pendingReports = num(r.pendingReports, 0, 1e3, 0);
  s.feed = strs(r.feed, 60);
  s.log = (Array.isArray(r.log) ? (r.log as State['log']) : []).slice(-80).filter((e) => e && typeof e.text === 'string')
    .map((e) => ({ day: num(e.day, 0, 1e5, 0), text: cleanText(e.text) }));
  s.history = (Array.isArray(r.history) ? (r.history as State['history']) : []).slice(-60)
    .map((h) => ({ day: num(h?.day, 0, 1e5, 0), players: num(h?.players, 0, 1e9, 0), spend: num(h?.spend, 0, 1e12, 0) }));
  if (s.dayLine !== undefined) s.dayLine = cleanText(s.dayLine);
  if (s.lastReport !== undefined) s.lastReport = cleanText(s.lastReport, 40);
  s.moments = (Array.isArray(r.moments) ? (r.moments as Moment[]) : []).slice(0, 40)
    .map((m) => ({ day: num(m?.day, 0, 1e5, 0), icon: cleanText(m?.icon, 4), text: cleanText(m?.text, 160), w: num(m?.w, 0, 100, 0) }));
  s.styleTotals = rec(r.styleTotals);
  const sd = r.spendDip as { until?: unknown; pct?: unknown } | undefined;
  s.spendDip = sd && typeof sd === 'object' ? { until: num(sd.until, 0, 1e5, 0), pct: num(sd.pct, 0, 0.5, 0) } : undefined;
  s.quizRight = num(r.quizRight, 0, 1e4, 0);
  const st: Record<string, number> = {};
  if (r.strat && typeof r.strat === 'object') for (const [k, x] of Object.entries(r.strat as object).slice(0, 20)) {
    const c = strategyById(k);
    if (c && typeof x === 'number' && Number.isFinite(x)) st[k] = Math.min(c.max, Math.max(1, Math.floor(x)));
  }
  s.strat = st;
  s.unlock = Array.isArray(r.unlock) ? (r.unlock as unknown[]).filter((x): x is string => typeof x === 'string' && ALL_UNLOCK.includes(x)).slice(0, 40) : [...ALL_UNLOCK];
  s.role = typeof r.role === 'string' && roleById(r.role) ? r.role : 'intern';
  s.sudden = (Array.isArray(r.sudden) ? (r.sudden as { at?: unknown; fired?: unknown }[]) : []).slice(0, 4)
    .filter((x) => x && (x.at === 'pm' || x.at === 'eve')).map((x) => ({ at: x.at as 'pm' | 'eve', fired: x.fired === true }));
  s.alert = typeof r.alert === 'string' ? cleanText(r.alert, 100) : undefined;
  s.rerolls = num(r.rerolls, 0, 999, 0);
  s.bossIntro = r.bossIntro === undefined ? undefined : num(r.bossIntro, 0, 1e9, 0);
  const br = r.bossResult as { title?: unknown; win?: unknown; text?: unknown; eff?: unknown; xp?: unknown } | undefined;
  s.bossResult = br && typeof br === 'object' && typeof br.title === 'string'
    ? { title: cleanText(br.title, 40), win: br.win === true, text: cleanText(br.text, 200), eff: cleanText(br.eff, 80), xp: num(br.xp, 0, 999, 0) } : undefined;
  const su = r.sprintUsed as { day?: unknown; n?: unknown } | undefined;
  s.sprintUsed = su && typeof su === 'object' ? { day: num(su.day, 0, 1e5, 0), n: num(su.n, 0, 9, 0) } : undefined;
  s.bossNext = typeof r.bossNext === 'string' && Object.hasOwn(EVENTS, r.bossNext) ? r.bossNext : undefined;
  s.curse = typeof r.curse === 'string' && curseById(r.curse) ? r.curse : undefined;
  s.xp = num(r.xp, 0, 1e6, 0); s.lv = num(r.lv, 1, 99, 1); s.pendingPicks = num(r.pendingPicks, 0, 20, 0);
  const cp = Array.isArray(r.cardPick) ? (r.cardPick as unknown[]).filter((x): x is string => typeof x === 'string' && !!strategyById(x)).slice(0, 4) : [];
  s.cardPick = cp.length ? cp : undefined;
  const col = r.colleague as { style?: unknown; level?: unknown; title?: unknown } | undefined;
  s.colleague = col && typeof col.style === 'string' && (STYLES as string[]).includes(col.style)
    ? { style: col.style as Style, level: num(col.level, 1, 3, 1), title: cleanText(col.title, 30) } : undefined;
  s.colSay = typeof s.colSay === 'string' ? cleanText(s.colSay, 60) : undefined;
  s.colHelp = s.colHelp && typeof s.colHelp === 'object' ? { day: num(s.colHelp.day, 0, 1e5, 0), n: num(s.colHelp.n, 0, 9, 0) } : undefined;
  s.persona = sanitizePersona(r.persona, 3); s.styleUse = sanitizePersona(r.styleUse, 999);
  if (s.over) {
    const st = s.over.style;
    s.over = { title: cleanText(s.over.title), body: cleanText(s.over.body, 1000),
      ...(st && typeof st === 'object' ? { style: { name: cleanText(st.name, 40), text: cleanText(st.text, 300) } } : {}) };
  }
  if (s.award) {
    s.award = { credits: num((s.award as { credits?: unknown }).credits, 0, 1e6, 0), xp: num(s.award.xp, 0, 1e6, 0), lines: strs(s.award.lines), fromXp: num(s.award.fromXp, 0, 1e6, 0),
      toXp: num(s.award.toXp, 0, 1e6, 0), creditLines: strs((s.award as { creditLines?: unknown }).creditLines), personaLines: strs((s.award as { personaLines?: unknown }).personaLines), firstCard: (s.award as { firstCard?: unknown }).firstCard === true };
  }
  if (s.campaign) {
    const c = s.campaign as unknown as Record<string, unknown>;
    const ids = (k: keyof CampaignContent) => (CONTENT[k] as { id: string }[]).map((x) => x.id);
    const pick = (k: keyof CampaignContent, v: unknown) => (typeof v === 'string' && ids(k).includes(v) ? v : ids(k)[0]);
    const phase = c.phase === 'planned' || c.phase === 'live' || c.phase === 'done' ? c.phase : 'done';
    const sc = c.scores as { fun: number; appeal: number; desire: number; reach: number } | undefined;
    s.campaign = {
      mechanic: pick('mechanics', c.mechanic), reward: pick('rewards', c.reward), bundle: pick('bundles', c.bundle), promo: pick('promos', c.promo),
      delay: num(c.delay, 0, 30, 0), launchDay: num(c.launchDay, 0, 1e5, 0), polish: num(c.polish, 0, 100, 0),
      checked: !!c.checked, bugged: !!c.bugged, phase, liveDaysLeft: num(c.liveDaysLeft, 0, 60, 0), lift: num(c.lift, -100, 1000, 0),
      scores: sc ? { fun: num(sc.fun, 0, 200, 0), appeal: num(sc.appeal, 0, 200, 0), desire: num(sc.desire, 0, 200, 0), reach: num(sc.reach, 0, 200, 0) } : undefined,
    };
  }
  s.taste = { reward: cleanText(s.taste?.reward, 40), hated: cleanText(s.taste?.hated, 40) };
  s.intel = { reward: !!s.intel?.reward, hated: !!s.intel?.hated };
  if (s.pulse !== undefined) s.pulse = num(s.pulse, 0, 1e5, 0);
  const rt = r.traits as { boss?: unknown; community?: unknown; known?: { boss?: unknown; community?: unknown } } | undefined;
  s.traits = rt && typeof rt === 'object' && typeof rt.boss === 'string' && Object.hasOwn(BOSS_TRAITS, rt.boss) && typeof rt.community === 'string' && Object.hasOwn(COMMUNITY_TRAITS, rt.community)
    ? { boss: rt.boss, community: rt.community, known: { boss: !!rt.known?.boss, community: !!rt.known?.community } }
    : undefined;
  const rs = r.scout as { day?: unknown; cards?: unknown; listened?: unknown } | undefined;
  s.scout = rs && typeof rs === 'object' && Array.isArray(rs.cards)
    ? { day: num(rs.day, 0, 1e5, 0), cards: rs.cards.filter((id): id is string => typeof id === 'string' && !!scoutCard(id)).slice(0, 3), listened: !!rs.listened,
      found: typeof (rs as { found?: unknown }).found === 'string' ? cleanText((rs as { found?: string }).found, 200) : undefined }
    : undefined;
  if (s.scout && !s.scout.cards.length) s.scout = undefined;
  s.buffs = (Array.isArray(r.buffs) ? (r.buffs as { id?: unknown; until?: unknown }[]) : []).slice(0, 10)
    .filter((b) => b && typeof b.id === 'string' && Object.hasOwn(BUFF_IDS, b.id)).map((b) => ({ id: b.id as string, until: num(b.until, 0, 1e5, 0) }));
  return s;
}

export function load(): State | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw || raw.length > 2_000_000) return null;
    return sanitizeState(JSON.parse(raw));
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 略過 */ }
}

/* ---------- 事件進場 ---------- */

function addEvent(s: State, eventId: string, hint?: string, stage = 0): void {
  const ev = EVENTS[eventId];
  if (!ev || s.inbox.some((i) => i.eventId === eventId)) return;
  const span = stage > 0 ? 1 : Math.max(1, ev.deadline + DIFFS[s.difficulty].deadlineDelta);
  s.inbox.push({ uid: s.uid++, eventId, arrived: s.day, deadline: s.day + span - 1, hint, stage, v: Math.floor(rand(s) * 1e9) });
  if (!stage) s.seen[eventId] = (s.seen[eventId] ?? 0) + 1;
}

/** 認真填日報不花點數:日報自動化或數據導向 */
export const reportFree = (s: State): boolean => stratLv(s, 'auto_report') > 0 || stratLv(s, 'data_driven') > 0;

const DATA_EVENT_IDS = ['e_adhoc_chart', 'e_data_dup'];
const isDataEvent = (ev: GameEvent): boolean => ev.kind === '數據' || DATA_EVENT_IDS.includes(ev.id);

/** 策略解鎖的額外選項:依事件類型自動加進去 */
const SKILL_OPTIONS: { strat: string; match: (ev: GameEvent) => boolean; opt: EventOption }[] = [
  {
    strat: 'template', match: isDataEvent,
    opt: { label: '用報表範本快速出表', ap: 1, style: 'fast', outcomes: [
      { p: 0.85, effects: { boss: 2 }, result: '範本一套,數字準時出爐。' },
      { p: 0.15, effects: { boss: -1 }, result: '範本欄位對不上,補了兩次。' },
    ] },
  },
  {
    strat: 'advocate', match: (ev) => ev.kind === '客訴' || ev.kind === '輿情',
    opt: { label: '請核心玩家出面說明', ap: 1, style: 'open', outcomes: [
      { p: 0.7, effects: { trust: 4 }, result: '玩家的話,比官方公告更有說服力。' },
      { p: 0.3, effects: { trust: -1 }, result: '核心玩家也有自己的想法,場面有點尷尬。' },
    ] },
  },
  {
    strat: 'network', match: (ev) => ev.kind === '技術' || ev.kind === '原廠',
    opt: { label: '找熟人幫忙', ap: 1, style: 'private', outcomes: [
      { p: 0.65, effects: { boss: 1, trust: 2 }, result: '熟人一通電話,事情就動起來了。' },
      { p: 0.35, effects: { boss: -1 }, result: '對方這週也很忙。' },
    ] },
  },
];

/** 偽隨機:同一件事每次渲染都得到同樣的結果。salt 讓不同用途互不影響 */
const SALT = { shuffle: 0x9e3779b1, bonus: 0x51ed270b, label: 0x1b873593, mood: 0x2545f491 };
function seeded(v: number, salt: number): () => number {
  let a = ((v ^ salt) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 只有「第一次出現」的事才有說法與選項的變化;升級催辦的事維持原樣 */
const varies = (item?: InboxItem): item is InboxItem & { v: number } => item?.v !== undefined && !item.stage;

/** 0 = 原版,k>0 = 第 k 個變體 */
const variantIndex = (rnd: number, n: number): number => Math.floor(rnd * (n + 1));

export interface EventText { from: string; title: string; brief?: string; body: string }
const VARIANTS = variantData as unknown as Record<string, Partial<EventText>[]>;
const OPT_LABELS = optLabelData as Record<string, string[][]>;
const EXTRA = extraData as unknown as { chance: number; gambleChance: number; gambles: Partial<Record<GameEvent['kind'], EventOption[]>>; pools: Partial<Record<GameEvent['kind'], EventOption[]>> };

/** 事件顯示的文字:同一種事件會有幾種不同的說法 */
export function eventText(ev: GameEvent, item?: InboxItem): EventText {
  const alts = VARIANTS[ev.id];
  const alt = alts?.length && varies(item) ? alts[variantIndex(seeded(item.v, 0)(), alts.length) - 1] : undefined;
  const base = { from: ev.from, title: ev.title, brief: ev.brief, body: ev.body, ...alt };
  const clue = moodClue(ev, item);
  if (!clue) return base;
  return { ...base, brief: base.brief ? `${base.brief}${clue}` : base.brief, body: `${base.body}${clue}` };
}

/** 這件事實際顯示的選項,以及它在 eventOptions 裡的原始編號(順序會被打散) */
export function itemOptions(s: State, ev: GameEvent, item: InboxItem): { opt: EventOption; index: number }[] {
  const labels = OPT_LABELS[ev.id];
  const all = eventOptions(s, ev, item).map((opt, index) => {
    const alts = labels?.[index];
    const k = alts?.length && varies(item) && index < ev.options.length
      ? variantIndex(seeded(item.v, SALT.label + index * 7919)(), alts.length) : 0;
    return { opt: k ? { ...opt, label: alts![k - 1] } : opt, index };
  });
  return item.v === undefined ? all : shuffleWith(seeded(item.v, SALT.shuffle), all);
}

/** 這個事件目前可選的所有選項(原本的、偶爾多出來的、策略解鎖的) */
export function eventOptions(s: State, ev: GameEvent, item?: InboxItem): EventOption[] {
  const skillOpts = SKILL_OPTIONS.filter((x) => stratLv(s, x.strat) > 0 && x.match(ev)).map((x) => ({ ...x.opt, fromSkill: x.strat }));
  const pool = EXTRA.pools[ev.kind];
  const rnd = pool?.length && varies(item) ? seeded(item.v, SALT.bonus) : null;
  const bonus = rnd && rnd() < EXTRA.chance ? [pool![Math.floor(rnd() * pool!.length)]] : [];
  const own = ev.options.filter((o) => (o.minLevel ?? 1) <= s.level);
  // 搏一把:偶爾多一個高風險高報酬的選項(每件事固定,不會每次渲染都變)
  const gp = EXTRA.gambles[ev.kind];
  const gr = gp?.length && varies(item) ? seeded(item.v, SALT.bonus + 31) : null;
  const gamble = gr && gr() < EXTRA.gambleChance ? [gp![Math.floor(gr() * gp!.length)]] : [];
  return [...own, ...bonus, ...gamble, ...skillOpts];
}

/** 選項實際花費:策略減免,以及逾期後再次催辦的事 +1 */
/** 衝刺:今天還能少花 1 點的次數 */
function sprintLeft(s: State): number {
  const lv = stratLv(s, 'sprint');
  if (!lv) return 0;
  return (lv >= 3 ? 2 : 1) - (s.sprintUsed?.day === s.day ? s.sprintUsed.n : 0);
}

export function optionCost(s: State, item: InboxItem, opt: EventOption, noColleague = false, noSprint = false): number {
  let c = opt.ap;
  if (c <= 0) return 0;
  const ev = EVENTS[item.eventId];
  if (stratLv(s, 'unify') > 0 && isDataEvent(ev) && c > 1) c -= 1;
  if (buffActive(s, 'prepared') && isPulseEvent(ev)) c = Math.max(0, c - 1);
  if (item.sudden && c > 0) c = Math.max(0, c - 1);
  if (item.stage && !stratLv(s, 'crisis_pr')) c += 1;
  if (!noColleague && colleagueHelps(s, opt) && c > 0) c -= 1;
  if (!noSprint && c > 0 && sprintLeft(s) > 0) c -= 1;
  return c;
}

/** 同事擅長的做法,每天可以幫你分擔一次:這個選項少花 1 點 */
export function colleagueHelps(s: State, opt: EventOption): boolean {
  const c = s.colleague;
  if (!c || !opt.style || opt.style !== c.style) return false;
  const used = s.colHelp?.day === s.day ? s.colHelp.n : 0;
  return used < 1;
}

const goodness = (o: Outcome): number =>
  (o.effects?.trust ?? 0) + (o.effects?.boss ?? 0) + (o.effects?.retention ?? 0) + (o.effects?.players ?? 0) * 0.5;

/** 把一部分機率從「最糟的結果」挪給「最好的結果」 */
function boostOutcomes(outs: Outcome[], boost: number): Outcome[] {
  let best = 0;
  let worst = 0;
  outs.forEach((o, i) => {
    if (goodness(o) > goodness(outs[best])) best = i;
    if (goodness(o) < goodness(outs[worst])) worst = i;
  });
  if (best === worst) return outs;
  // 正的 boost:把機率從最差的結果搬到最好的;負的反過來
  const m = boost >= 0 ? Math.min(boost, outs[worst].p) : -Math.min(-boost, outs[best].p);
  return outs.map((o, i) => (i === best ? { ...o, p: o.p + m } : i === worst ? { ...o, p: o.p - m } : o));
}

/** 每一件跟「人」有關的事(插曲除外)都有自己的氣氛:同樣的做法,碰到不同的對象結果會不同 */
export type { Mood };
const MOOD_TEXT: Record<GameEvent['kind'], Record<Mood, string>> = {
  客訴: { receptive: '這件事的氣氛不錯,對方願意聽官方怎麼說。', neutral: '這件事的氣氛普通,看你怎麼處理。', hostile: '這件事火氣很大,對方不太聽得進去。' },
  輿情: { receptive: '討論的風向偏友善,有人在幫官方說話。', neutral: '討論的風向普通,還看不出往哪邊倒。', hostile: '討論的風向很差,留言一面倒地不客氣。' },
  老闆: { receptive: '林總今天心情不錯,比較聽得進去。', neutral: '林總看起來和平常一樣。', hostile: '林總今天壓力很大,講話比較急。' },
  技術: { receptive: '工程師手上剛好有空檔,願意多幫一點。', neutral: '工程師的排程和平常差不多。', hostile: '工程師這週排程爆滿,心情也不太好。' },
  原廠: { receptive: '原廠窗口今天挺好說話。', neutral: '原廠的態度公事公辦。', hostile: '原廠這次很嚴格,不太留餘地。' },
  數據: { receptive: '這批資料比較乾淨,好整理。', neutral: '資料品質普通。', hostile: '資料亂得很,怎麼做都容易出錯。' },
  雜務: { receptive: '對方很客氣,不太催。', neutral: '對方的態度普通。', hostile: '對方很趕,語氣有點急。' },
  插曲: { receptive: '', neutral: '', hostile: '' },
};
/** 風向要跟這件事的對象對得上:林總、工程師、原廠、玩家與公開討論有各自的說法,其他對象一律用「對象本身」來說 */
function windText(ev: GameEvent, mood: Mood): string {
  const from = ev.from;
  if (from === '林總') return MOOD_TEXT.老闆[mood];
  if (from === '工程師') return MOOD_TEXT.技術[mood];
  if (from.startsWith('原廠')) return MOOD_TEXT.原廠[mood];
  if (ev.kind === '客訴') return MOOD_TEXT.客訴[mood];
  if (ev.kind === '輿情' && /論壇|社群|實況|商店/.test(from)) return MOOD_TEXT.輿情[mood];
  if (ev.kind === '數據' && from === '後台數據') return MOOD_TEXT.數據[mood];
  if (from === '你自己') return mood === 'receptive' ? '你今天狀態不錯。' : mood === 'hostile' ? '你今天有點煩躁。' : '你今天狀態普通。';
  const who = from.replace(/\s*vs\s*/g, '與');
  // 對象是資料來源、不是人的(問卷結果、應用商店、社群監控、回報):說內容,不說態度
  if (/結果|商店|監控|回報/.test(from)) return mood === 'receptive' ? `${who}的內容偏正面,不難處理。` : mood === 'hostile' ? `${who}的內容很不客氣,不好處理。` : `${who}的內容普通。`;
  return mood === 'receptive' ? `${who}的態度偏友善,聽得進去。` : mood === 'hostile' ? `${who}火氣不小,不太聽得進去。` : `${who}的態度普通,看你怎麼處理。`;
}

/** 氣氛主要牽動哪個數值:跟玩家有關的看信任,跟公司內部有關的看老闆 */
/** 這件事主要牽動哪個數值:玩家面的(信任、人數、留存)還是公司內部的(老闆好感) */
const mainStatCache = new Map<string, 'trust' | 'boss'>();
function moodStat(ev: GameEvent): 'trust' | 'boss' {
  let m = mainStatCache.get(ev.id);
  if (!m) {
    let player = 0; let boss = 0;
    for (const o of ev.options) for (const x of o.outcomes) {
      player += Math.abs(x.effects?.trust ?? 0) + Math.abs(x.effects?.players ?? 0) * 0.5 + Math.abs(x.effects?.retention ?? 0);
      boss += Math.abs(x.effects?.boss ?? 0);
    }
    m = player > boss ? 'trust' : (boss > player ? 'boss' : (['客訴', '輿情', '原廠'].includes(ev.kind) ? 'trust' : 'boss'));
    mainStatCache.set(ev.id, m);
  }
  return m;
}
const hasMood = (ev: GameEvent): boolean => ev.kind !== '插曲';

export function moodOf(item: InboxItem | undefined, ev: GameEvent): Mood {
  if (!hasMood(ev) || !item) return 'neutral';
  if (item.stage) return 'hostile'; // 上次沒處理才被催第二次,對方當然不開心
  if (item.v === undefined) return 'neutral';
  const r = seeded(item.v, SALT.mood)();
  return r < 0.3 ? 'receptive' : r < 0.8 ? 'neutral' : 'hostile';
}

/** 結果的數值不是固定的:大致落在原本的 0.6 到 1.4 倍,而且氣氛會讓主要數值的得失放大或縮小(正負號與「有沒有變動」不變) */
function tuneEffects(s: State, ev: GameEvent, e: Effects | undefined, mood: Mood): Effects | undefined {
  if (!e) return e;
  const out: Effects = { ...e };
  const main = moodStat(ev);
  for (const k of ['players', 'trust', 'boss'] as const) {
    const v = e[k];
    if (!v) continue;
    let f = 0.6 + rand(s) * 0.8;
    if (k === main) f *= v > 0 ? (mood === 'receptive' ? 1.2 : mood === 'hostile' ? 0.8 : 1) : (mood === 'hostile' ? 1.3 : 1);
    out[k] = Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * f));
  }
  return out;
}

/* ---------- 隱藏性格與做法的契合度 ---------- */

/** 每局開頭抽好的隱藏性格 */
export const bossTrait = (s: State): BossTrait => (s.traits?.boss as BossTrait) in BOSS_TRAITS ? (s.traits?.boss as BossTrait) : 'safe';
export const communityTrait = (s: State): CommunityTrait => (s.traits?.community as CommunityTrait) in COMMUNITY_TRAITS ? (s.traits?.community as CommunityTrait) : 'kind';

/** 這個做法,在這局的性格與這件事的氣氛下,吃不吃香(-3 到 +3) */
export function styleFit(s: State, ev: GameEvent, item: InboxItem | undefined, opt: EventOption): { trait: number; mood: number; total: number } {
  if (!hasMood(ev) || !opt.style) return { trait: 0, mood: 0, total: 0 };
  const table = moodStat(ev) === 'boss' ? BOSS_TRAITS[bossTrait(s)] : COMMUNITY_TRAITS[communityTrait(s)];
  const trait = table.levels[opt.style] ?? 0;
  const mood = MOOD_LEVELS[moodOf(item, ev)][opt.style] ?? 0;
  return { trait, mood, total: Math.max(-3, Math.min(3, trait + mood)) };
}

/** 選完之後的一句反應:只透露「這個做法合不合對方的胃口」,不直接說性格是什麼。
 *  結果和對方的態度相反時(欣賞卻失敗、不喜歡卻成功),換成不矛盾的說法 */
function fitFlavor(s: State, ev: GameEvent, item: InboxItem, opt: EventOption, net: number): string {
  const fit = styleFit(s, ev, item, opt);
  const lines: string[] = [];
  const isBoss = moodStat(ev) === 'boss';
  const table = isBoss ? BOSS_TRAITS[bossTrait(s)] : COMMUNITY_TRAITS[communityTrait(s)];
  // 玩家面的事,對象可能是玩家、記者或原廠,所以只說「對方」;公司內部的事,老闆不一定在場,就寫成他事後聽說
  const subject = isBoss ? (ev.from.includes('林總') ? '林總' : '林總事後聽說了,') : '';
  const who = isBoss ? '林總' : '對方';
  if (fit.trait > 0) lines.push(net < 0 ? `${who}其實欣賞這種做法,可惜這次沒成。` : `${subject}${table.good}`);
  else if (fit.trait < 0) lines.push(net > 0 ? `雖然不太對${who}的胃口,但這次結果還不錯。` : `${subject}${table.bad}`);
  const mood = moodOf(item, ev);
  if (fit.mood && mood !== 'neutral') {
    const good = fit.mood > 0;
    if (!(good && net < 0) && !(!good && net > 0)) lines.push(good ? MOOD_FLAVOR[mood].good : MOOD_FLAVOR[mood].bad);
  }
  return lines.length ? ` 🧭 ${lines.join('')}` : '';
}

/** 把契合度折成數值:主要數值加減 1 點(每一級) */
function addFit(e: Effects | undefined, main: 'trust' | 'boss', total: number): Effects | undefined {
  if (!total) return e;
  const out: Effects = { ...(e ?? {}) };
  out[main] = (out[main] ?? 0) + total;
  return out;
}

/** 事件文字裡偶爾藏一句氣氛線索(約六成會出現,出現了就是真的;沒出現不代表氣氛普通) */
function moodClue(ev: GameEvent, item?: InboxItem): string {
  if (!varies(item)) return '';
  const mood = moodOf(item, ev);
  if (mood === 'neutral') return '';
  const r = seeded(item.v, SALT.mood + 17);
  if (r() >= 0.6) return '';
  const pool = MOOD_CLUES[moodStat(ev) === 'boss' ? 'inner' : 'player'][mood];
  return pool[Math.floor(r() * pool.length)];
}

/* ---------- 看輿情的發現卡與持續狀態 ---------- */

export const RAPPORT_NEED = 3;

/** 單局內的難度攀升:越到後面,事件越多、逾期與失敗的代價越重。簡單慢一點,困難快一點 */
const THREAT_RATE: Record<Difficulty, number> = { easy: 0.6, normal: 1, hard: 1.2 };
export const threatLevel = (s: State): number => Math.floor((s.day - 1) / 3) + 1;
const threat = (s: State): number => Math.max(0, s.day - 1) * THREAT_RATE[s.difficulty] * PACE_MULT[paceOf(s).mode];

/** 導演看你離目標多遠:落後就放水、領先就加壓,讓每局都在剛好有挑戰的地方 */
export type PaceMode = 'ease' | 'normal' | 'press';
const PACE_MULT: Record<PaceMode, number> = { ease: 0.6, normal: 1, press: 1.35 };
export function paceOf(s: State): { mode: PaceMode; ratio: number; lag?: GoalKey } {
  if (!s.goals.length) return { mode: 'normal', ratio: 1 };
  const parts = s.goals.map((g) => ({ key: g.key, r: Math.min(1.3, goalValue(s, g.key) / g.target) }));
  const ratio = parts.reduce((a, c) => a + c.r, 0) / parts.length;
  const frac = s.mode === 'story' ? (s.day - 1) / STORY_DAYS : ((s.day - 1) % 10) / 10;
  const exp = 0.8 + 0.2 * frac;
  const lag = parts.reduce((a, c) => (c.r < a.r ? c : a)).key;
  if (s.day < 3) return { mode: 'normal', ratio, lag };
  return { mode: ratio < exp - 0.04 ? 'ease' : ratio > exp + 0.06 ? 'press' : 'normal', ratio, lag };
}

/** 落後的時候推一把:依落後最多的目標,給兩天順風 */
function pacedHelp(s: State): string | undefined {
  const p = paceOf(s);
  if (p.mode !== 'ease' || !p.lag || rand(s) > 0.7) return undefined;
  const id: BuffId = p.lag === 'trust' ? 'trustUp' : p.lag === 'boss' ? 'rapport' : 'hype';
  if (buffActive(s, id)) return undefined;
  addBuff(s, id, 2);
  return `🍀 落後目標,風向轉好:${BUFFS[id].icon} ${BUFFS[id].name}(2 天)`;
}

export const buffActive = (s: State, id: BuffId): boolean => (s.buffs ?? []).some((b) => b.id === id && b.until >= s.day);
export const activeBuffs = (s: State): { id: BuffId; left: number }[] =>
  (s.buffs ?? []).filter((b) => b.until >= s.day).map((b) => ({ id: b.id as BuffId, left: b.until - s.day + 1 }));

function addBuff(s: State, id: BuffId, days: number): void {
  if (id !== 'tired' && stratLv(s, 'fan_base')) days += 1;
  s.buffs = [...(s.buffs ?? []).filter((b) => b.id !== id), { id, until: s.day + days - 1 }];
}

/** 持續狀態對事件結果的加成:信任的得分、老闆好感的得失 */
function buffEffects(s: State, e: Effects | undefined): Effects | undefined {
  if (!e) return e;
  const out: Effects = { ...e };
  const tf = stratLv(s, 'trust_first'), bp = stratLv(s, 'boss_pet'), sh = stratLv(s, 'shield');
  const trustUp = 1 + 0.15 * tf + 0.04 * stratLv(s, 'allies') + (stratLv(s, 'evo_fan') ? 0.5 : 0) - 0.08 * bp - 0.05 * sh;
  const bossUp = 1 + 0.2 * bp - 0.05 * stratLv(s, 'tutor');
  const spr = Math.max(0.5, 1 - 0.04 * stratLv(s, 'sprint'));
  if ((out.trust ?? 0) > 0) out.trust = Math.ceil((out.trust as number) * Math.max(0.2, trustUp) * spr);
  if ((out.boss ?? 0) > 0) out.boss = Math.ceil((out.boss as number) * bossUp * spr);
  const cut = Math.max(0.1, 1 - 0.1 * sh) * (stratLv(s, 'evo_mentor') ? 0.7 : 1);
  if (cut < 1) {
    if ((out.trust ?? 0) < 0) out.trust = Math.round((out.trust as number) * cut);
    if ((out.boss ?? 0) < 0) out.boss = Math.round((out.boss as number) * cut);
  }
  if (s.curse === 'strict' && (out.boss ?? 0) < 0) out.boss = Math.round((out.boss as number) * 1.5);
  const heavy = Math.min(1.5, 1 + 0.018 * threat(s));
  if (heavy > 1.02) {
    if ((out.trust ?? 0) < 0) out.trust = Math.round((out.trust as number) * heavy);
    if ((out.boss ?? 0) < 0) out.boss = Math.round((out.boss as number) * heavy);
  }
  if (s.role === 'secretary' && (out.boss ?? 0) < 0) out.boss = Math.round((out.boss as number) * 0.8);
  if (buffActive(s, 'trustUp') && (out.trust ?? 0) > 0) out.trust = Math.ceil((out.trust as number) * 1.25);
  if (buffActive(s, 'rapport')) {
    if ((out.trust ?? 0) > 0) out.trust = Math.ceil((out.trust as number) * 1.5);
    if ((out.boss ?? 0) > 0) out.boss = Math.ceil((out.boss as number) * 1.5);
  }
  if (buffActive(s, 'bossAmp') && out.boss) out.boss = Math.sign(out.boss) * Math.ceil(Math.abs(out.boss) * 1.3);
  return out;
}

/** 從卡池抽三張:不重複,至少一張不是壞的、至少一張不用花點數 */
function drawScout(s: State): string[] {
  const pool = SCOUT_CARDS.filter((c) => !(c.needs === 'reports' && s.pendingReports <= 0)
    && !(c.needs === 'boss' && (!s.traits || s.traits.known.boss)) && !(c.needs === 'community' && (!s.traits || s.traits.known.community)));
  const picked: ScoutCard[] = [];
  const rest = [...pool];
  while (picked.length < 3 && rest.length) {
    let r = rand(s) * rest.reduce((a, c) => a + c.weight, 0);
    let i = 0;
    for (; i < rest.length - 1; i++) { r -= rest[i].weight; if (r <= 0) break; }
    picked.push(rest.splice(i, 1)[0]);
  }
  if (picked.every((c) => c.bad)) picked[2] = scoutCard('calm') as ScoutCard;
  if (picked.every((c) => c.ap > 0)) picked[picked.length - 1] = picked.some((c) => c.id === 'calm') ? scoutCard('guide') as ScoutCard : scoutCard('calm') as ScoutCard;
  return picked.map((c) => c.id);
}

/** 選一張發現卡;id 為 null 代表先觀望 */
export function pickScout(s: State, id: string | null): string | null {
  if (!s.scout) return '沒有待選的輿情報告';
  if (id === null) {
    s.scout = undefined;
    pushFeed(s, '你把輿情報告看過一遍,今天沒有餘力處理,讓這幾件事先過去。');
    return null;
  }
  if (!s.scout.cards.includes(id)) return '沒有這張卡';
  const c = scoutCard(id);
  if (!c) return '沒有這張卡';
  if (s.ap < c.ap) return '行動點數不足';
  s.ap -= c.ap;
  const cm = 1 + 0.25 * stratLv(s, 'community');
  applyEffects(s, cm === 1 || !c.effects ? c.effects : Object.fromEntries(Object.entries(c.effects).map(([k, v]) => [k, Math.round((v as number) * cm * 10) / 10])) as Effects);
  if (c.buff) addBuff(s, c.buff.id, c.buff.days);
  if (c.clearHabit) s.habits[c.clearHabit] = 0;
  if (c.reports) s.pendingReports = Math.max(0, s.pendingReports - c.reports);
  let extra = '';
  if (c.reveal && s.traits) {
    s.traits.known[c.reveal] = true;
    const t = c.reveal === 'boss' ? BOSS_TRAITS[bossTrait(s)] : COMMUNITY_TRAITS[communityTrait(s)];
    extra = ` 🧭 ${c.reveal === 'boss' ? '林總' : '玩家社群'}是「${t.name}」:${t.desc}`;
  }
  if (c.complaintTomorrow) {
    const pool = Object.values(EVENTS).filter((e) => (e.kind === '客訴' || e.kind === '輿情') && (e.weight ?? 0) > 0
      && (e.minDay ?? 1) <= s.day + 1 && (e.minLevel ?? 1) <= s.level && !s.inbox.some((i) => i.eventId === e.id));
    if (pool.length) {
      const ev = pickOf(s, leastSeen(s, pool));
      s.followUps.push({ eventId: ev.id, day: s.day + 1 });
      extra = ' 明天會多一件事。';
    }
  }
  s.scout = undefined;
  pushFeed(s, `📡 【${c.name}】${c.result}${extra}${effectNote(c.effects)}`);
  if (c.id === 'harsh' || c.id === 'rival') addMoment(s, 3, c.icon, `看輿情時遇到「${c.name}」。`);
  checkSudden(s);
  return null;
}

/** 看過輿情之後,當天與隔天都掌握得到風向 */
export const pulseActive = (s: State): boolean => (s.pulse !== undefined && s.day - s.pulse <= 1) || stratLv(s, 'insight') >= 3;
/** 看輿情直接加成的事件(客訴、輿情);其他事件掌握風向只會看到氣氛與提示 */
const isPulseEvent = (ev: GameEvent): boolean => ev.kind === '客訴' || ev.kind === '輿情';

/** 掌握風向時,事件在處理前就先看得出對方的氣氛(只看得出氣氛,不會告訴你怎麼做) */
export function pulseHint(s: State, ev: GameEvent, item?: InboxItem): string | undefined {
  if (!pulseActive(s) || !hasMood(ev)) return undefined;
  return windText(ev, moodOf(item, ev));
}

const ESCALATE_HINT = '上次沒處理,對方又來催了。';

/** 只留「這局出現最少次」的事件;同樣少的,再優先挑過去幾局也看得最少的 */
function leastSeen(s: State, list: GameEvent[]): GameEvent[] {
  const now = (e: GameEvent): number => s.seen[e.id] ?? 0;
  const minNow = Math.min(...list.map(now));
  const cur = list.filter((e) => now(e) === minNow);
  const past = (e: GameEvent): number => s.pastSeen?.[e.id] ?? 0;
  const minPast = Math.min(...cur.map(past));
  return cur.filter((e) => past(e) === minPast);
}

/** 事件內容提到活動的,要玩家真的辦過(或正在辦)才會出現 */
function campaignOk(s: State, e: GameEvent): boolean {
  if (!e.needsCampaign) return true;
  const ran = !!s.flags.campaignRan;
  return e.needsCampaign === 'done' ? ran : ran || s.campaign?.phase === 'live';
}

/** 事件文字裡有固定時間(凌晨、禮拜、明天…)的,不適合當成「下午、晚上突然冒出來」的突發事件 */
const FIXED_TIME = /凌晨|半夜|早上|明天|昨天|禮拜|週[一二三四五六日]|下午前|月底|週年/;

/* ---------- 突發事件:一天中途才冒出來(下午、晚上) ---------- */

/** 今天會不會有突發、什麼時候:每天早上先排好,時間到了(用掉一半、八成的行動點數)才出現 */
function scheduleSudden(s: State): void {
  s.sudden = [];
  s.alert = undefined;
  if (s.day < 2) return;
  const chance = Math.min(0.85, ({ easy: 0.15, normal: 0.3, hard: 0.45 }[s.difficulty]) * (1 + 0.1 * (threatLevel(s) - 1)) * (paceOf(s).mode === 'ease' ? 0.7 : paceOf(s).mode === 'press' ? 1.25 : 1));
  if (rand(s) < chance) s.sudden.push({ at: 'pm' });
  if (rand(s) < chance * 0.6) s.sudden.push({ at: 'eve' });
}

/** 做完會花行動點數的事之後檢查:用到一定程度,排好的突發事件就冒出來 */
function checkSudden(s: State): void {
  if (!s.sudden?.length || s.over || s.maxAp <= 0) return;
  const spent = (s.maxAp - s.ap) / s.maxAp;
  for (const x of s.sudden) {
    if (x.fired || spent < (x.at === 'pm' ? 0.5 : 0.8)) continue;
    x.fired = true;
    const th = dominantTheme(s);
    const rank = DIFF_ORDER.indexOf(s.difficulty);
    let pool = Object.values(EVENTS).filter((e) => (e.weight ?? 0) > 0 && ['客訴', '輿情', '技術', '原廠'].includes(e.kind)
      && (e.minDay ?? 1) <= s.day && (e.minLevel ?? 1) <= s.level && DIFF_ORDER.indexOf(e.minDifficulty ?? 'easy') <= rank
      && campaignOk(s, e) && !FIXED_TIME.test(e.title + (e.brief ?? '') + e.body) && !s.inbox.some((i) => i.eventId === e.id));
    if (!pool.length || s.inbox.length >= 9) continue;
    pool = leastSeen(s, pool);
    const w = pool.map((e) => (e.weight ?? 0) * (th && COUNTER_KINDS[th].includes(e.kind) ? 1.8 : 1));
    let r = rand(s) * w.reduce((a, b) => a + b, 0);
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { pick = pool[i]; break; } }
    addEvent(s, pick.id, '突發!');
    const it = s.inbox[s.inbox.length - 1];
    it.sudden = true;
    it.deadline = s.day;
    const when = x.at === 'pm' ? '☀️ 下午' : '🌙 晚上';
    s.alert = `${when}突然來了一件事:${eventText(pick, it).title}`;
    pushLog(s, s.day, `🚨 ${s.alert}`);
  }
}

function spawnDay(s: State): void {
  s.dayStart = { boss: s.boss, trust: s.trust, players: s.players };
  scheduleSudden(s);
  s.dayLine = dayOpeningLine(s);
  pushLog(s, s.day, `🌤️ ${s.dayLine}`);
  const ph = phaseOf(s.day);
  if (ph.first) pushLog(s, s.day, `📌 進入${PHASES[ph.key].name}:${PHASES[ph.key].blurb}`);
  // 到期的後續事件
  s.followUps = s.followUps.filter((f) => {
    if (f.day <= s.day) { addEvent(s, f.eventId, f.stage ? ESCALATE_HINT : undefined, f.stage ?? 0); return false; }
    return true;
  });
  // 劇情固定事件(僅劇情模式)
  if (s.mode === 'story') {
    for (const ev of Object.values(EVENTS)) if (ev.day === s.day) addEvent(s, ev.id);
  }
  // 週報
  if (s.day % 5 === 0) addEvent(s, 'e_weekly');
  // 首領:每 5 天一個,前一天已預告
  if (s.day % 5 === 4) s.bossNext = pickBoss(s);
  if (s.day % 5 === 0) { addEvent(s, s.bossNext ?? pickBoss(s)); s.bossNext = undefined; }
  // 連鎖事件:日常累計到一個程度,就會爆出來(每天最多一件)
  const chains = Object.values(EVENTS).filter((e) => e.trigger
    && (s.habits[e.trigger.habit] ?? 0) >= e.trigger.min
    && !s.inbox.some((i) => i.eventId === e.id)
    && DIFF_ORDER.indexOf(e.minDifficulty ?? 'easy') <= DIFF_ORDER.indexOf(s.difficulty));
  if (chains.length && s.day > 2 && rand(s) < 0.75) {
    const ev = chains[Math.floor(rand(s) * chains.length)];
    addEvent(s, ev.id, ev.hint);
    addMoment(s, 7, '🔗', `${quoted(ev.title)}找上門——這是你累積「${HABITS[ev.trigger!.habit]?.label ?? ev.trigger!.habit}」的結果。`);
    s.habits[ev.trigger!.habit] = 0;
  }
  // 隨機事件
  // 劇情只有 10 天:每天的事件總量有上限,上線期最忙;固定事件、催辦、連鎖先算進去,不足才用隨機事件補
  const arrivedToday = s.inbox.filter((i) => i.arrived === s.day && EVENTS[i.eventId].kind !== '插曲').length;
  const base = s.mode === 'story' ? Math.max(0, (ph.key === 'launch' ? 2 : 1) - arrivedToday) : Math.min(4, 1 + Math.floor(s.day / 8));
  const d = DIFFS[s.difficulty];
  const want = Math.max(0, base - (s.sudden?.length ? 1 : 0)) + (s.day >= d.extraFrom && rand(s) < d.extraChance ? d.extraEvents : 0) + (s.curse === 'rush' ? 1 : 0) + Math.min(3, Math.floor(threat(s) / 5));
  const cap = s.difficulty === 'hard' ? 8 : 7;
  const rank = DIFF_ORDER.indexOf(s.difficulty);
  for (let n = 0; n < want && s.inbox.length < cap; n++) {
    let pool = Object.values(EVENTS).filter(
      (e) => (e.weight ?? 0) > 0 && (e.minDay ?? 1) <= s.day && !s.inbox.some((i) => i.eventId === e.id)
        && DIFF_ORDER.indexOf(e.minDifficulty ?? 'easy') <= rank && (e.minLevel ?? 1) <= s.level && campaignOk(s, e),
    );
    if (!pool.length) break;
    // 多數時候偏向當下階段的事件,偶爾來點意料之外的
    const inPhase = pool.filter((e) => e.phase?.includes(ph.key));
    if (inPhase.length && rand(s) < 0.75) pool = inPhase;
    // 抽完一輪才會重複:只從「出現次數最少」的事件裡抽
    pool = leastSeen(s, pool);
    const th = dominantTheme(s);
    const weights = pool.map((e) => (e.weight ?? 0) * (th && COUNTER_KINDS[th].includes(e.kind) ? 1.8 : 1));
    let r = rand(s) * weights.reduce((a, b) => a + b, 0);
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { pick = pool[i]; break; } }
    addEvent(s, pick.id);
  }
  // 同事偶爾自作主張,闖出一點麻煩(他擅長的做法,也是他容易用過頭的做法)
  s.colSay = s.colleague && rand(s) < 0.45 ? pickOf(s, MATE_LINES[s.colleague.style].idle) : undefined;
  if (s.colleague && s.day >= 3 && rand(s) < 0.2 + 0.08 * s.colleague.level) {
    addEvent(s, `col_${s.colleague.style}`, '同事自作主張,事情有了後續。');
    s.colSay = MATE_LINES[s.colleague.style].oops;
  }
  // 只有帶了同事才有的事:同事提議、來請教、帶來消息(約兩成的日子多一件)
  if (s.colleague && s.day >= 2 && s.inbox.length < 8 && rand(s) < 0.2) {
    let pool = Object.values(EVENTS).filter((e) => e.colleague && (!e.colStyle || e.colStyle === s.colleague!.style) && !s.inbox.some((i) => i.eventId === e.id));
    if (pool.length) { pool = leastSeen(s, pool); addEvent(s, pickOf(s, pool).id); }
  }
  // 風格事件:跨局累積的風格達到等級,就會遇到它專屬的機會(約三成的日子一件)
  if (s.day >= 2 && s.inbox.length < 8 && rand(s) < 0.3) {
    let pp = Object.values(EVENTS).filter((e) => e.persona && (s.persona?.[e.persona] ?? 0) >= (e.personaLv ?? 1) && !s.inbox.some((i) => i.eventId === e.id));
    if (pp.length) { pp = leastSeen(s, pp); addEvent(s, pickOf(s, pp).id, '你的風格帶來的機會。'); }
  }
  // 小插曲:不佔事件名額、沒有逾期懲罰,偶爾穿插一下
  if (s.day >= 2 && rand(s) < 0.4) {
    let ip = Object.values(EVENTS).filter((e) => e.kind === '插曲' && !e.persona && !s.inbox.some((i) => i.eventId === e.id));
    if (ip.length) {
      ip = leastSeen(s, ip);
      addEvent(s, pickOf(s, ip).id);
    }
  }
}

/* ---------- 玩家動作 ---------- */

export function chooseOption(s: State, uid: number, optIndex: number): string | null {
  const item = s.inbox.find((i) => i.uid === uid);
  if (!item) return '事件已不存在';
  const ev = EVENTS[item.eventId];
  const opt = eventOptions(s, ev, item)[optIndex];
  if (!opt) return '沒有這個選項';
  const cost = optionCost(s, item, opt);
  if (s.ap < cost) return '行動點數不足';
  s.ap -= cost;
  const helped = cost !== optionCost(s, item, opt, true);
  if (optionCost(s, item, opt, false, true) !== cost) s.sprintUsed = { day: s.day, n: (s.sprintUsed?.day === s.day ? s.sprintUsed.n : 0) + 1 };
  if (helped) s.colHelp = { day: s.day, n: (s.colHelp?.day === s.day ? s.colHelp.n : 0) + 1 };
  let outs = opt.outcomes;
  let boost = 0;
  if (opt.tag === 'quick') boost += 0.08 * stratLv(s, 'quick_report');
  if (pulseActive(s) && isPulseEvent(ev)) boost += 0.1;
  if (s.role === 'support' && isPulseEvent(ev)) boost += 0.15;
  if (isPulseEvent(ev)) boost += 0.04 * stratLv(s, 'quick_reply');
  boost += 0.02 * stratLv(s, 'lucky');
  if (opt.gamble) boost += 0.04 * stratLv(s, 'gambler') + (stratLv(s, 'evo_gambit') ? 0.15 : 0);
  if (ev.boss) {
    const lv = themeLevels(s);
    boost += Math.min(0.3, 0.05 * (ev.answers ?? []).reduce((a, k) => a + (lv[k as Theme] ?? 0), 0));
  }
  const mood = moodOf(item, ev);
  const fit = styleFit(s, ev, item, opt);
  boost += fit.total * 0.06;
  if (opt.style) { const u = s.styleUse ?? (s.styleUse = {}); u[opt.style] = (u[opt.style] ?? 0) + 1; }
  if (boost && outs.length > 1) outs = boostOutcomes(outs, boost);
  let r = rand(s);
  let out: Outcome = outs[outs.length - 1];
  for (const o of outs) { r -= o.p; if (r <= 0) { out = o; break; } }
  let base = hasMood(ev) ? tuneEffects(s, ev, out.effects, mood) : out.effects;
  const gl = stratLv(s, 'gambler');
  if (opt.gamble && gl && base) {
    const sc: Effects = {};
    for (const [k, v] of Object.entries(base) as [keyof Effects, number][]) sc[k] = Math.round(v * (v > 0 ? 1 + 0.1 * gl : stratLv(s, 'evo_gambit') ? 1 : 1 + 0.15 * gl) * 10) / 10;
    base = sc;
  }
  // 加成只落在這個結果本來就會動到的數值上:跟老闆(或玩家)沒關係的事,不會憑空多出老闆(或信任)的分數
  const main = moodStat(ev);
  const touchesMain = !!out.effects?.[main];
  const eff = buffEffects(s, touchesMain ? addFit(base, main, fit.total) : base);
  applyEffects(s, eff);
  if (out.setFlag) s.flags[out.setFlag] = true;
  if (out.reports) s.pendingReports = Math.max(0, s.pendingReports + out.reports);
  const note = addHabits(s, out.habit);
  let chainNote = '';
  if (out.followUp) {
    if (out.followUp.afterDays <= 0) {
      // 當天連帶:你剛做的選擇,馬上引出另一件事
      const ce = EVENTS[out.followUp.eventId];
      if (ce) {
        addEvent(s, ce.id, ce.hint ?? '因為你剛剛的選擇,事情有了後續。');
        chainNote = ` 🔔 後續:「${ce.title}」`;
      }
    } else s.followUps.push({ eventId: out.followUp.eventId, day: s.day + out.followUp.afterDays });
  }
  let extra = '';
  if (out.reveal) extra = ' ' + revealIntel(s, out.reveal);
  extra += fitFlavor(s, ev, item, opt, netOf(out.effects));
  if (impactOf(eff) >= 5) {
    addMoment(s, impactOf(eff), netOf(eff) >= 0 ? '✨' : '⚠️', `${quoted(eventText(ev, item).title)}${opt.label}——${out.result}`);
  }
  // 默契:連續選中對方胃口的做法會累積,三次就進入「默契」狀態;選到不合的做法就中斷
  if (s.colleague && opt.style === s.colleague.style) s.colSay = pickOf(s, MATE_LINES[s.colleague.style].agree);
  let rapportNote = helped ? ' 👥 同事幫了一把,少花 1 點。' : '';
  if (hasMood(ev) && opt.style) {
    if (fit.total > 0) {
      s.rapport = (s.rapport ?? 0) + 1;
      if (s.rapport >= RAPPORT_NEED) {
        s.rapport = 0;
        gainAch(s, 'rapport');
        addBuff(s, 'rapport', 3);
        rapportNote += ' 🤝 默契到了!接下來 3 天,好的結果加成 50%。';
        addMoment(s, 8, '🤝', `連續摸中對方的胃口,和對方有了默契。`);
      }
    } else if (fit.total < 0 && (s.rapport ?? 0) > 0) {
      s.rapport = 0;
      rapportNote += ' 💔 默契中斷了。';
    }
  }
  const net = netOf(eff);
  const up = gainXp(s, 8 + Math.min(14, impactOf(eff)) + (net > 0 ? 4 : 0) + (ev.boss ? (net > 0 ? 60 : 25) : 0) + (item.sudden ? 12 : 0));
  const tier: Verdict['tier'] = net >= 5 ? 'great' : net >= 1 ? 'good' : net <= -5 ? 'awful' : net <= -1 ? 'bad' : 'flat';
  s.inbox = s.inbox.filter((i) => i.uid !== uid);
  const line = `【${eventText(ev, item).title}】${opt.label} → ${out.result}${extra}${effectNote(eff)}${chainNote}${note}${rapportNote}${ev.boss ? (net > 0 ? ' 💀 首領擊退!' : ' 💀 勉強撐過') : ''}${up ? ` ⭐ 升級!Lv ${s.lv}` : ''}`;
  pushFeed(s, line);
  s.verdict = { tier, line, eff: eff ?? {} };
  if (ev.boss) s.bossResult = { title: ev.title.replace('首領:', ''), win: net > 0, text: out.result, eff: effectNote(eff).replace(/^\(|\)$/g, ''), xp: net > 0 ? 60 : 25 };
  checkSudden(s);
  return null;
}

function effectNote(e?: Effects): string {
  if (!e) return '';
  const names: [keyof Effects, string, string][] = [
    ['players', '玩家', '%'], ['retention', '留存', ''], ['trust', '信任', ''], ['boss', '老闆', ''],
  ];
  const parts = names
    .filter(([k]) => e[k])
    .map(([k, n, u]) => `${n}${(e[k] as number) > 0 ? '+' : ''}${e[k]}${u}`);
  return parts.length ? `(${parts.join(' ')})` : '';
}

function revealIntel(s: State, kind: 'reward' | 'hated' | 'boss' | 'community'): string {
  if (kind === 'boss' || kind === 'community') {
    if (!s.traits || s.traits.known[kind]) return '';
    s.traits.known[kind] = true;
    const tr = kind === 'boss' ? BOSS_TRAITS[bossTrait(s)] : COMMUNITY_TRAITS[communityTrait(s)];
    return `🧭 ${kind === 'boss' ? '林總' : '玩家社群'}是「${tr.name}」:${tr.desc}`;
  }
  if (kind === 'reward') {
    s.intel.reward = true;
    return `發現:玩家最近特別想要「${find(CONTENT.rewards, s.taste.reward).name}」。`;
  }
  s.intel.hated = true;
  return `發現:玩家對「${find(CONTENT.mechanics, s.taste.hated).name}」類活動有點怨言。`;
}

/** 玩法、獎勵、商品、宣傳之間的搭配:選對了有額外加成,上線時才會算進成績 */
export interface Combo { name: string; desc: string; pairs: [keyof PlanSel, string][]; fun?: number; appeal?: number; desire?: number; reach?: number }
export const COMBOS: Combo[] = [
  { name: '日常累積', desc: '天天簽到加上碎片,玩家習慣成自然。', pairs: [['mechanic', 'signin'], ['reward', 'shard']], desire: 8 },
  { name: '副本掉落', desc: '副本裡打出強化素材,很合理。', pairs: [['mechanic', 'dungeon'], ['reward', 'material']], fun: 8 },
  { name: '榮耀競賽', desc: '公會競賽配專屬稱號,愛比較的人最買單。', pairs: [['mechanic', 'guild'], ['reward', 'title']], fun: 8, appeal: 8 },
  { name: '登峰造極', desc: '爬塔的核心玩家想要限定造型。', pairs: [['mechanic', 'tower'], ['reward', 'skin']], appeal: 10 },
  { name: '天選之人', desc: '抽獎配上十連抽券,期待感拉滿。', pairs: [['mechanic', 'lottery'], ['reward', 'ticket']], fun: 6, appeal: 6 },
  { name: '造型成套', desc: '拿到限定造型的人,更想買同款禮包。', pairs: [['reward', 'skin'], ['bundle', 'skinpack']], desire: 10 },
  { name: '老朋友回來', desc: '簽到活動配月卡,回流的人很容易上手。', pairs: [['mechanic', 'signin'], ['bundle', 'monthly']], desire: 10 },
  { name: '看戲的人多', desc: '實況主最愛播高難度內容。', pairs: [['promo', 'streamer'], ['mechanic', 'tower']], reach: 8 },
  { name: '精準召回', desc: '回流信件配公會對抗賽,老玩家一拍即合。', pairs: [['promo', 'mail'], ['mechanic', 'guild']], reach: 8, fun: 4 },
];

/** 目前選的企劃,碰到了哪些搭配 */
export function combosFor(sel: PlanSel): Combo[] {
  return COMBOS.filter((c) => c.pairs.every(([k, id]) => sel[k] === id));
}

export function planCost(sel: PlanSel, s?: State): number {
  return 2 + find(CONTENT.promos, sel.promo).ap + (s && stratLv(s, 'campaign_pro') >= 3 ? 1 : 0);
}

export function planCampaign(s: State, sel: PlanSel): string | null {
  if (s.campaign && s.campaign.phase !== 'done') return '目前已經有活動在進行';
  const locked = [
    find(CONTENT.mechanics, sel.mechanic), find(CONTENT.rewards, sel.reward),
    find(CONTENT.bundles, sel.bundle), find(CONTENT.promos, sel.promo),
  ].some((x) => (x.minLevel ?? 1) > s.level);
  if (locked) return '選項尚未解鎖';
  const cost = planCost(sel, s);
  if (s.ap < cost) return '行動點數不足';
  s.ap -= cost;
  s.campaign = {
    ...sel, launchDay: s.day + sel.delay, polish: 0, checked: false, bugged: false,
    phase: 'planned', liveDaysLeft: 0, lift: 0,
  };
  if (sel.delay >= 2) s.followUps.push({ eventId: 'e_tech_deadline', day: s.day + 1 });
  pushFeed(s, `你送出活動企劃,預計第 ${s.campaign.launchDay} 天上線。`);
  return null;
}

export type ActionKind = 'polish' | 'check' | 'intel' | 'report' | 'sloppy';

export function doAction(s: State, kind: ActionKind): string | null {
  const free = (kind === 'report' && reportFree(s))
    || (kind === 'polish' && s.role === 'planner' && s.campaign?.phase === 'planned' && s.campaign.polish === 0);
  if (kind !== 'sloppy' && !free && s.ap < 1) return '行動點數不足';
  const c = s.campaign;
  if (kind === 'polish') {
    if (!c || c.phase !== 'planned') return '沒有待上線的活動';
    if (c.polish >= 4) return '已經打磨到極限';
    c.polish++;
    pushFeed(s, `你調整了活動細節(打磨 ${c.polish}/4)。`);
  } else if (kind === 'check') {
    if (!c || c.phase !== 'planned') return '沒有待上線的活動';
    if (c.checked) return '已經驗收過了';
    c.checked = true;
    pushFeed(s, '你請工程師做了上線前驗收,他發現並修了兩個小問題。');
  } else if (kind === 'intel') {
    if (s.pulse === s.day) return '今天已經看過輿情了';
    const found: string[] = [];
    if (stratLv(s, 'social_sense')) {
      if (!s.intel.reward) found.push(revealIntel(s, 'reward'));
      if (!s.intel.hated) found.push(revealIntel(s, 'hated'));
    } else if (!(s.intel.reward && s.intel.hated)) found.push(revealIntel(s, s.intel.reward ? 'hated' : 'reward'));
    s.pulse = s.day;
    // 有在看,玩家感覺得到:「忽視玩家」的累積減 1
    const listened = (s.habits.ignored_players ?? 0) > 0;
    if (listened) s.habits.ignored_players--;
    s.scout = { day: s.day, cards: drawScout(s), listened, found: found.join(' ') || undefined };
    pushFeed(s, `你花了一段時間爬論壇與社群。${found.join(' ')} 整理成一份輿情報告,也掌握了風向。`.replace('  ', ' '));
  } else if (kind === 'sloppy') {
    if (s.pendingReports <= 0) return '沒有待填的日報';
    s.pendingReports--;
    pushFeed(s, '你把日報填完了。至於內容,大概是上週的樣子。' + addHabits(s, { sloppy_report: 1 }));
    return null;
  } else {
    if (s.pendingReports <= 0) return '沒有待填的日報';
    s.pendingReports--;
    pushFeed(s, '你認真填了一份日報。欄位跟昨天一樣,只有數字不同。');
  }
  if (!free) s.ap -= 1;
  checkSudden(s);
  return null;
}

/* ---------- 活動結算 ---------- */

function launch(s: State, lines: string[]): void {
  const c = s.campaign as Campaign;
  const mech = find(CONTENT.mechanics, c.mechanic);
  const reward = find(CONTENT.rewards, c.reward);
  const bundle = find(CONTENT.bundles, c.bundle);
  const promo = find(CONTENT.promos, c.promo);
  // 預測模型:成績的隨機起伏減半
  const noise = () => (rand(s) - 0.5) * 16 * (s.role === 'analyst' ? 0.5 : 1);

  let fun = mech.fun + c.polish * 10 - Math.max(0, mech.need - c.polish) * 9;
  if (mech.id === s.taste.hated) fun -= 22;
  let appeal = reward.appeal + (reward.id === s.taste.reward ? 20 : 0);
  let desire = bundle.desire + (appeal - 50) * 0.3;
  if (bundle.risky && s.trust < 55) desire -= 25;
  let reach = promo.reach + 10;
  const combos = combosFor(c);
  for (const cb of combos) { fun += cb.fun ?? 0; appeal += cb.appeal ?? 0; desire += cb.desire ?? 0; reach += cb.reach ?? 0; }
  if (combos.length) {
    s.flags.comboRun = true;
    lines.push(`✨ 搭配加成:${combos.map((cb) => `「${cb.name}」`).join('')}。${combos[0].desc}`);
  }
  fun = clamp(fun + noise(), 5, 100);
  appeal = clamp(appeal + noise(), 5, 100);
  desire = clamp(desire + noise(), 5, 100);
  const reachN = clamp(reach + noise(), 5, 100);

  const participation = (reachN / 100) * (0.35 + 0.65 * (fun / 100));
  let lift = 1.1 * participation * (desire / 100) * (0.4 + 0.6 * (appeal / 100));
  lift *= Math.max(0.3, 1 - 0.06 * stratLv(s, 'trust_first')) * (1 + 0.15 * stratLv(s, 'revenue')) * Math.max(0.5, 1 - 0.04 * stratLv(s, 'lowkey')) * (stratLv(s, 'evo_fan') ? 1.3 : 1) * Math.max(0.5, 1 - 0.03 * stratLv(s, 'frugal')) * (stratLv(s, 'evo_cash') ? 1.4 : 1) * (s.curse === 'cheap' ? 0.8 : 1);

  const bugChance = (0.12 + (c.checked ? 0 : 0.25) + (s.flags.rushedTech ? 0.2 : 0)) * Math.max(0.1, 1 - 0.15 * stratLv(s, 'campaign_pro')) * Math.max(0.1, 1 - 0.08 * stratLv(s, 'checklist'));
  c.bugged = rand(s) < bugChance;
  if (c.bugged) {
    lift *= 0.7;
    applyEffects(s, { trust: -4 });
    addEvent(s, 'e_bug_after_launch');
    lines.push('⚠️ 活動上線了,但領獎出現問題。(信任-4,營收提升打了七折)');
    addMoment(s, 5, '⚠️', `活動「${mech.name}」上線時領獎出問題,營收提升打了七折。`);
  }
  c.scores = { fun, appeal, desire, reach: reachN };
  c.lift = lift;
  c.phase = 'live';
  c.liveDaysLeft = LIVE_DAYS;
  const ht = stratLv(s, 'hype_team');
  applyEffects(s, { players: Math.round(participation * 8 * (1 + 0.25 * ht + (stratLv(s, 'evo_viral') ? 0.5 : 0))), retention: (fun - 50) / 12 - 0.3 * ht });
  lines.push(`🎉 「${mech.name}」活動上線了!預計持續 ${LIVE_DAYS} 天。`);
}

function finishCampaign(s: State, lines: string[]): void {
  const c = s.campaign as Campaign;
  s.flags.campaignRan = true;
  const sc = c.scores!;
  c.phase = 'done';
  s.flags.rushedTech = false;
  const pct = Math.round(c.lift * 100);
  const targetPct = Math.round(CAMPAIGN_TARGET * 100);
  const mech = find(CONTENT.mechanics, c.mechanic);

  const factors: [number, string][] = [
    [sc.fun, mech.id === s.taste.hated
      ? '不好玩:這類玩法在玩家之間口碑偏差,又累又沒有成就感。'
      : '不好玩:玩家參與一次就失去興趣,沒有繼續玩的理由。'],
    [sc.appeal, '獎勵不吸引:玩家想要的不是這個,光是領獎沒有心動的感覺。'],
    [sc.desire, '沒有打到購買慾:活動有人玩,但商品沒有讓人想掏錢的理由。'],
    [sc.reach, '沒人知道:好活動沒被看見,再好也是白做。'],
  ];
  factors.sort((a, b) => a[0] - b[0]);

  let verdict: string;
  if (c.lift >= CAMPAIGN_TARGET) {
    applyEffects(s, { boss: 10, trust: 2 });
    gainAch(s, 'campaign_hit');
    verdict = `✅ 活動檢討:日營收平均提升 ${pct}%,達成目標 ${targetPct}%!老闆很滿意。(老闆+10 信任+2)`;
    addMoment(s, 9, '🎉', `活動「${mech.name}」日營收提升 ${pct}%,達成老闆的 ${targetPct}% 目標。`);
  } else if (c.lift >= 0.15) {
    applyEffects(s, { boss: 2 });
    addMoment(s, 4, '🟡', `活動「${mech.name}」提升 ${pct}%,沒達標但交代得過去。`);
    verdict = `🟡 活動檢討:日營收平均提升 ${pct}%,低於目標 ${targetPct}%,但還算交代得過去。(老闆+2)\n最大的缺點:${factors[0][1]}`;
  } else {
    applyEffects(s, { boss: -8, trust: -2 });
    addMoment(s, 8, '💥', `活動「${mech.name}」只提升 ${pct}%,主因是${factors[0][1].split(':')[0]}。`);
    verdict = `❌ 活動檢討:日營收平均只提升 ${pct}%,遠低於目標 ${targetPct}%。(老闆-8 信任-2)\n主要原因:${factors[0][1]}`;
  }
  verdict += `\n💬 玩家留言:${pickOf(s, c.lift >= CAMPAIGN_TARGET ? QUOTES_HIT : c.lift >= 0.15 ? QUOTES_OK : QUOTES_MISS)}`;
  if (c.polish < mech.need) verdict += `\n另外:時間太趕,細節還有 ${mech.need - c.polish} 次打磨沒做完。`;
  if (c.bugged) verdict += '\n另外:上線時出了問題,拖累了成績。';
  // 餘波:大賣之後熱度還在;玩家預先買光了,接下來幾天消費會變少;搞砸了,抱怨會延燒
  const bundle = find(CONTENT.bundles, c.bundle);
  if (c.lift >= CAMPAIGN_TARGET) {
    addBuff(s, 'hype', 4);
    verdict += '\n🔥 餘波:話題還在發酵,接下來 3 天玩家人數每天多一點。';
    if (s.flags.comboRun) gainAch(s, 'combo');
  } else if (c.lift < 0.15) {
    const pool = ['e_gacha_complaint', 'e_refund', 'e_social_meme'].filter((id) => !s.inbox.some((i) => i.eventId === id));
    if (pool.length) { s.followUps.push({ eventId: pickOf(s, pool), day: s.day + 1 }); verdict += '\n💢 餘波:玩家的失望在論壇發酵,明天會多一件事。'; }
  }
  if (bundle.id !== 'none' && c.lift >= 0.15 && !stratLv(s, 'evo_cash')) {
    const dip = stratLv(s, 'evo_cash') ? 0 : Math.min(0.12, c.lift * 0.2 * (bundle.desire / 100) + 0.02) * Math.max(0, 1 - 0.2 * stratLv(s, 'frugal'));
    s.spendDip = { until: s.day + 3, pct: Math.round(dip * 100) / 100 };
    verdict += `\n📉 餘波:想買的人活動期間都買了,接下來 3 天日營收約少 ${Math.round(dip * 100)}%。`;
  }
  s.flags.comboRun = false;
  lines.push(verdict);
}

/* ---------- 結束一天 ---------- */

export function endDay(s: State): DaySummary {
  const lines: string[] = [];
  const before = { players: s.players, retention: s.retention, trust: s.trust, boss: s.boss };
  const prevSpend = s.history[s.history.length - 1]?.spend ?? spendToday(s);

  // 1. 逾期事件
  s.inbox = s.inbox.filter((it) => {
    if (it.deadline <= s.day) {
      const ev = EVENTS[it.eventId];
      if (ev.kind === '插曲') return false; // 插曲過期就悄悄消失,沒有懲罰也不記拖延
      if (stratLv(s, 'buffer') && !s.flags.bufferUsed && !it.stage && Object.values(ev.ignore.effects).some((v) => (v ?? 0) < 0)) {
        s.flags.bufferUsed = true;
        lines.push(`🕰️ ${quoted(ev.title)}逾期了,但你事先留了緩衝,對方沒有追究。(這局只有一次)`);
        return false;
      }
      const mult = stratLv(s, 'evo_iron') ? 0 : DIFFS[s.difficulty].ignoreMult * (1 + 0.2 * stratLv(s, 'all_hands')) * Math.max(0.1, 1 - 0.12 * stratLv(s, 'lowkey')) * (1 + 0.03 * threat(s)) * (it.sudden ? 0.35 : 1);
      const pen: Effects = {};
      for (const [k, v] of Object.entries(ev.ignore.effects) as [keyof Effects, number][]) pen[k] = v < 0 ? Math.round(v * mult) : v;
      const hurts = Object.values(ev.ignore.effects).some((v) => (v ?? 0) < 0);
      if (it.stage) {
        // 再次逾期:不了了之,代價更重
        for (const k of Object.keys(pen) as (keyof Effects)[]) if ((pen[k] ?? 0) < 0) pen[k] = Math.round((pen[k] as number) * 1.5);
        applyEffects(s, pen);
        addHabits(s, { ...(ev.ignore.habit ?? {}), procrastinate: 1 });
        lines.push(`🔥 ${quoted(ev.title)}第二次逾期,這件事不了了之,對方很失望。${effectNote(pen)}`);
        addMoment(s, 6 + impactOf(pen) / 2, '🔥', `${quoted(ev.title)}拖到第二次逾期,最後不了了之。`);
      } else {
        applyEffects(s, pen);
        addHabits(s, { ...(ev.ignore.habit ?? {}), procrastinate: 1 });
        if (hurts) {
          s.followUps.push({ eventId: it.eventId, day: s.day + 1, stage: 1 });
          lines.push(`⏰ ${quoted(ev.title)}逾期:${ev.ignore.result}${effectNote(pen)}\n對方明天會再來催,而且處理會更費力。`);
          if (impactOf(pen) >= 5) addMoment(s, impactOf(pen), '⏰', `${quoted(ev.title)}沒處理到逾期:${ev.ignore.result}`);
        } else lines.push(`⏰ ${quoted(ev.title)}逾期:${ev.ignore.result}`);
      }
      return false;
    }
    return true;
  });

  // 2. 當日營收入帳 + 活動進度
  const spend = spendToday(s);
  s.history.push({ day: s.day, players: s.players, spend });
  if (s.campaign?.phase === 'live') {
    s.campaign.liveDaysLeft--;
    if (s.campaign.liveDaysLeft <= 0) finishCampaign(s, lines);
  }

  // 3. 報表壓力
  s.pendingReports++;
  if (s.day % 5 === 0 && s.pendingReports >= 3) {
    applyEffects(s, { boss: -Math.round(8 * (1 + 0.2 * stratLv(s, 'community'))) });
    lines.push(`📋 週報檢查:還有 ${s.pendingReports} 份日報沒填,林總在會議上特別點名。(老闆-8)`);
  } else if (s.pendingReports >= 5) {
    applyEffects(s, { boss: -2 });
    lines.push(`📋 日報累積了 ${s.pendingReports} 份,資料夾開始有生命力。(老闆-2)`);
  }

  if (s.pendingReports >= 3) addHabits(s, { late_reports: 1 });
  if (s.day % 5 === 0) for (const k of Object.keys(s.habits)) s.habits[k] = Math.max(0, s.habits[k] - 1);

  // 4. 自然變化
  if (buffActive(s, 'hype')) applyEffects(s, { players: 0.3 });
  s.retention += (38 - s.retention) * 0.05;
  if (stratLv(s, 'revenue') && s.day % 2 === 0) applyEffects(s, { trust: -Math.ceil(stratLv(s, 'revenue') / 2) });
  const growth = (s.retention - 35) * 0.0007 + (s.trust - 50) * 0.0002 + (rand(s) - 0.5) * 0.012 - stratLv(s, 'data_driven') * 0.0005 - stratLv(s, 'insight') * 0.0004 + (stratLv(s, 'evo_viral') ? 0.003 : 0);
  s.players = Math.max(0, Math.round(s.players * (1 + growth)));

  // 4.5 目標檢視
  if (s.mode === 'story' && s.day === STORY_DAYS / 2) {
    const met = s.goals.filter((g) => goalMet(s, g)).length;
    lines.push(`📊 期中檢視:目前達成 ${met}/${s.goals.length} 個目標。林總:「後半段要加把勁。」`);
  }
  if (s.mode === 'endless' && s.day % 10 === 0) reviewGoals(s, lines);

  // 4.6 下班前的一句話:依今天整體過得好不好
  {
    const ds = s.dayStart ?? { boss: s.boss, trust: s.trust, players: s.players };
    const net = (s.boss - ds.boss) + (s.trust - ds.trust);
    const pool = s.day % 5 === 0 && rand(s) < 0.6 ? CLOSING_FRIDAY : net >= 4 ? CLOSING_GOOD : net <= -4 ? CLOSING_BAD : CLOSING_NEUTRAL;
    lines.push(`🌆 ${pickOf(s, pool)}`);
  }

  // 5. 新的一天
  if (gainXp(s, 6)) lines.push(`⭐ 升到 Lv ${s.lv}!`);
  if ((s.day + 1) % 5 === 0) {
    s.bossNext ??= pickBoss(s);
    const th = dominantTheme(s);
    lines.push(`💀 明天有首領:${EVENTS[s.bossNext].title.replace('首領:', '')}${th ? `(你偏重「${THEME_LABEL[th]}」)` : ''}`);
  }
  if ((s.day) % 3 === 0) lines.push(`☠️ 危機升到 Lv ${threatLevel({ ...s, day: s.day + 1 })}:事件更多,逾期與失敗的代價更重。`);
  if (s.mode === 'endless' && s.day + 1 > 20) gainAch(s, 'endless20');
  if (s.mode === 'endless' && s.day + 1 > 40) gainAch(s, 'endless40');
  s.day++;
  s.ap = Math.max(1, s.maxAp - (buffActive(s, 'tired') ? 1 : 0));
  s.scout = undefined; // 沒選的報告隔天就過期了
  s.buffs = (s.buffs ?? []).filter((b) => b.until >= s.day);
  if (s.campaign?.phase === 'planned' && s.campaign.launchDay <= s.day) launch(s, lines);
  const help = pacedHelp(s);
  if (help) lines.push(help);
  spawnDay(s);

  for (const l of lines) pushLog(s, s.day - 1, l);

  // 6. 結局判定
  checkEnding(s);

  return {
    day: s.day - 1, lines, spend, prevSpend, before,
    players: s.players, retention: s.retention, trust: s.trust, boss: s.boss,
  };
}

function checkEnding(s: State): void {
  if (s.boss <= 0) {
    s.over = { ...ENDINGS.lost.boss, style: endingStyle(s, false) };
  } else if (s.trust <= 0) {
    s.over = { ...ENDINGS.lost.trust, style: endingStyle(s, false) };
  } else if (s.mode === 'story' && s.day > STORY_DAYS) {
    const met = s.goals.filter((g) => goalMet(s, g)).length;
    const frac = met / s.goals.length;
    const tag = `(達成目標 ${met}/${s.goals.length})`;
    const tier = frac === 1 ? 'excellent' : frac >= 0.6 ? 'pass' : frac >= 0.4 ? 'extend' : 'fail';
    const e = ENDINGS.story[tier];
    s.over = { title: e.title, body: e.body.replace('{tag}', tag), style: endingStyle(s, tier === 'excellent' || tier === 'pass') };
  }
  if (s.mode === 'story' && s.over?.title.includes('轉正')) {
    gainAch(s, 'first_win');
    if (s.over.title.includes('優秀')) gainAch(s, 'perfect');
    if (s.difficulty === 'hard') gainAch(s, 'hard_win');
    if (s.colleague) gainAch(s, 'mate_win');
    if (s.pendingReports === 0) gainAch(s, 'clean_desk');
  }
}

/** 無限模式:每 10 天一次季度考核,過關後目標升級 */
function reviewGoals(s: State, lines: string[]): void {
  const met = s.goals.filter((g) => goalMet(s, g)).length;
  const ok = met === s.goals.length;
  s.goalRound++;
  if (ok) {
    s.reviewsPassed = (s.reviewsPassed ?? 0) + 1;
    if (s.reviewsPassed >= 3) gainAch(s, 'review3');
    applyEffects(s, { boss: 8, trust: 2 });
    lines.push(`🏆 季度考核通過(${met}/${s.goals.length})!老闆+8 信任+2。下一季目標提高了。`);
    s.goals = s.goals.map((g) => ({
      key: g.key,
      target: g.key === 'players' || g.key === 'spend' ? Math.round(g.target * 1.1 * 10) / 10
        : Math.min(95, g.target + (g.key === 'retention' ? 1 : 2)),
    }));
  } else {
    applyEffects(s, { boss: -12 });
    lines.push(`📉 季度考核未通過(${met}/${s.goals.length}),林總找你談了很久。(老闆-12)目標維持不變,下季再試。`);
  }
}

/* ---------- 結算經驗(跨局職級) ---------- */

const XP_MULT: Record<Difficulty, number> = { easy: 1, normal: 1.5, hard: 2.5 };

/** 這局結束時獲得的經驗與明細 */
export function computeRunXp(s: State): { total: number; lines: string[] } {
  const lines: string[] = [];
  let base = 0;
  if (s.mode === 'story') {
    const met = s.goals.filter((g) => goalMet(s, g)).length;
    base += met * 20;
    lines.push(`達成目標 ${met}/${s.goals.length}:+${met * 20}`);
    const title = s.over?.title ?? '';
    const bonus = title.includes('優秀') ? 60 : title.includes('順利') ? 40 : title.includes('延長') ? 20 : 5;
    base += bonus;
    lines.push(`結局「${title}」:+${bonus}`);
  } else {
    const days = Math.max(0, (s.day - 1) * 2);
    base += days;
    lines.push(`撐過 ${s.day - 1} 天:+${days}`);
    const q = (s.reviewsPassed ?? 0) * 30;
    if (q) { base += q; lines.push(`通過 ${s.reviewsPassed} 次季度考核:+${q}`); }
  }
  const mult = XP_MULT[s.difficulty];
  if (mult !== 1) lines.push(`${DIFFS[s.difficulty].label}難度 ×${mult}`);
  return { total: Math.max(5, Math.round(base * mult)), lines };
}

/* ---------- 日報:每次不一樣的小題目 ---------- */

export interface ReportOption {
  label: string;
  /** true 答對、false 答錯、null 沒有對錯(語氣類) */
  good: boolean | null;
  result: string;
  effects?: Effects;
  habit?: Record<string, number>;
}

export interface ReportQuiz {
  /** 鄰座同事的小動作 */
  aside?: string;
  kind: 'metric' | 'trend' | 'priority' | 'campaign' | 'tone' | 'goal' | 'habit';
  title: string;
  prompt: string;
  /** 題目附的資料,讓玩家能從數字裡找答案 */
  facts: string[];
  options: ReportOption[];
}

function shuffleWith<T>(rnd: () => number, a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const shuffle = <T,>(s: State, a: T[]): T[] => shuffleWith(() => rand(s), a);

const pct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** 依目前局勢產生一份日報題目;題型隨機輪替,不會連續兩次一樣 */
export function makeReport(s: State): ReportQuiz {
  const q = buildReport(s);
  q.aside = pickOf(s, REPORT_ASIDES);
  return q;
}

/** 「數據重點」題用的三個數字。最大與次大的差距太小時,答案不明確,這題就不出 */
function metricItems(s: State): { items: { name: string; v: number; fact: string }[]; clear: boolean } {
  const prev = s.history[s.history.length - 1] ?? { players: s.players, spend: spendToday(s) };
  const spend = spendToday(s);
  const pPct = prev.players ? ((s.players - prev.players) / prev.players) * 100 : 0;
  const sPct = prev.spend ? ((spend - prev.spend) / prev.spend) * 100 : 0;
  const rDev = (s.retention - 36) * 3; // 留存離平常(約 36%)多遠,放大成可以跟百分比比較的尺度
  const items = [
    { name: '玩家人數', v: pPct, fact: `玩家人數 ${Math.round(s.players).toLocaleString('zh-TW')}(比昨天 ${pct(pPct)})` },
    { name: '日營收', v: sPct, fact: `日營收 ${spend.toFixed(1)} 萬點(比昨天 ${pct(sPct)})` },
    { name: '留存率', v: rDev, fact: `留存率 ${s.retention.toFixed(1)}%(平常約 36%)` },
  ];
  const mags = items.map((i) => Math.abs(i.v)).sort((a, b) => b - a);
  return { items, clear: mags[0] - mags[1] >= 0.5 };
}

/** 各目標離達成還有多遠(越小越落後),最落後的與第二落後差距夠大才算有明確答案 */
function goalGap(s: State): { items: { goal: Goal; ratio: number; fact: string }[]; clear: boolean } {
  const label: Record<GoalKey, string> = { players: '玩家人數', retention: '留存率', spend: '日營收', trust: '玩家信任', boss: '老闆好感' };
  const items = s.goals.map((g) => {
    const v = goalValue(s, g.key);
    return { goal: g, ratio: v / g.target, fact: `${label[g.key]}:${g.key === 'players' ? Math.round(v).toLocaleString('zh-TW') : v.toFixed(1)} / 目標 ${g.key === 'players' ? Math.round(g.target).toLocaleString('zh-TW') : g.target}` };
  }).sort((a, b) => a.ratio - b.ratio);
  return { items, clear: items.length >= 3 && items[1].ratio - items[0].ratio >= 0.03 };
}

/** 目前累積中的壞習慣,多的在前 */
function badHabits(s: State): [string, number][] {
  return Object.entries(s.habits).filter(([k, n]) => n > 0 && HABITS[k] && !HABITS[k].good).sort((a, b) => b[1] - a[1]);
}

function buildReport(s: State): ReportQuiz {
  const kinds: ReportQuiz['kind'][] = ['trend', 'tone'];
  if (metricItems(s).clear) kinds.push('metric');
  if (s.inbox.length >= 3) kinds.push('priority');
  if (s.campaign && s.campaign.phase !== 'done') kinds.push('campaign');
  if (goalGap(s).clear) kinds.push('goal');
  if (badHabits(s).length >= 3) kinds.push('habit');
  const pool = kinds.filter((k) => k !== s.lastReport);
  const kind = pool[Math.floor(rand(s) * pool.length)];
  s.lastReport = kind;
  const GOOD: Effects = { boss: 2 };

  if (kind === 'metric') {
    const { items } = metricItems(s);
    const best = items.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
    return {
      kind, title: '數據重點', prompt: '今天要向老闆強調哪一個數字?挑「離平常最遠、變動最大」的。',
      facts: items.map((i) => i.fact),
      options: items.map((i) => i === best
        ? { label: `強調「${i.name}」`, good: true, effects: GOOD, result: `「${i.name}」是今天變動最大的,老闆一眼看到重點。` }
        : { label: `強調「${i.name}」`, good: false, result: `你強調的不是變動最大的,其實是「${best.name}」。` }),
    };
  }

  if (kind === 'trend') {
    const score = (s.retention - 35) * 0.7 + (s.trust - 50) * 0.2;
    const answer = score >= 1.8 ? '上升' : score <= -1.8 ? '下降' : '持平';
    const why = answer === '上升' ? '留存高、信任也不低,玩家會慢慢變多。' : answer === '下降' ? '留存偏低或信任偏低,玩家容易慢慢流失。' : '留存在平常的水準,人數不會有大變化。';
    return {
      kind, title: '趨勢預測', prompt: '照目前的留存與信任,你預期接下來幾天的玩家人數會…?',
      facts: [`留存率 ${s.retention.toFixed(1)}%(平常約 36%)`, `玩家信任 ${Math.round(s.trust)}`],
      options: (['上升', '持平', '下降'] as const).map((a) => a === answer
        ? { label: `會${a}`, good: true, effects: GOOD, result: `判斷正確。${why}` }
        : { label: `會${a}`, good: false, result: `這次判斷偏了。${why}` }),
    };
  }

  if (kind === 'priority') {
    const picks = shuffle(s, s.inbox).slice(0, 3);
    const rank = (i: { deadline: number; stage?: number }) => (i.stage ?? 0) * 100 - i.deadline;
    const best = picks.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    const label = (it: InboxItem) => { const left = it.deadline - s.day; return `${EVENTS[it.eventId].title}:${it.stage ? '再次催辦,' : ''}${left <= 0 ? '今天截止' : `還剩 ${left + 1} 天`}`; };
    return {
      kind, title: '優先順序', prompt: '手上這幾件事,日報要寫「最先處理」哪一件?',
      facts: picks.map(label),
      options: picks.map((it) => it === best
        ? { label: `先處理「${EVENTS[it.eventId].title}」`, good: true, effects: GOOD, result: '最急的先做,日報的優先順序很清楚。' }
        : { label: `先處理「${EVENTS[it.eventId].title}」`, good: false, result: `其實「${EVENTS[best.eventId].title}」更急,期限比較近。` }),
    };
  }

  if (kind === 'goal') {
    const { items } = goalGap(s);
    const picks = items.slice(0, 3);
    return {
      kind, title: '目標進度', prompt: '日報要寫「目前最落後、最需要補上」的目標是哪一個?(看目前數字占目標的比例)',
      facts: picks.map((i) => i.fact),
      options: shuffle(s, picks).map((i) => i === picks[0]
        ? { label: `最落後的是「${i.fact.split(':')[0]}」`, good: true, effects: GOOD, result: '抓到落後的那一項,老闆知道你清楚下一步該補哪裡。' }
        : { label: `最落後的是「${i.fact.split(':')[0]}」`, good: false, result: `其實「${picks[0].fact.split(':')[0]}」離目標最遠。` }),
    };
  }

  if (kind === 'habit') {
    const hs = badHabits(s).slice(0, 3);
    return {
      kind, title: '工作檢討', prompt: '日報要反省最近的工作方式,你累積得最多的壞習慣是哪一個?',
      facts: hs.map(([k, n]) => `${HABITS[k].label}:累積 ${n} 次`),
      options: shuffle(s, hs).map(([k]) => k === hs[0][0]
        ? { label: `最需要改的是「${HABITS[k].label}」`, good: true, effects: GOOD, result: '誠實面對累積最多的問題,老闆覺得你有在反省。' }
        : { label: `最需要改的是「${HABITS[k].label}」`, good: false, result: `其實累積最多的是「${HABITS[hs[0][0]].label}」。` }),
    };
  }

  if (kind === 'campaign' && s.campaign) {
    const c = s.campaign;
    const m = find(CONTENT.mechanics, c.mechanic);
    const truth = `打磨 ${c.polish}/4,${c.checked ? '驗收已完成' : '驗收還沒做'}`;
    const wrong1 = `打磨 ${Math.min(4, c.polish + 2)}/4,${c.checked ? '驗收還沒做' : '驗收已完成'}`;
    const wrong2 = '一切就緒,隨時可以上線';
    return {
      kind, title: '活動進度', prompt: '日報裡,活動目前的進度要寫哪一句?(寫實話)',
      facts: [`活動「${m.name}」`, `打磨 ${c.polish}/4`, `驗收:${c.checked ? '已完成' : '還沒做'}`],
      options: shuffle(s, [truth, wrong1, wrong2]).map((x) => x === truth
        ? { label: x, good: true, effects: GOOD, result: '寫實話,老闆才知道還缺什麼。' }
        : { label: x, good: false, result: `寫得比實際好看,但真實狀況是:${truth}。` }),
    };
  }

  return {
    kind: 'tone', title: '一句話心得', prompt: '日報最後要寫一句心得,你想用什麼語氣?',
    facts: ['這題沒有標準答案,但每種寫法都有後果。'],
    options: [
      { label: '實話實說:問題和原因都寫清楚', good: null, effects: { boss: 1, trust: 1 }, result: '你把問題寫清楚了,老闆知道你不是在報喜不報憂。' },
      { label: '樂觀帶過:只寫好消息', good: null, effects: { boss: 2 }, habit: { sloppy_report: 1 }, result: '老闆看了很開心。但問題沒寫進去,之後可能被問到。' },
      { label: '把問題推給別的部門', good: null, effects: { boss: 1 }, habit: { blame: 1 }, result: '問題看起來不是你的。但別的部門可能會看到。' },
    ],
  };
}

/** 交出日報:扣點數、套用結果、減少待填日報 */
export function submitReport(s: State, quiz: ReportQuiz, idx: number): { ok: boolean; text: string } {
  const opt = quiz.options[idx];
  if (!opt) return { ok: false, text: '沒有這個選項' };
  const free = reportFree(s);
  if (!free && s.ap < 1) return { ok: false, text: '行動點數不足' };
  if (s.pendingReports <= 0) return { ok: false, text: '沒有待填的日報' };
  if (!free) s.ap -= 1;
  s.pendingReports--;
  applyEffects(s, opt.effects);
  gainXp(s, opt.good === true ? 8 : 5);
  const note = addHabits(s, opt.habit);
  if (opt.good === true) {
    s.quizRight = (s.quizRight ?? 0) + 1;
    if (s.quizRight >= 5) gainAch(s, 'report_ace');
    if (stratLv(s, 'audit_eye')) applyEffects(s, { trust: 1 });
    if (stratLv(s, 'data_driven')) applyEffects(s, { boss: stratLv(s, 'data_driven') });
  }
  const tag = opt.good === true ? '✅ 答對了。' : opt.good === false ? '❌ 這次沒答對。' : '';
  const text = `${tag}${opt.result}`;
  pushFeed(s, `日報(${quiz.title}):${text}${effectNote(opt.effects)}${note}`);
  checkSudden(s);
  return { ok: true, text: `${text}${effectNote(opt.effects)}` };
}
