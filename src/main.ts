import './style.css';
import { colleagueBlurb, decodeCard, encodeCard } from './colleague';
import { PERSONA_FOCUS_BONUS, PERSONA_INFO, PERSONA_STEPS, STYLES, mergePersona, personaLevel, personaLevels, personaTitle } from './persona';
import { BUFFS, scoutCard } from './scout';
import { BOSS_TRAITS, COMMUNITY_TRAITS } from './traits';
import { MONTH_FREE_REROLLS, PRODUCTS, THEMES, canFast, colleagueSlots, emptyShop, fastOn, monthActive, productById, purchase, totalSpent, type ShopState } from './shop';
import { CURSES, ROLES, SHOP, STRATEGIES, THEME_LABEL, curseById, roleById, strategyById, xpNeed } from './cards';
import { computeSplitLayout } from './scene/office';
const clampN = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
import { CUP_EMPTY, CUP_FULL, CUP_PALETTE, SIREN, SIREN_PALETTE, computeLayout, renderOffice, spriteURL } from './scene/office';
import type { Place } from './scene/office';
import { ROOMS, renderRoom } from './scene/rooms';
import type { Room } from './scene/rooms';
import { createFadeCanvas, dissolve } from './scene/fade';
import { storageKey } from './storage';
import {
  CAMPAIGN_TARGET, RAPPORT_NEED, combosFor, CONTENT, DIFFS, activeBuffs, bossTrait, communityTrait, pickScout, pickCard, rerollPick, stratLv, threatLevel, paceOf, bossInfo, pulseActive, pulseHint, EVENTS, computeRunXp, PHASES, LIVE_DAYS, phaseOf, GOAL_INFO, STORY_DAYS, chooseOption, clearSave, doAction, endDay,
  HABITS, find, goalMet, goalValue, reportFree, makeReport, submitReport, itemOptions, eventOptions, styleFit, eventText, load, newGame, optionCost, planCampaign, planCost, save, spendToday, weekdayLabel,
} from './engine';
import type { ActionKind, ReportQuiz } from './engine';
import { LEVELS, MAX_COLLEAGUES, CREDITS_PER_ACH, CREDITS_PER_LEVEL, buyItem, levelFor, loadProfile, mergeSeen, nextLevel, saveProfile } from './profile';
import { ACHIEVEMENTS } from './achievements';
import type { DaySummary, Difficulty, EventKind, EventOption, GameEvent, Goal, GoalKey, InboxItem, Mode, PlanSel, State, Style } from './types';

const app = document.getElementById('app') as HTMLDivElement;

let S: State | null = load();
let profile = loadProfile();
let screen: 'start' | 'game' | 'archive' | 'shop' = 'start';
let buyId = '';
const shopOf = (): ShopState => profile.shop ?? emptyShop();
const fastNow = (): boolean => fastOn(shopOf());
function setShop(next: ShopState): void { profile = { ...profile, shop: next }; saveProfile(profile); }
type ModalKind = 'none' | 'newgame' | 'strats' | 'persona' | 'boss' | 'bossresult' | 'buy' | 'upsell' | 'summary' | 'intro' | 'settings' | 'gamemenu' | 'report' | 'rank' | 'scout' | 'colleague' | 'cards';
let modal: ModalKind = 'none';
let summary: DaySummary | null = null;
/** 還有沒做完的事時,第一次按「結束今天」只會進入待確認,再按一次才真的結束 */
let endArmed = false;
/** 剛處理完的那件事的實務說明,顯示在結果下方 */
let lastInsight = '';
let endArmTimer = 0;
let lastModal = 'none';
let lastScreen = '';
let prevAp = -1;
let prevDay = -1;
/** 版號:來自 package.json,由 vite 在建置時帶入 */
declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const versionTag = (): string => (VERSION ? `<span class="ver">v${VERSION}</span>` : '');

let busy = false;
/** 動畫或換場期間按下的最後一下:動畫結束後補做,不再被吞掉 */
let pendingClick: { x: number; y: number } | null = null;
const REPLAY_ACTS = new Set(['end', 'tab', 'report', 'sloppy', 'open-plan', 'open-menu', 'toggle', 'close-modal']);
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const rendered = new Set<number>();
const prevNums: Record<string, number> = {};
const prevBars: Record<string, number> = {};

const prevGoal: Record<string, boolean> = {};
let prevFeed0: string | undefined;
let prevVerdict: string | undefined;

/* 特效圖層:粒子、彩帶、飄字都畫在這裡,不影響版面與點擊 */
const fx = document.createElement('div');
fx.id = 'fx';
document.body.appendChild(fx);

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

function burst(x: number, y: number, items: string[], n = 20): void {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    const a = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 120;
    el.className = 'fx-p';
    el.textContent = pick(items);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.fontSize = 14 + Math.random() * 14 + 'px';
    el.style.setProperty('--dx', Math.cos(a) * dist + 'px');
    el.style.setProperty('--dy', Math.sin(a) * dist - 40 + 'px');
    el.style.setProperty('--rot', Math.random() * 540 - 270 + 'deg');
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
}

function rain(items: string[], n = 36): void {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    const dur = 2 + Math.random() * 2.2;
    el.className = 'fx-r';
    el.textContent = pick(items);
    el.style.left = Math.random() * 100 + 'vw';
    el.style.fontSize = 16 + Math.random() * 14 + 'px';
    el.style.animationDuration = dur + 's';
    el.style.animationDelay = Math.random() * 0.8 + 's';
    fx.appendChild(el);
    setTimeout(() => el.remove(), (dur + 1) * 1000);
  }
}

function floatText(near: Element, text: string, good: boolean): void {
  if (reduceMotion) return;
  // 等版面穩定後再量位置,而且該指標不在畫面內就不飄字
  requestAnimationFrame(() => {
    if (!near.isConnected) return;
    const r = near.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const el = document.createElement('span');
    el.className = `fx-float ${good ? 'good' : 'bad'}`;
    el.textContent = text;
    el.style.left = r.right - 14 + 'px';
    el.style.top = r.top + 6 + 'px';
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  });
}

function resetMotion(): void {
  for (const k of Object.keys(prevGoal)) delete prevGoal[k];
  prevFeed0 = undefined;
  rendered.clear(); prevAp = -1; prevDay = -1;
  for (const k of Object.keys(prevNums)) delete prevNums[k];
  for (const k of Object.keys(prevBars)) delete prevBars[k];
}
let difficulty: Difficulty = 'normal';
let modeSel: Mode = 'story';
type Tab = 'inbox' | 'camp' | 'goals' | 'log';
let tab: Tab = 'inbox';
let openUid: number | null = null;

/* ---------- 地點(場景模式):老闆辦公室、會議室、茶水間 ---------- */
let place: Place = 'desk';
let dialogUid: number | null = null;
let dialogResult = false;
let dialogText: string | null = null;
let transitioning = false;
/** 場景模式下規劃活動:在會議室裡分步進行(取代全螢幕彈窗) */
let planning = false;
let planStep = 0;
/** 日報:目前的題目與作答結果 */
let reportQuiz: ReportQuiz | null = null;
let reportDone: { ok: boolean; text: string } | null = null;
/** 房間看對象、不看事件類型:林總找你去老闆辦公室,原廠窗口在會議室視訊;其他部門的事留在座位上 */
const sceneRoomFor = (ev: { from: string; kind: string }): Room | undefined => (ev.kind === '插曲' ? undefined : ev.from.startsWith('林總') ? 'boss' : ev.from.startsWith('原廠') ? 'meeting' : undefined);
function resetPlace(): void { planning = false; planStep = 0; place = 'desk'; dialogUid = null; dialogResult = false; dialogText = null; }

type Butterfly = 'auto' | 'on' | 'off';
const SETTINGS_KEY = storageKey('ops-game-settings');
const loadedSettings = (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { butterfly?: string }; } catch { return {}; }
})();
let butterfly: Butterfly = loadedSettings.butterfly === 'on' || loadedSettings.butterfly === 'off' ? loadedSettings.butterfly : 'auto';
function saveSettings(): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ butterfly })); } catch { /* 略過 */ }
}
function setButterfly(v: Butterfly): void {
  butterfly = v;
  saveSettings();
}
/** 因果提示:自動時,簡單與普通顯示,困難隱藏 */
const showHints = (d: Difficulty): boolean => butterfly === 'on' || (butterfly === 'auto' && d !== 'hard');

const KIND_ICON: Record<string, string> = { 老闆: '👔', 原廠: '🏢', 技術: '🛠️', 客訴: '😠', 輿情: '💬', 數據: '📊', 雜務: '📋', 插曲: '🎈' };
let sel: PlanSel = { mechanic: 'lottery', reward: 'shard', bundle: 'starter', promo: 'notice', delay: 3 };

const fmt = (n: number, d = 0) => n.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d });
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESC[c]);

const TIPS = {
  players: '每天有上線的玩家數(日活躍)。人越多,營收的基礎就越大。',
  retention: '玩家「明天還會回來」的比例。留存高,人數才會自然成長。',
  spend: '玩家當天在遊戲內花掉的點數總量(單位:萬點),就是當天的營收。',
  trust: '玩家相不相信營運。信任低時,同樣的活動賣不動,小事也會被放大。',
  boss: '老闆(林總)對你的滿意度,歸零就會被約談。',
};

/* ---------- 畫面 ---------- */

const METRIC_ICON: Record<string, string> = { players: '👥', retention: '🔁', spend: '💰', trust: '🤝', boss: '👔' };

function metric(key: keyof typeof TIPS, label: string, num: number, digits: number, suffix: string, delta: string, bar?: number, met = false): string {
  const cls = delta.startsWith('+') ? 'up' : delta.startsWith('-') ? 'down' : '';
  const w = Math.max(0, Math.min(100, bar ?? 0));
  return `<div class="metric ${met ? 'met' : ''}"><span class="label" title="${TIPS[key]}${met ? '(這項目標已達成)' : ''}">${met ? '✓' : METRIC_ICON[key]}<span class="lt"> ${label}</span></span>
    <div><span class="val" data-count="${key}" data-to="${num}" data-d="${digits}" data-suffix="${suffix}">${fmt(num, digits)}${suffix}</span><span class="delta ${cls}">${delta}</span></div>
    ${bar === undefined ? '' : `<div class="bar"><span data-bar="m-${key}" data-w="${w}" style="width:${w}%"></span></div>`}</div>`;
}

function delta(now: number, prev: number, d = 0, unit = ''): string {
  const diff = now - prev;
  if (Math.abs(diff) < Math.pow(10, -d) / 2) return '';
  return `${diff > 0 ? '+' : ''}${fmt(diff, d)}${unit}`;
}

function xpPercent(xp: number): number {
  const cur = levelFor(xp);
  const nxt = nextLevel(xp);
  return nxt ? Math.round(((xp - cur.xp) / (nxt.xp - cur.xp)) * 100) : 100;
}

function personaTag(): string {
  const pt = personaTitle(profile.persona ?? {});
  return pt ? `🎭 ${pt.title} · ` : '';
}

/** 看輿情之後的報告:冒出幾件事,今天只顧得了一件 */
function renderScout(s: State): string {
  const sc = s.scout;
  if (!sc) return '';
  const complaints = s.inbox.filter((i) => ['客訴', '輿情'].includes(EVENTS[i.eventId].kind)).length;
  const mood = s.trust >= 70 ? '整體氣氛不錯' : s.trust >= 50 ? '氣氛普通' : '抱怨變多了';
  const notes = [
    `玩家信任 ${Math.round(s.trust)}:${mood}。`,
    complaints ? `收件匣裡有 ${complaints} 件客訴或輿情還沒處理。` : '目前沒有待處理的客訴或輿情。',
    sc.listened ? '你有在看,玩家感覺得到:「忽視玩家」的累積減 1。' : '',
    '今明兩天,事件會先看得出對方的氣氛。',
  ].filter(Boolean);
  const cards = sc.cards.map((id) => {
    const c = scoutCard(id);
    if (!c) return '';
    const poor = s.ap < c.ap;
    return `<button class="scout-card" data-act="scout-pick" data-id="${c.id}" ${poor ? 'disabled' : ''}>
      <span class="sc-icon">${c.icon}</span>
      <span class="sc-body">
        <b>${esc(c.name)}</b>
        <span class="sc-row"><i>你要</i>${esc(c.action)}</span>
      </span>
      <span class="cost">${c.ap ? `花 ${c.ap} 點 ⚡` : '免費'}</span></button>`;
  }).join('');
  return `<div class="modal-bg"><div class="modal scout-modal">
    <div class="modal-head"><h2>📡 輿情報告</h2><button class="x" data-act="scout-close" aria-label="先關閉,晚點再選">✕</button></div>
    <p class="scout-intro">冒出 ${sc.cards.length} 件事,<b>只顧得了一件</b>。</p>
    ${sc.found ? `<p class="scout-found">🔎 ${esc(sc.found)}</p>` : ''}
    <div class="scout-cards">${cards}</div>
    <div class="actions"><button data-act="scout-skip">都先不處理</button></div>
    <details class="scout-notes"><summary>今日概況</summary><ul>${notes.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></details>
    <p class="muted report-foot">明天就過期。</p>
  </div></div>`;
}

function renderReport(s: State): string {
  const q = reportQuiz;
  if (!q) return '';
  const free = reportFree(s);
  if (reportDone) {
    return `<div class="modal-bg"><div class="modal report-modal">
      <div class="modal-head"><h2>📝 日報:${q.title}</h2></div>
      <p class="report-result">${esc(reportDone.text)}</p>
      <div class="actions"><button class="primary" data-act="report-done">完成</button></div></div></div>`;
  }
  return `<div class="modal-bg"><div class="modal report-modal">
    <div class="modal-head"><h2>📝 日報:${q.title}</h2><button class="x" data-act="close-report" aria-label="先不填">✕</button></div>
    <p class="report-prompt">${esc(q.prompt)}</p>
    <ul class="report-facts">${q.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    <div class="report-opts">${q.options.map((o, i) => `<button data-act="report-pick" data-i="${i}" ${!free && s.ap < 1 ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div>
    ${q.aside ? `<p class="report-aside">☕ ${esc(q.aside)}</p>` : ''}
    <p class="muted report-foot">${free ? '日報自動化:這份免費。' : s.ap < 1 ? '行動點數不夠了。' : '交出日報要花 1 點行動點數。'}</p>
  </div></div>`;
}

function renderGameMenu(): string {
  return `<div class="modal-bg"><div class="modal menu-modal">
    <div class="modal-head"><h2>選單</h2><button class="x" data-act="close-menu" aria-label="關閉">✕</button></div>
    <div class="menu-list">
      <button data-act="open-settings">⚙️ 設定</button>
      <button data-act="home">🏠 回主頁(進度會保留)</button>
    </div>
    <div class="actions"><button class="primary" data-act="close-menu">繼續遊戲</button></div>
  </div></div>`;
}

const nextHint = (): string => {
  const nxt = nextLevel(profile.xp);
  return nxt ? `再 ${nxt.xp - profile.xp} 經驗升為「${nxt.title}」` : '已達最高職級';
};

/** 個人風格:各種做法的熟練度 */
function renderPersona(): string {
  const p = profile.persona ?? {};
  const pt = personaTitle(p);
  const rows = STYLES.map((st) => {
    const pts = p[st] ?? 0;
    const lv = personaLevel(pts);
    const next = PERSONA_STEPS[lv];
    const pct = next === undefined ? 100 : Math.round((pts / next) * 100);
    return `<div class="persona-row"><div class="rt"><b>${PERSONA_INFO[st].name}${lv ? ` · Lv${lv}「${PERSONA_INFO[st].titles[lv - 1]}」` : ''}</b><span>${pts}${next === undefined ? ' · 已精通' : ` / ${next}`}</span></div>
      <div class="xpbar mini"><span style="--to:${pct}%"></span></div><small class="muted">${PERSONA_INFO[st].blurb}</small></div>`;
  }).join('');
  return `<div class="persona"><h3>🎭 我的風格${pt ? `:${pt.title}` : ''}</h3>
    <p class="muted">每局用過的做法累積成點數;Lv1、Lv2 會解鎖專屬事件,這局用最多的風格額外 +${PERSONA_FOCUS_BONUS}。</p>
    ${encodeCard(p) ? '<button data-act="col-copy" class="share-btn">📋 複製我的同事卡代碼</button>' : ''}<p class="muted">用過的做法會累積成熟練度,Lv1 有稱號,可打包成同事卡。</p>${rows}</div>`;
}

let colMsg = '';

/** 這局要帶的同事(沒選或代碼壞了就沒有) */
function selectedColleague(): { style: Style; level: number; title: string } | undefined {
  const code = (profile.colleagues ?? [])[profile.colleagueSel ?? -1];
  return code ? decodeCard(code) ?? undefined : undefined;
}

function renderColleague(): string {
  const mine = encodeCard(profile.persona ?? {});
  const list = profile.colleagues ?? [];
  const sel = profile.colleagueSel ?? -1;
  const rows = list.map((code, i) => {
    const c = decodeCard(code);
    return c ? `<div class="col-row ${i === sel ? 'sel' : ''}"><button class="col-pick" data-act="col-sel" data-i="${i}"><b>${i === sel ? '✅ ' : ''}${esc(c.title)}</b><small>${esc(colleagueBlurb(c))}</small></button><button class="x" data-act="col-del" data-i="${i}" aria-label="移除">✕</button></div>` : '';
  }).join('');
  return `<div class="modal-bg"><div class="modal col-modal">
    <div class="modal-head"><h2>👥 同事</h2><button class="x" data-act="close-colleague" aria-label="關閉">✕</button></div>
    <p class="muted">把代碼給朋友,你的風格就會當他的同事。不含名字。</p>
    <div class="col-mine"><b>我的同事卡</b>${mine
      ? `<code>${mine}</code><button data-act="col-copy">複製代碼</button>`
      : '<p class="muted">還沒有風格到 Lv1。</p>'}</div>
    <div class="col-add"><b>加入朋友的同事卡</b>
      <div class="col-input"><input id="col-input" placeholder="貼上代碼,例如 OPS-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"><button data-act="col-add">加入</button></div>
      ${colMsg ? `<p class="muted">${esc(colMsg)}</p>` : ''}</div>
    <div class="col-list"><b>這局要帶的同事</b>${rows || '<p class="muted">還沒有收到同事卡。</p>'}
      ${list.length ? `<button class="${sel < 0 ? 'sel' : ''}" data-act="col-sel" data-i="-1">${sel < 0 ? '✅ ' : ''}不帶同事</button>` : ''}</div>
    <p class="muted">同事每天幫你分擔一次擅長的做法,偶爾闖禍。最多保留 ${colleagueSlots(shopOf())} 張。</p>
    <div class="actions"><button class="primary" data-act="close-colleague">完成</button></div>
  </div></div>`;
}

/** 風格:每種做法的熟練度、離下一級還差多少、各級解鎖什麼 */
function renderPersonaModal(): string {
  return `<div class="modal-bg"><div class="modal persona-modal">
    <div class="modal-head"><h2>🎭 風格</h2><button class="x" data-act="close-modal" aria-label="關閉">✕</button></div>
    ${renderPersona()}
    <div class="actions"><button class="primary" data-act="close-modal">關閉</button></div>
  </div></div>`;
}

function renderRank(): string {
  const cur = levelFor(profile.xp);
  const rows = LEVELS.map((l) => {
    const state = l.lv < cur.lv ? 'done' : l.lv === cur.lv ? 'now' : 'next';
    return `<div class="rank-row ${state}"><div class="rt"><b>${state === 'done' ? '✅ ' : state === 'now' ? '▶ ' : '🔒 '}${l.title}</b><span>Lv ${l.lv}${l.xp ? ` · ${l.xp} 經驗` : ''}</span></div>
      <ul>${l.unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`;
  }).join('');
  return `<div class="modal-bg"><div class="modal rank-modal">
    <div class="modal-head"><h2>🏅 職級:${cur.title}</h2><button class="x" data-act="close-rank" aria-label="關閉">✕</button></div>
    <div class="xpbar"><span style="--to:${xpPercent(profile.xp)}%"></span></div>
    <p class="muted">經驗 ${profile.xp}· ${nextHint()} · 已完成 ${profile.runs} 局</p>
    ${rows}
    <p class="muted">每局結算得到經驗;升級得資歷。</p>
    <div class="actions"><button class="primary" data-act="close-rank">關閉</button></div>
  </div></div>`;
}

/** 主頁可開的彈窗(設定、職級詳情) */
const START_MODALS: ModalKind[] = ['settings', 'rank', 'colleague', 'newgame', 'persona', 'buy'];
function renderStartModal(): string {
  return modal === 'settings' ? renderSettings() : modal === 'rank' ? renderRank() : modal === 'colleague' ? renderColleague() : modal === 'newgame' ? renderNewGame() : modal === 'persona' ? renderPersonaModal() : modal === 'buy' ? renderBuyModal() : '';
}

function renderSettings(): string {
  const seg = <T extends string>(items: [T, string][], cur: T, act: string, attr: string) =>
    `<div class="seg">${items.map(([v, l]) => `<button class="${cur === v ? 'sel' : ''}" data-act="${act}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="modal-bg"><div class="modal settings-modal">
    <div class="modal-head"><h2>⚙️ 設定</h2><button class="x" data-act="close-settings" aria-label="關閉">✕</button></div>
    <div class="set-row"><div class="set-text"><b>因果提示</b><p class="muted">顯示事件的前因。自動:困難隱藏。</p></div>
      ${seg<Butterfly>([['auto', '自動'], ['on', '顯示'], ['off', '隱藏']], butterfly, 'bf', 'v')}</div>
    ${renderLookSettings()}
    <div class="actions"><button class="primary" data-act="close-settings">完成</button></div>
  </div></div>`;
}

/** 設定裡的外觀與快速模式:沒買的顯示上鎖,點了去商店 */
function renderLookSettings(): string {
  const sh = shopOf();
  const themes = Object.entries(THEMES).map(([id, th]) => {
    const has = sh.owned.includes(id);
    return `<button class="${sh.theme === id ? 'sel' : ''}" data-act="${has ? 'set-theme' : 'open-shop'}" data-id="${id}">${has ? '' : '🔒 '}${th.name}</button>`;
  }).join('');
  const petHas = sh.owned.includes('pet_cat');
  const fastHas = canFast(sh);
  return `<div class="set-row"><div class="set-text"><b>辦公室外觀</b></div>
      <div class="seg"><button class="${sh.theme ? '' : 'sel'}" data-act="set-theme" data-id="">預設</button>${themes}</div></div>
    <div class="set-row"><div class="set-text"><b>貓咪</b></div>
      <div class="seg"><button class="${petHas && sh.pet ? 'sel' : ''}" data-act="${petHas ? 'toggle-pet' : 'open-shop'}">${petHas ? (sh.pet ? '擺出來' : '收起來') : '🔒 商店'}</button></div></div>
    <div class="set-row"><div class="set-text"><b>快速模式</b><p class="muted">跳過轉場與動畫。</p></div>
      <div class="seg"><button class="${fastHas && sh.fast ? 'sel' : ''}" data-act="${fastHas ? 'toggle-fast' : 'open-shop'}">${fastHas ? (sh.fast ? '開' : '關') : '🔒 商店'}</button></div></div>`;
}

/** 主頁:標題畫面。像素辦公室鋪滿整個畫面,只放遊戲名和幾個入口;模式與難度等按下「開始」才選 */
function renderStart(): string {
  const has = !!S && !S.over;
  const owned = profile.unlock ?? [];
  const buyable = SHOP.filter((x) => !owned.includes(x.id) && x.cost <= (profile.credits ?? 0)).length;
  const cur = levelFor(profile.xp);
  const pt = personaTitle(profile.persona ?? {});
  return `<div class="title-ui">
    ${versionTag()}
    <header class="title-head"><h1>營運日常</h1><p>撐過試用期</p></header>
    <nav class="title-menu">
      ${has ? `<button class="primary" data-act="continue">繼續遊戲<small>${S!.mode === 'story' ? '劇情' : '無限'} · ${DIFFS[S!.difficulty].label} · ${weekdayLabel(S!.day)}</small></button>` : ''}
      <button class="${has ? '' : 'primary'}" data-act="open-new">${has ? '新遊戲' : '開始遊戲'}</button>
      <div class="title-row">
        <button data-act="open-shop">🛍️ 商店</button>
        <button data-act="archive">🗂️ 檔案${buyable > 0 ? ` <em>${buyable}</em>` : ''}</button>
        <button data-act="open-persona">🎭 風格</button>
        <button data-act="open-colleague">👥 同事</button>
        <button data-act="open-settings">⚙️ 設定</button>
      </div>
      <button class="title-rank" data-act="open-rank" title="${nextHint()}"><b>${monthActive(shopOf()) ? '👑 ' : ''}${cur.title}</b> Lv ${cur.lv}${pt ? ` · ${esc(pt.title)}` : ''}<span class="xpbar mini"><span style="--to:${xpPercent(profile.xp)}%"></span></span></button>
    </nav>
    <p class="title-foot">所有遊戲、角色與數字皆為虛構</p>
  </div>${renderStartModal()}`;
}

/** 商店(示意用):只賣外觀與便利,不賣數值。購買不會扣款 */
function renderShop(): string {
  const sh = shopOf();
  const now = Date.now();
  const days = Math.max(0, Math.ceil((sh.monthUntil - now) / 86400000));
  const card = (id: string): string => {
    const p = productById(id);
    if (!p) return '';
    const owned = p.once && sh.owned.includes(id);
    let right: string;
    if (p.once && owned) {
      right = p.kind === 'theme' ? `<button class="mini ${sh.theme === id ? 'sel' : ''}" data-act="set-theme" data-id="${id}">${sh.theme === id ? '使用中' : '套用'}</button>`
        : p.kind === 'pet' ? `<button class="mini ${sh.pet ? 'sel' : ''}" data-act="toggle-pet">${sh.pet ? '擺出來' : '收起來'}</button>`
        : id === 'fast' ? `<button class="mini ${sh.fast ? 'sel' : ''}" data-act="toggle-fast">${sh.fast ? '開' : '關'}</button>` : '<span class="muted">已擁有</span>';
    } else right = `<button class="mini buy" data-act="ask-buy" data-id="${id}">NT$${p.price}</button>`;
    const extra = id === 'month' && monthActive(sh, now) ? `<small class="good">剩 ${days} 天</small>` : id.startsWith('tickets') ? '' : '';
    return `<div class="shopi buyable ${owned ? 'owned' : ''}"><span class="shi">${p.icon}</span><span class="shb"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small>${extra}</span><span class="shc">${right}</span></div>`;
  };
  const group = (title: string, ids: string[]): string => `<h3 class="ar-title">${title}</h3><div class="shop">${ids.map(card).join('')}</div>`;
  const log = sh.log.slice(-5).reverse().map((x) => `<li>${esc(productById(x.id)?.name ?? x.id)} <span class="muted">NT$${x.price} · ${new Date(x.ts).toLocaleDateString('zh-TW')}</span></li>`).join('');
  return `<div class="page archive">
    <header class="skills-head"><button class="ghost" data-act="back">← 返回</button>
      <div class="sp"><b>${sh.tickets}</b><small>重抽券</small></div><span></span></header>
    <p class="shop-note">🧪 示意用:不會真的付款或扣款,購買只記在這個瀏覽器的測試存檔裡。只賣外觀與便利,不賣數值。</p>
    ${group('組合', ['starter', 'month'])}${group('外觀', ['theme_dusk', 'theme_night', 'theme_sakura', 'pet_cat'])}${group('便利', ['fast', 'slots', 'tickets10', 'tickets30'])}
    ${log ? `<h3 class="ar-title">購買紀錄<small>累計 NT$${totalSpent(sh)}(示意)</small></h3><ul class="ach">${log}</ul>` : ''}
  </div>`;
}

/** 購買確認:示意用,確認後直接入帳 */
function renderBuyModal(): string {
  const p = productById(buyId);
  if (!p) return '';
  return `<div class="modal-bg"><div class="modal buy-modal">
    <div class="modal-head"><h2>確認購買</h2><button class="x" data-act="cancel-buy" aria-label="關閉">✕</button></div>
    <div class="buy-item"><span class="shi">${p.icon}</span><div><b>${esc(p.name)}</b><div class="muted">${esc(p.desc)}</div></div></div>
    <div class="buy-price">NT$${p.price}</div>
    <p class="muted">示意用:不會扣款。</p>
    <div class="actions"><button data-act="cancel-buy">取消</button><button class="primary" data-act="confirm-buy">確認購買</button></div>
  </div></div>`;
}

/** 重抽券用完時:順手推薦兩個商品 */
function renderUpsell(): string {
  const items = ['tickets10', 'month'].map((id) => productById(id)!);
  return `<div class="modal-bg"><div class="modal buy-modal">
    <div class="modal-head"><h2>重抽券用完了</h2><button class="x" data-act="close-upsell" aria-label="關閉">✕</button></div>
    <div class="shop">${items.map((p) => `<div class="shopi buyable"><span class="shi">${p.icon}</span><span class="shb"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span><span class="shc"><button class="mini buy" data-act="ask-buy" data-id="${p.id}">NT$${p.price}</button></span></div>`).join('')}</div>
    <p class="muted">示意用:不會扣款。</p>
    <div class="actions"><button class="primary" data-act="close-upsell">先不用</button></div>
  </div></div>`;
}

/** 檔案室:用資歷解鎖職位、策略與進化配方(解鎖的是選擇,不是數值) */
function renderArchive(): string {
  const owned = profile.unlock ?? [];
  const credits = profile.credits ?? 0;
  const group = (title: string, kind: 'role' | 'strategy' | 'evolve' | 'perk') => {
    const items = SHOP.filter((x) => x.kind === kind);
    if (!items.length) return '';
    return `<h3 class="ar-title">${title}</h3><div class="shop">${items.map((x) => {
      const has = owned.includes(x.id);
      const can = !has && credits >= x.cost;
      return `<button class="shopi ${has ? 'owned' : can ? 'can' : 'poor'}" data-act="buy" data-id="${x.id}" ${has ? 'disabled' : ''}><span class="shi">${x.icon}</span><span class="shb"><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></span><span class="shc">${has ? '已解鎖' : `${x.cost}`}</span></button>`;
    }).join('')}</div>`;
  };
  return `<div class="page archive">
    <header class="skills-head"><button class="ghost" data-act="back">← 返回</button>
      <div class="sp"><b>${credits}</b><small>資歷</small></div><span></span></header>
    ${group('強化', 'perk')}${group('職位', 'role')}${group('策略', 'strategy')}${group('進化', 'evolve')}
    <h3 class="ar-title">成就<small>第一次達成各 +${CREDITS_PER_ACH} 資歷</small></h3>
    <ul class="ach">${ACHIEVEMENTS.map((x) => `<li>${profile.ach.includes(x.id) ? '✅' : '⬜'} <b>${esc(x.name)}</b> <span class="muted">${esc(x.desc)}</span></li>`).join('')}</ul>
    <p class="muted foot">資歷來自每局結算。</p></div>`;
}

/** 按下「開始」之後才出現:選模式與難度 */
function renderNewGame(): string {
  const stars: Record<Difficulty, string> = { easy: '⭐', normal: '⭐⭐', hard: '⭐⭐⭐' };
  const modes: [Mode, string, string][] = [
    ['story', '劇情模式', '10 天試用期,達標才能轉正'],
    ['endless', '無限模式', '每 10 天考核,撐越久越好'],
  ];
  return `<div class="modal-bg"><div class="modal">
    <div class="modal-head"><h2>新的一局</h2><button class="x" data-act="close-newgame" aria-label="關閉">✕</button></div>
    ${(profile.unlock ?? []).filter((id) => roleById(id)).length > 1 ? `<h4 class="nm-label">職位</h4>
    <div class="roles">${ROLES.filter((r) => (profile.unlock ?? []).includes(r.id)).map((r) => `<button class="opt ${r.id === (profile.role ?? 'intern') ? 'sel' : ''}" data-act="role" data-id="${r.id}"><b>${r.icon} ${esc(r.name)}</b><small>${esc(r.desc)}<br>${esc(r.trait)}:${esc(r.traitDesc)}</small></button>`).join('')}</div>` : ''}
    <h4 class="nm-label">模式</h4>
    <div class="opts2">${modes.map(([m, n, d]) => `<button class="opt ${m === modeSel ? 'sel' : ''}" data-act="mode" data-m="${m}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
    <h4 class="nm-label">難度</h4>
    <div class="opts3">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="opt ${d === difficulty ? 'sel' : ''}" data-act="diff" data-d="${d}"><b>${stars[d]} ${DIFFS[d].label}</b><small>${DIFFS[d].goals.length} 個目標${DIFFS[d].maxAp < 6 ? ',每天少 1 點' : ''}</small></button>`).join('')}</div>
    <h4 class="nm-label">挑戰<small>換更多資歷</small></h4>
    <div class="curses"><button class="opt ${profile.curse ? '' : 'sel'}" data-act="curse" data-id=""><b>無</b></button>${CURSES.map((c) => `<button class="opt ${profile.curse === c.id ? 'sel' : ''}" data-act="curse" data-id="${c.id}"><b>${c.icon} ${esc(c.name)} ×${c.mult}</b><small>${esc(c.desc)}</small></button>`).join('')}</div>
    <div class="actions"><button data-act="close-newgame">取消</button><button class="primary" data-act="start-game">開始 ▶</button></div>
  </div></div>`;
}

function goalText(g: Goal): string {
  const info = GOAL_INFO[g.key];
  return `${info.label} ≥ ${fmt(g.target, info.digits)}${info.unit ? ' ' + info.unit : ''}`;
}

function renderGoals(s: State): string {
  const title = s.mode === 'story' ? `試用期目標(第 ${STORY_DAYS} 天結算)` : `第 ${s.goalRound + 1} 季考核目標(第 ${(s.goalRound + 1) * 10} 天)`;
  const rows = s.goals.map((g) => {
    const info = GOAL_INFO[g.key];
    const v = goalValue(s, g.key);
    const ok = goalMet(s, g);
    return `<div class="goal ${ok ? 'ok' : ''}" data-gok="${g.key}" data-ok="${ok ? 1 : 0}"><div>${ok ? '✅' : '⬜'} ${goalText(g)}</div>
      <div class="muted">目前 ${fmt(v, info.digits)}${info.unit ? ' ' + info.unit : ''}</div>
      <div class="bar"><span data-bar="g-${g.key}" data-w="${Math.min(100, (v / g.target) * 100)}" style="width:${Math.min(100, (v / g.target) * 100)}%"></span></div></div>`;
  }).join('');
  return `<div class="card"><h3>${title}</h3>${rows}</div>`;
}

/** 升級:三選一,大張、有顏色,進化特別標出來 */
/** 寬螢幕左下:這一局走到哪(航程圖)與最近發生的事 */
function renderSide(s: State): string {
  const base = s.mode === 'story' ? 1 : Math.floor((s.day - 1) / 10) * 10 + 1;
  const dueOn = (d: number): number => s.inbox.filter((i) => i.deadline === d).length;
  const c = s.campaign && s.campaign.phase !== 'done' ? s.campaign : undefined;
  const nodes = Array.from({ length: 10 }, (_, i) => {
    const d = base + i;
    const ph = phaseOf(d).key;
    const live = !!c && d >= c.launchDay && d < c.launchDay + LIVE_DAYS;
    const mark = d === s.day ? '' : c && d === c.launchDay ? '🎪' : d % 5 === 0 ? '💀' : '';
    const due = dueOn(d);
    return `<div class="dn ${ph}${d < s.day ? ' past' : ''}${d === s.day ? ' now' : ''}${live ? ' live' : ''}" title="第 ${d} 天 · ${PHASES[ph].name}${due ? ` · ${due} 件到期` : ''}"><span>${d}</span>${mark ? `<i>${mark}</i>` : ''}${due ? `<u>${due}</u>` : ''}</div>`;
  }).join('');
  const phases = (['prep', 'launch', 'ops', 'review'] as const).map((k) => `<span class="pl ${k}${phaseOf(s.day).key === k ? ' on' : ''}">${PHASES[k].name}</span>`).join('');
  const recent = s.log.slice(-5).reverse().map((e) => {
    const txt = cleanLine(e.text).replace(/\s+/g, ' ');
    return `<li><b>D${e.day}</b> ${esc(txt.length > 44 ? txt.slice(0, 44) + '…' : txt)}</li>`;
  }).join('');
  return `<div class="panel runmap"><h3>航程<small>${s.mode === 'story' ? `第 ${Math.min(s.day, STORY_DAYS)} / ${STORY_DAYS} 天` : `第 ${s.day} 天`}</small></h3>
    <div class="days">${nodes}</div><div class="phases">${phases}</div></div>
    ${recent ? `<div class="panel recent"><h3>最近發生</h3><ul>${recent}</ul></div>` : ''}`;
}

function renderCards(s: State): string {
  const opts = (s.cardPick ?? []).map((id) => strategyById(id)).filter((c): c is NonNullable<ReturnType<typeof strategyById>> => !!c);
  return `<div class="modal-bg lvl"><div class="modal levelup">
    <h2>${(s.lv ?? 1) > 1 ? `升級!<small>Lv ${s.lv}</small>` : '起手策略'}</h2>
    <div class="lcards">${opts.map((c) => {
      const cur = stratLv(s, c.id);
      const next = Math.min(c.max, cur + 1);
      const tag = (c.evolve ? '進化' : cur ? `Lv${cur}→${next}` : '新') + (c.pure ? ' · 穩定' : '');
      return `<button class="lc ${c.tone}${c.evolve ? ' evo' : ''}" data-act="pick-card" data-id="${c.id}"><span class="lci">${c.icon}</span><span class="lcb"><b>${esc(c.name)}<em>${tag}</em></b><span>👍 ${esc(c.good(next))}</span>${c.bad(next) ? `<span>👎 ${esc(c.bad(next))}</span>` : ''}</span></button>`;
    }).join('')}</div>
    <div class="reroll-row"><button data-act="reroll">🔄 重抽 <small>${rerollLabel(s)}</small></button></div>
  </div></div>`;
}

/** 重抽的標示:月卡每局頭兩次免費,其餘用重抽券 */
function rerollLabel(s: State): string {
  const sh = shopOf();
  if (monthActive(sh) && (s.rerolls ?? 0) < MONTH_FREE_REROLLS) return `免費 ${MONTH_FREE_REROLLS - (s.rerolls ?? 0)}`;
  return sh.tickets > 0 ? `券 ${sh.tickets}` : '券 0';
}

/** 把目前展開的事件卡捲到頂部(固定列下方) */
function scrollToOpenCard(): void {
  const card = app.querySelector<HTMLElement>('.mail.open');
  const hudBottom = app.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
  if (!card) return;
  const delta = card.getBoundingClientRect().top - hudBottom - 8;
  if (Math.abs(delta) > 2) app.scrollBy({ top: delta, behavior: noMotion ? 'auto' : 'smooth' });
}

/** 首領登場:全螢幕的專屬畫面,告訴你它在考什麼、你的對策有多少 */
function bossBar(s: State, ev: GameEvent): string {
  const info = bossInfo(s, ev);
  return `<div class="boss-bar">💀 首領 · ${info.bonus > 0 ? `你的對策:成功率 +${Math.round(info.bonus * 100)}%` : '沒有對應的對策'}</div>`;
}

function renderBossIntro(s: State): string {
  const it = s.inbox.find((i) => EVENTS[i.eventId]?.boss && i.uid !== s.bossIntro);
  if (!it) return '';
  const ev = EVENTS[it.eventId];
  const info = bossInfo(s, ev);
  const tx = eventText(ev, it);
  const parts = info.parts.map((p) => `<span class="bp ${p.lv ? 'on' : ''}">${esc(p.label)} <b>Lv ${p.lv}</b></span>`).join('');
  return `<div class="modal-bg boss-bg"><div class="modal bossintro">
    <div class="boss-skull">💀</div>
    <div class="boss-tag">首領登場</div>
    <h2>${esc(ev.title.replace('首領:', ''))}</h2>
    <p class="boss-brief">${esc(tx.brief ?? tx.body)}</p>
    <div class="boss-counter"><div class="muted">對它有幫助的路線</div><div class="bps">${parts}</div>
      <div class="boss-bonus">${info.bonus > 0 ? `你的對策讓成功率 +${Math.round(info.bonus * 100)}%` : '你沒有對應的對策,只能硬碰硬'}</div></div>
    <div class="actions"><button class="primary boss-go" data-act="boss-go" data-uid="${it.uid}">迎戰 ⚔</button></div>
  </div></div>`;
}

/** 首領打完:勝負畫面 */
function renderBossResult(s: State): string {
  const b = s.bossResult;
  if (!b) return '';
  return `<div class="modal-bg boss-bg"><div class="modal bossintro ${b.win ? 'win' : 'lose'}">
    <div class="boss-skull">${b.win ? '🏆' : '💀'}</div>
    <div class="boss-tag">${b.win ? '首領擊退' : '勉強撐過'}</div>
    <h2>${esc(b.title)}</h2>
    <p class="boss-brief">${esc(b.text)}</p>
    ${b.eff ? `<p class="boss-why">${esc(b.eff)}</p>` : ''}
    <p class="muted">⭐ 經驗 +${b.xp}</p>
    <div class="actions"><button class="primary boss-go" data-act="boss-result-close">繼續</button></div>
  </div></div>`;
}

/** 本局策略:平常只顯示小圖示與等級,點了開彈窗看詳情 */
function stratEntries(s: State): { icon: string; name: string; tone: string; lv: string; good?: string; bad?: string; extra?: string; kind: string }[] {
  const out: { icon: string; name: string; tone: string; lv: string; good?: string; bad?: string; extra?: string; kind: string }[] = [];
  const role = roleById(s.role ?? 'intern');
  if (role) out.push({ icon: role.icon, name: role.name, tone: 'role', lv: '', good: `${role.trait}:${role.traitDesc}`, kind: '職位' });
  const curse = curseById(s.curse ?? '');
  if (curse) out.push({ icon: curse.icon, name: curse.name, tone: 'curse', lv: '', bad: curse.desc, extra: `資歷 ×${curse.mult}`, kind: '挑戰' });
  for (const c of STRATEGIES) {
    const l = stratLv(s, c.id);
    if (l > 0) out.push({ icon: c.icon, name: c.name, tone: c.tone, lv: c.max > 1 ? `Lv${l}` : '進化', good: c.good(l), bad: c.bad(l) || undefined, kind: '策略' });
  }
  return out;
}

function renderStratBar(s: State): string {
  const owned = STRATEGIES.filter((c) => stratLv(s, c.id) > 0);
  const role = roleById(s.role ?? 'intern');
  const curse = curseById(s.curse ?? '');
  if (!owned.length && !role && !curse) return '';
  const icons = (role ? `<button class="si role" data-act="strat-open" title="${esc(role.name)}">${role.icon}</button>` : '')
    + (curse ? `<button class="si curse" data-act="strat-open" title="${esc(curse.name)}">${curse.icon}</button>` : '')
    + owned.map((c) => `<button class="si ${c.tone}" data-act="strat-open" title="${esc(c.name)}">${c.icon}<i>${c.max > 1 ? stratLv(s, c.id) : '★'}</i></button>`).join('');
  return `<div class="strats"><div class="srow">${icons}</div></div>`;
}

function renderStratModal(s: State): string {
  const rows = stratEntries(s).map((e) => `<div class="sd ${e.tone}"><b>${e.icon} ${esc(e.name)}${e.lv ? ` <em>${e.lv}</em>` : ''}</b>${e.good ? `<span>👍 ${esc(e.good)}</span>` : ''}${e.bad ? `<span>👎 ${esc(e.bad)}</span>` : ''}${e.extra ? `<span>${esc(e.extra)}</span>` : ''}</div>`).join('');
  const used = STYLES.filter((st) => (s.styleUse?.[st] ?? 0) > 0).sort((a, b) => (s.styleUse?.[b] ?? 0) - (s.styleUse?.[a] ?? 0));
  const style = `<div class="sd persona"><b>🎭 本局風格</b><span>${used.length ? used.slice(0, 5).map((st) => `${PERSONA_INFO[st].name} ×${s.styleUse?.[st]}`).join(' · ') : '還沒有'}</span><span>結算時累積,Lv1 起會遇到專屬事件</span></div>`;
  return `<div class="modal-bg"><div class="modal strat-modal">
    <div class="modal-head"><h2>本局策略</h2><button class="x" data-act="close-modal" aria-label="關閉">✕</button></div>
    <div class="sdetail">${rows}${style}</div>
    <div class="actions"><button data-act="open-persona">🎭 風格進度</button><button class="primary" data-act="close-modal">關閉</button></div>
  </div></div>`;
}

function renderHabits(s: State): string {
  if (!showHints(s.difficulty)) return '';
  const chips = Object.entries(s.habits).filter(([, n]) => n > 0)
    .map(([k, n]) => `<span class="chip ${HABITS[k]?.good ? 'good' : ''}">${HABITS[k]?.label ?? k} ×${n}</span>`).join('');
  return `<div class="card"><h3>🦋 你最近的習慣</h3>${chips || '<span class="muted">目前沒有明顯的習慣。</span>'}
    <p class="muted">累積夠了會引發後續。</p></div>`;
}

function renderFeedLine(s: State, line: string): string {
  const [main, note] = line.split('||🦋');
  return `<li>${esc(main)}${note && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(note)}</div>` : ''}</li>`;
}

const VERDICT_LABEL: Record<string, string> = { great: '🎉 大成功', good: '👍 順利', bad: '😬 不太妙', awful: '💥 搞砸了' };
const EFF_NAME: Record<string, string> = { players: '玩家', retention: '留存', trust: '信任', boss: '老闆' };

/** 剛做完選擇的醒目評價:大字 + 受影響的數值,不用讀完整段文字就知道好壞 */
function renderVerdict(s: State): string {
  const v = s.verdict;
  if (!v || s.feed[0] !== v.line || v.tier === 'flat') return '';
  const chips = Object.entries(v.eff).filter(([, n]) => n)
    .map(([k, n]) => `<span class="${(n as number) > 0 ? 'up' : 'down'}">${EFF_NAME[k] ?? k} ${(n as number) > 0 ? '+' : ''}${n}${k === 'players' ? '%' : ''}</span>`).join('');
  return `<div class="verdict v-${v.tier}" data-verdict="${v.tier}"><b>${VERDICT_LABEL[v.tier]}</b>${chips}</div>`;
}

function renderOptionButtons(s: State, it: InboxItem, ev: GameEvent): string {
  return itemOptions(s, ev, it).map(({ opt: o, index: i }, pos) => {
    const risky = o.outcomes.length > 1;
    const cost = optionCost(s, it, o);
    return `<button data-act="opt" data-uid="${it.uid}" data-i="${i}" ${risky ? 'data-risky="1"' : ''} ${s.ap < cost ? 'disabled' : ''}>
        <span class="lbl">${place !== 'desk' ? `<i class="kbd">${pos + 1}</i>` : ''}${o.fromSkill ? '✨ ' : ''}${esc(o.label)}</span>
        <span class="cost ${cost > o.ap ? 'up' : cost < o.ap ? 'down' : ''}">${cost ? '⚡'.repeat(cost) : '免費'}</span></button>`;
  }).join('');
}

function renderInbox(s: State): string {
  const sorted = [...s.inbox].sort((a, b) => (b.stage ?? 0) - (a.stage ?? 0) || a.deadline - b.deadline);
  const banner = s.feed[0] ? `<div class="result-note">${renderVerdict(s)}${renderFeedLine(s, s.feed[0]).replace(/^<li>|<\/li>$/g, '')}${lastInsight ? `<div class="insight">💡 ${esc(lastInsight)}</div>` : ''}</div>` : '';
  const buffs = activeBuffs(s);
  const known = s.traits?.known;
  const traitChips = [
    known?.boss ? `<span class="buff trait" title="${esc(BOSS_TRAITS[bossTrait(s)].desc)}">🧭 老闆:${BOSS_TRAITS[bossTrait(s)].name}</span>` : '',
    known?.community ? `<span class="buff trait" title="${esc(COMMUNITY_TRAITS[communityTrait(s)].desc)}">🧭 玩家:${COMMUNITY_TRAITS[communityTrait(s)].name}</span>` : '',
  ].join('');
  const myTitle = personaTitle(s.persona ?? {});
  const personaChip = myTitle ? `<span class="buff trait" title="跨局累積的個人風格">🎭 ${myTitle.title}</span>` : '';
  const colChip = s.colleague ? `<span class="buff trait" title="${esc(colleagueBlurb(s.colleague))}">👥 同事:${esc(s.colleague.title)}</span>` : '';
  const streak = s.rapport ?? 0;
  const rapportChip = streak > 0 ? `<span class="buff trait" title="連續選中對方胃口的做法三次,會進入「默契」狀態">🤝 默契 ${'●'.repeat(streak)}${'○'.repeat(Math.max(0, RAPPORT_NEED - streak))}</span>` : '';
  const buffBar = buffs.length || traitChips || rapportChip || personaChip || colChip ? `<div class="buff-bar">${personaChip}${colChip}${traitChips}${rapportChip}${buffs.map((b) => `<span class="buff" title="${esc(BUFFS[b.id].desc)}">${BUFFS[b.id].icon} ${BUFFS[b.id].name}<small>${b.left} 天</small></span>`).join('')}</div>` : '';
  const dueN = s.inbox.filter((i) => i.deadline <= s.day).length;
  const todo = dueN || s.pendingReports ? `<div class="day-line todo-line">${dueN ? `🔥 今天截止 ${dueN} 件` : ''}${dueN && s.pendingReports ? ' · ' : ''}${s.pendingReports ? `📝 日報 ${s.pendingReports} 份` : ''}</div>` : '';
  const alertNote = s.alert ? `<div class="alert-note">🚨 ${esc(s.alert)}</div>` : '';
  const dayLine = alertNote + buffBar + todo;
  if (!sorted.length) return `${dayLine}${banner}<div class="card empty">收件匣是空的。<br>這種時刻通常撐不過一個小時。</div>`;
  const openable = sorted.filter((i) => !sceneRoomFor(EVENTS[i.eventId]));
  // 預設全部收合,由玩家自己展開
  if (openUid === null || !openable.some((i) => i.uid === openUid)) openUid = -1;
  let order = 0;
  const rows = sorted.map((it) => {
    const isNew = !rendered.has(it.uid);
    rendered.add(it.uid);
    const delay = isNew ? order++ : 0;
    const ev = EVENTS[it.eventId];
    const room = sceneRoomFor(ev);
    const open = !room && it.uid === openUid;
    const left = it.deadline - s.day;
    const due = left <= 0 ? '今天截止' : `還剩 ${left + 1} 天`;
    const opts = open ? renderOptionButtons(s, it, ev) : '';
    const tx = eventText(ev, it);
    const detail = open ? `<div class="mail-body">
      <div class="body">${esc(tx.brief ?? tx.body)}</div>
      ${it.stage ? '<div class="hint warn">對方又來催了:多花 1 點,再拖就不了了之。</div>' : ''}
      ${ev.boss ? bossBar(s, ev) : ''}
      ${it.hint && !it.stage && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(it.hint)}</div>` : ''}
      ${pulseHint(s, ev, it) ? `<div class="hint pulse">📡 風向:${esc(pulseHint(s, ev, it) ?? '')}</div>` : ''}
      ${tx.brief && tx.brief !== tx.body ? `<details class="more"><summary>詳情</summary><div>${esc(tx.body)}</div></details>` : ''}
      <div class="opts">${opts}</div></div>` : '';
    return `<div class="card mail ${ev.boss ? 'boss' : ''} ${it.sudden ? 'sudden' : ''} ${open ? 'open' : ''} ${isNew ? 'enter' : ''} ${it.stage ? 'escalated' : ''}" style="--i:${delay}">
      <button class="mail-head" data-act="toggle" data-uid="${it.uid}" aria-expanded="${open}">
        <span class="k k-${ev.kind}">${KIND_ICON[ev.kind] ?? '📌'}</span>
        <span class="mh"><b>${it.stage ? '🔥 ' : ''}${it.sudden ? '🚨 ' : ''}${ev.boss ? '💀 ' : ''}${ev.persona ? '🎭 ' : ''}${esc(tx.title)}</b>${open ? '' : `<small>${esc(tx.brief ?? tx.body)}</small>`}</span>
        <span class="due ${left <= 0 ? 'urgent' : ''}">${due}</span>${room ? `<span class="go">🚪 ${ROOMS[room].name}</span>` : `<span class="chev">${open ? '▾' : '▸'}</span>`}
      </button>${detail}</div>`;
  }).join('');
  return `${dayLine}${banner}${rows}`;
}

function renderCampaign(s: State): string {
  const c = s.campaign;
  if (!c || c.phase === 'done') {
    return `<div class="camp-state muted">${c ? '上一檔活動已結束。' : '目前沒有活動。'}老闆要營收 + ${Math.round(CAMPAIGN_TARGET * 100)}%。</div>
      <button class="primary row-btn" data-act="open-plan" ${s.ap < 2 ? 'disabled' : ''}><span>規劃新活動</span><span class="cost">⚡⚡+</span></button>`;
  }
  const m = find(CONTENT.mechanics, c.mechanic);
  if (c.phase === 'live') {
    return `<div class="camp-state"><div><b>${m.name}</b> 進行中</div><div>剩餘 ${c.liveDaysLeft} 天</div>
      <div class="muted">結果要等活動結束才會公布。</div></div>`;
  }
  return `<div class="camp-state"><div><b>${m.name}</b> · 第 ${c.launchDay} 天上線</div>
    <div>打磨 ${c.polish}/4 · 驗收 ${c.checked ? '已完成' : '未做'}</div></div>
    <button class="row-btn" data-act="polish" ${s.ap < 1 || c.polish >= 4 ? 'disabled' : ''}><span>打磨活動細節</span><span class="cost">⚡</span></button>
    <button class="row-btn" data-act="check" ${s.ap < 1 || c.checked ? 'disabled' : ''}><span>請技術做上線驗收</span><span class="cost">⚡</span></button>`;
}

function renderLog(s: State): string {
  if (!s.log.length) return '<div class="card empty">還沒有紀錄。做點什麼吧。</div>';
  const byDay = new Map<number, string[]>();
  for (const e of s.log) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e.text]);
  return [...byDay.entries()].map(([d, lines]) =>
    `<div class="card"><h3>第 ${d} 天</h3><ul class="loglist">${lines.map((l) => renderFeedLine(s, l)).join('')}</ul></div>`).join('');
}

const cleanLine = (line: string): string => line.split('||🦋')[0];
const resultOf = (line: string): string => {
  const m = cleanLine(line);
  const i = m.indexOf(' → ');
  return i >= 0 ? m.slice(i + 3) : m;
};

function renderCups(s: State): string {
  return Array.from({ length: s.maxAp }, (_, i) => {
    const spent = prevAp >= 0 && i >= s.ap && i < prevAp;
    const gained = prevAp >= 0 && i < s.ap && i >= prevAp;
    return `<i class="cup ${i < s.ap ? 'on' + (gained ? ' fill' : '') : 'off' + (spent ? ' pop' : '')}"></i>`;
  }).join('');
}

/** 每一步討論時,同事頭上的泡泡內容 */
function planBubbles(step: number): [string, string, string][] {
  const mech = find(CONTENT.mechanics, sel.mechanic);
  const lines: [string, string][][] = [
    [['企劃', '這次想主打什麼玩法?'], ['工程師', `「${mech.name}」要打磨 ${mech.need} 次。`], ['客服', '玩家最近愛輕鬆一點的。']],
    [['企劃', '獎勵要有誠意。'], ['工程師', '太平淡會被做成迷因。'], ['客服', '收藏品玩家很吃這套。']],
    [['企劃', '要不要搭一個禮包?'], ['工程師', '定價太高會被罵。'], ['客服', '信任夠的話可以貴一點。']],
    [['企劃', '怎麼讓大家知道?'], ['工程師', '宣傳越大,要準備越多。'], ['客服', '實況主觸及最廣。']],
    [['企劃', '什麼時候上線?'], ['工程師', '時間太趕會出包。'], ['客服', '記得排驗收喔。']],
  ];
  return lines[step].map(([who, text]) => [who, text, ''] as [string, string, string]);
}

function sanitizeSel(s: State): void {
  const groups: [keyof PlanSel, { id: string; minLevel?: number }[]][] = [
    ['mechanic', CONTENT.mechanics], ['reward', CONTENT.rewards], ['bundle', CONTENT.bundles], ['promo', CONTENT.promos],
  ];
  for (const [k, list] of groups) {
    const cur = list.find((x) => x.id === sel[k]);
    if (!cur || (cur.minLevel ?? 1) > s.level) sel[k] = (list.find((x) => (x.minLevel ?? 1) <= s.level) ?? list[0]).id as never;
  }
}

/** 場景模式的規劃:會議室裡大家討論,下半部是分步面板,上半部的場景一直看得到 */
function renderPlanRoom(s: State, hud: string): string {
  sanitizeSel(s);
  const steps: { key: keyof PlanSel; title: string; items: { id: string; name: string; desc: string; tag?: string; minLevel?: number }[] }[] = [
    { key: 'mechanic', title: '玩法', items: CONTENT.mechanics.map((m) => ({ ...m, tag: `打磨×${m.need}` })) },
    { key: 'reward', title: '獎勵', items: CONTENT.rewards },
    { key: 'bundle', title: '商品', items: CONTENT.bundles },
    { key: 'promo', title: '宣傳', items: CONTENT.promos.map((p) => ({ ...p, tag: p.ap ? `+${p.ap} 點` : '' })) },
    { key: 'delay', title: '時間', items: [
      { id: '1', name: '1 天後上線', desc: '極限趕工' },
      { id: '2', name: '2 天後上線', desc: '很趕,打磨機會少。' },
      { id: '3', name: '3 天後上線', desc: '標準時程。' },
    ] },
  ];
  const st = steps[planStep];
  const cur = st.key === 'delay' ? String(sel.delay) : String(sel[st.key]);
  const picked = st.items.find((i) => i.id === cur) ?? st.items[0];
  const buttons = st.items.map((it) => {
    const need = it.minLevel ?? 1;
    if (s.level < need) return `<button class="popt" disabled><b>🔒 ${it.name}</b><small>職級「${LEVELS[need - 1].title}」解鎖</small></button>`;
    return `<button class="popt ${cur === it.id ? 'sel' : ''}" data-act="pick" data-key="${st.key}" data-id="${it.id}"><b>${it.name}</b>${it.tag ? `<small>${it.tag}</small>` : ''}</button>`;
  }).join('');
  const last = planStep === steps.length - 1;
  const cost = planCost(sel, s);
  const summary = last
    ? `<div class="plan-sum">玩法「${find(CONTENT.mechanics, sel.mechanic).name}」・獎勵「${find(CONTENT.rewards, sel.reward).name}」・商品「${find(CONTENT.bundles, sel.bundle).name}」・宣傳「${find(CONTENT.promos, sel.promo).name}」</div>${comboLine()}`
    : '';
  return `<div class="game roomplay">${hud}
    <div class="room-label">📹 會議室</div>
    <div class="dialog-ui plan">
      <div class="plan-head"><b>${planStep + 1}/5 ${st.title}</b>
        <span class="plan-dots">${steps.map((_, i) => (i === planStep ? '●' : i < planStep ? '◉' : '○')).join(' ')}</span>
        <div class="cups mini" title="今天能做的事有限">${renderCups(s)}</div></div>
      <div class="plan-grid ${st.items.length === 3 ? 'three' : ''}">${buttons}</div>
      <div class="plan-desc">${esc(picked.desc)}</div>
      ${summary}
      <div class="plan-foot">
        <button data-act="plan-prev" ${planStep === 0 ? 'disabled' : ''}>‹ 上一步</button>
        ${last ? `<button class="primary" data-act="confirm-plan" ${s.ap < cost ? 'disabled' : ''}>送出企劃 ${cost} 點</button>` : '<button class="primary" data-act="plan-next">下一步 ›</button>'}
      </div>
      <button class="dlg-leave" data-act="plan-leave">← 先回座位</button>
    </div></div>`;
}

/** 這一件處理完,接下來最該處理的一件(不含茶水間的小插曲):同一間辦公室的優先,否則依急迫程度 */
function nextRoomEvent(s: State, here: Room): InboxItem | undefined {
  const cand = s.inbox.filter((i) => { const r = sceneRoomFor(EVENTS[i.eventId]); return !!r && r !== 'pantry'; });
  const urgent = (a: InboxItem, b: InboxItem) => (b.stage ?? 0) - (a.stage ?? 0) || a.deadline - b.deadline;
  const same = cand.filter((i) => sceneRoomFor(EVENTS[i.eventId]) === here).sort(urgent);
  return same[0] ?? cand.sort(urgent)[0];
}

function renderRoomUI(s: State, hud: string): string {
  if (place === 'meeting' && planning) return renderPlanRoom(s, hud);
  const room = place as Room;
  const info = ROOMS[room];
  const it = dialogUid !== null ? s.inbox.find((i) => i.uid === dialogUid) : undefined;
  const nextEv = room !== 'pantry' ? nextRoomEvent(s, room) : undefined;
  const nextLabel = !nextEv ? '▶ 回座位' : sceneRoomFor(EVENTS[nextEv.eventId]) === room ? '▶ 下一件' : `▶ 下一件(去${ROOMS[sceneRoomFor(EVENTS[nextEv.eventId]) as Room].name})`;
  let speaker = info.who;
  let title = '';
  let text = '';
  let body: string;
  if (it && !dialogResult) {
    const ev = EVENTS[it.eventId];
    const tx = eventText(ev, it);
    speaker = tx.from;
    title = `${ev.boss ? '💀 ' : ''}${tx.title}`;
    text = tx.brief ?? tx.body;
    const hint = it.stage ? '上次沒處理,對方又來催了。這次處理要多花 1 點。' : it.hint && showHints(s.difficulty) ? `🦋 ${it.hint}` : '';
    const ph = pulseHint(s, ev, it);
    body = `${ev.boss ? bossBar(s, ev) : ''}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}${ph ? `<div class="hint pulse">📡 風向:${esc(ph)}</div>` : ''}<div class="opts">${renderOptionButtons(s, it, ev)}</div>`;
  } else if (dialogResult && s.feed[0]) {
    speaker = '結果';
    text = resultOf(s.feed[0]);
    const note = s.feed[0].split('||🦋')[1];
    body = `${renderVerdict(s)}${note && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(note)}</div>` : ''}${lastInsight ? `<div class="insight">💡 ${esc(lastInsight)}</div>` : ''}<button class="primary" data-act="dialog-next">${nextLabel}</button>${nextEv ? '<button class="dlg-leave" data-act="dialog-leave">← 先回座位</button>' : ''}`;
  } else {
    text = dialogText ?? '';
    body = '<button class="primary" data-act="dialog-next">▶ 回座位</button>';
  }
  return `<div class="game roomplay">${hud}
    <div class="room-label">${info.icon} ${info.name}</div>
    <div class="dialog-ui${it && !dialogResult && EVENTS[it.eventId]?.boss ? ' boss' : ''}">
      <div class="dlg-head"><div class="dlg-speaker">${esc(speaker)}</div><div class="cups mini" title="今天能做的事有限">${renderCups(s)}</div></div>
      ${title ? `<div class="dlg-title">${esc(title)}</div>` : ''}
      <div class="dlg-text">${esc(text)}</div>
      ${body}
      ${it && !dialogResult ? '<button class="dlg-leave" data-act="dialog-next">← 先回座位</button>' : ''}
    </div></div>`;
}

function renderGame(s: State): string {
  const prev = s.history[s.history.length - 1];
  const spend = spendToday(s);
  const days = s.mode === 'story' ? `${Math.min(s.day, STORY_DAYS)}/${STORY_DAYS}` : `第 ${s.day} 天`;
  const camp = s.campaign && s.campaign.phase !== 'done';
  const tabs: [Tab, string][] = [
    ['inbox', `📥 收件匣 <em>${s.inbox.length}</em>`],
    ['camp', `🎪 活動${camp ? ' <i class="dot"></i>' : ''}`],
    ['goals', '🎯 本局'],
  ];
  let body = '';
  if (tab === 'inbox') body = renderInbox(s);
  else if (tab === 'camp') body = `<div class="card"><h3>活動</h3>${renderCampaign(s)}</div>`;
  else if (tab === 'goals') body = `${renderGoals(s)}${renderHabits(s)}
    <details class="card glossary"><summary>名詞小教室</summary><dl>
      <dt>留存率</dt><dd>${TIPS.retention}</dd><dt>日營收</dt><dd>${TIPS.spend}</dd>
      <dt>🔥 再次催辦</dt><dd>逾期沒處理的事,隔天會再來催。處理要多花 1 點,再逾期就不了了之。</dd></dl></details>
    <details class="card"><summary>📜 紀錄</summary>${renderLog(s)}</details>`;
  else body = renderInbox(s);
  const gm = (k: GoalKey): boolean => s.goals.some((g) => g.key === k && goalMet(s, g));
  const metricsHtml = `
      ${metric('players', '玩家', s.players, 0, '', delta(s.players, prev.players), undefined, gm('players'))}
      ${metric('retention', '留存', s.retention, 1, '%', '', s.retention, gm('retention'))}
      ${metric('spend', '營收(萬點)', spend, 1, '', delta(spend, prev.spend, 1), undefined, gm('spend'))}
      ${metric('trust', '信任', s.trust, 0, '', '', s.trust, gm('trust'))}
      ${metric('boss', '老闆', s.boss, 0, '', '', s.boss, gm('boss'))}`;
  const tabList = tabs;
  const tabsHtml = tabList.map(([k, label]) => `<button class="${tab === k ? 'sel' : ''}" data-act="tab" data-t="${k}">${label}</button>`).join('');
  const dockHtml = `
    ${s.scout
    ? '<button class="pulse" data-act="scout-open"><span>📡 輿情報告</span><span class="cost">待選</span></button>'
    : `<button data-act="intel" ${s.ap < 1 || s.pulse === s.day ? 'disabled' : ''}><span>💬 看輿情${pulseActive(s) ? ' 📡' : ''}</span><span class="cost">⚡</span></button>`}
    <button data-act="report" ${(!reportFree(s) && s.ap < 1) || s.pendingReports <= 0 ? 'disabled' : ''}><span>📝 填日報${s.pendingReports ? ` (${s.pendingReports})` : ''}</span><span class="cost ${reportFree(s) ? 'down' : ''}">${reportFree(s) ? '免費' : '⚡'}</span></button>
    <button data-act="sloppy" ${s.pendingReports <= 0 ? 'disabled' : ''} title="不花點數,但會留下草率的紀錄"><span>🙈 隨便填</span><span class="cost">免費</span></button>
    <button class="primary end ${s.ap === 0 || !s.inbox.length ? 'pulse' : ''}" data-act="end"><span>${endArmed ? '再按一次結束' : '結束今天 ▶'}</span></button>`;
  const xpPct = Math.min(100, Math.round(((s.xp ?? 0) / xpNeed(s.lv ?? 1)) * 100));
  const hudHtml = `<header class="hud">
    <div class="xpline"><b>Lv ${s.lv ?? 1}</b><span class="xpbar"><span data-bar="xp" data-w="${xpPct}" style="width:${xpPct}%"></span></span><span class="threat t${Math.min(5, threatLevel(s))}" title="危機等級:事件更多,逾期與失敗的代價更重${paceOf(s).mode === 'press' ? '。你領先目標,導演加壓' : paceOf(s).mode === 'ease' ? '。你落後目標,導演放水' : ''}">☠ ${threatLevel(s)}${paceOf(s).mode === 'press' ? '▲' : paceOf(s).mode === 'ease' ? '▼' : ''}</span></div>
    <div class="topbar">
      <div class="day ${prevDay >= 0 && prevDay !== s.day ? 'bump' : ''}">${weekdayLabel(s.day)} <span class="muted">${days} · ${PHASES[phaseOf(s.day).key].name} · ${s.mode === 'story' ? '劇情' : '無限'} · ${DIFFS[s.difficulty].label}</span></div>
      <div class="ap" title="今天能做的事有限,用完就只能結束這一天">
        ${Array.from({ length: s.maxAp }, (_, i) => {
          const spent = prevAp >= 0 && i >= s.ap && i < prevAp;
          const gained = prevAp >= 0 && i < s.ap && i >= prevAp;
          return `<i class="${i < s.ap ? (gained ? 'fill' : '') : 'off' + (spent ? ' pop' : '')}"></i>`;
        }).join('')}
      </div>
      <button class="menu-btn" data-act="open-menu" aria-label="選單">☰<span class="mt"> 選單</span></button>
    </div>
    <div class="metrics">${metricsHtml}</div>
    ${renderStratBar(s)}
  </header>`;
  const sideHtml = `<aside class="side-ui">${renderSide(s)}</aside>`;
  if (place !== 'desk') return renderRoomUI(s, hudHtml + sideHtml);
  return `
  <div class="game">
  ${hudHtml}
  <nav class="tabs">${tabsHtml}</nav>
  <main class="stage">${body}</main>
  <footer class="dock">${dockHtml}</footer>
  ${sideHtml}
  </div>`;
}

const comboLine = (): string => {
  const cs = combosFor(sel);
  return cs.length ? `<div class="plan-sum">✨ 搭配加成:${cs.map((c) => `「${c.name}」${esc(c.desc)}`).join(' ')}</div>` : '';
};

/** 結算每一行的語氣:壞事、好事、平淡的收尾,用左邊的色條分開 */
function lineTone(l: string): string {
  if (l.startsWith('🌆')) return 'quiet';
  if (/^(✅|🏆|🎉|✨)/.test(l) || l.includes('餘波:話題')) return 'good';
  if (/^(⏰|❌|📉|⚠️|💢|📋)/.test(l) || l.includes('逾期') || l.includes('不了了之')) return 'bad';
  return '';
}

function renderSummary(): string {
  if (!summary) return '';
  const d = summary;
  const row = (label: string, a: number, b: number, dg = 0, unit = '') => {
    const diff = b - a;
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    return `<tr><td>${label}</td><td>${fmt(a, dg)}${unit}</td><td>→ ${fmt(b, dg)}${unit}</td><td class="${cls}">${diff ? (diff > 0 ? '+' : '') + fmt(diff, dg) + unit : '—'}</td></tr>`;
  };
  return `<div class="modal-bg"><div class="modal">
    <h2>第 ${d.day} 天結束</h2>
    <table style="width:100%;border-collapse:collapse"><tbody>
      ${row('日營收(萬點)', d.prevSpend, d.spend, 1)}
      ${row('玩家人數', d.before.players, d.players)}
      ${row('留存率', d.before.retention, d.retention, 1, '%')}
      ${row('玩家信任', d.before.trust, d.trust)}
      ${row('老闆滿意', d.before.boss, d.boss)}
    </tbody></table>
    ${d.lines.length ? `<hr>${d.lines.map((l) => `<p class="sl ${lineTone(l)}">${esc(l)}</p>`).join('')}` : '<hr><p class="muted">今天沒事。</p>'}
    <div class="actions"><button class="primary" data-act="close-modal">進入下一天</button></div>
  </div></div>`;
}

function renderIntro(): string {
  return `<div class="modal-bg"><div class="modal">
    <h2>歡迎上班</h2>
    <p>你是這款遊戲的<b>${LEVELS[S!.level - 1].title}</b>(Lv ${S!.level}・${DIFFS[S!.difficulty].label}難度)。每天有 ${S!.maxAp} 點行動點數,可以用來:</p>
    <p>・處理收件匣的事 ・規劃活動 ・看輿情、填日報</p>
    <p>點數不會累積,沒處理的事會變成麻煩。看好人數、留存、營收、信任與老闆。</p>
    <hr><p><b>${S!.mode === 'story' ? '試用期結束時要達成:' : '第一次考核(第 10 天)要達成:'}</b><br>${S!.goals.map((g) => '・' + goalText(g)).join('<br>')}</p>
    <p class="muted">同樣的選擇,結果會因老闆與玩家的脾氣不同。</p>
    <div class="actions"><button class="primary" data-act="close-modal">開始第一天</button></div>
  </div></div>`;
}

/** 同事卡的分享區:第一次拿到卡時醒目提示,之後結算畫面也留一個複製捷徑 */
function renderCardShare(first: boolean): string {
  const code = encodeCard(profile.persona ?? {});
  if (!code) return '';
  const pt = personaTitle(profile.persona ?? {});
  return `<div class="cardshare ${first ? 'first' : ''}"><h4>${first ? '🎴 你拿到了同事卡!' : '🎴 我的同事卡'}</h4>
    ${first ? `<p class="muted">可以當別人的同事了:把代碼傳給朋友,貼進「👥 同事」。</p>` : ''}
    <div class="col-title">${pt ? esc(pt.title) : ''}</div><code>${code}</code>
    <div class="cardshare-btns"><button data-act="col-copy">📋 複製代碼分享</button><button data-act="col-manage">👥 管理同事卡</button></div></div>`;
}

function renderAward(s: State): string {
  const a = s.award;
  if (!a) return '';
  const from = levelFor(a.fromXp);
  const to = levelFor(a.toXp);
  const nxt = nextLevel(a.toXp);
  const unlocks = LEVELS.filter((l) => l.lv > from.lv && l.lv <= to.lv).flatMap((l) => l.unlocks);
  return `<div class="award"><h3>🏅 資歷 +${a.credits ?? 0}<small>共 ${profile.credits ?? 0}</small></h3>
    <div class="muted">${(a.curseMult ?? 1) > 1 ? `挑戰加成 ×${a.curseMult} · ` : ''}到檔案解鎖新職位與策略</div>
    <h4>職級經驗 +${a.xp}</h4>
    <ul>${a.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="xpbar"><span style="--to:${xpPercent(a.toXp)}%"></span></div>
    <small>${to.title} Lv ${to.lv}${nxt ? ` · 距離「${nxt.title}」還差 ${nxt.xp - a.toXp}` : ' · 最高職級'}</small>
    ${a.creditLines?.length ? `<div class="spgain">🗂️ 資歷來源<ul>${a.creditLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    ${a.personaLines?.length ? `<div class="spgain">🎭 風格成長<ul>${a.personaLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    ${renderCardShare(a.firstCard === true)}
    ${to.lv > from.lv ? `<div class="levelup">🎉 升職了!${from.title} → ${to.title}<ul>${unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}</div>`;
}

/** 結局畫面的「難忘時刻」:挑最重的 4 筆,再依發生的先後排列 */
function renderMoments(s: State): string {
  const top = [...(s.moments ?? [])].sort((a, b) => b.w - a.w || b.day - a.day).slice(0, 4).sort((a, b) => a.day - b.day);
  if (!top.length) return '';
  return `<div class="moments"><h3>這一局的難忘時刻</h3>${top.map((m) => `<p><span class="md">第 ${m.day} 天</span> ${esc(m.icon)} ${esc(m.text)}</p>`).join('')}</div><hr>`;
}

function renderOver(s: State): string {
  const peak = Math.max(...s.history.map((h) => h.spend));
  return `<div class="modal-bg"><div class="modal">
    <h2>${s.over!.title}</h2>
    <p>${s.over!.body}</p>
    ${s.over!.style ? `<p class="over-style">這一局的你:<b>${esc(s.over!.style.name)}</b><br>${esc(s.over!.style.text)}</p>` : ''}
    <hr>
    <p>${s.goals.map((g) => `${goalMet(s, g) ? '✅' : '❌'} ${goalText(g)}(結果 ${fmt(goalValue(s, g.key), GOAL_INFO[g.key].digits)})`).join('<br>')}</p>
    <hr>
    ${renderMoments(s)}
    <p class="muted">${s.mode === 'story' ? '試用期' : '你撐了'} ${s.day - 1} 天 · 玩家 ${fmt(s.players)} 人 · 單日最高營收 ${fmt(peak, 1)} 萬點</p>
    ${renderAward(s)}
    <div class="actions"><button data-act="home">回到標題</button><button class="primary" data-act="new" data-mode="${s.mode}">再來一次</button></div>
  </div></div>`;
}

/* ---------- 轉場 ---------- */
const fadeCanvas = createFadeCanvas();

async function goPlace(next: Place, apply?: () => void): Promise<void> {
  if (transitioning) return;
  transitioning = true;
  try {
    if (!fastNow()) await dissolve(fadeCanvas, 160, 'in');
    place = next;
    apply?.();
    sceneKey = '';
    // 換場後不讓剛點過的按鈕留著焦點,否則數字鍵與空白鍵會被當成在操作那顆按鈕
    (document.activeElement as HTMLElement | null)?.blur?.();
    render();
    if (!fastNow()) await dissolve(fadeCanvas, 240, 'out');
  } finally {
    transitioning = false;
    fadeCanvas.style.display = 'none';
    setTimeout(flushPendingClick, 0);
  }
}

function flushPendingClick(): void {
  const p = pendingClick;
  pendingClick = null;
  if (!p || busy || transitioning) return;
  const el = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('[data-act]');
  if (el && REPLAY_ACTS.has(el.dataset.act ?? '')) el.click();
}


/* ---------- 像素場景:畫布與版面變數 ---------- */

const sceneCanvas = document.createElement('canvas');
sceneCanvas.id = 'scene';
document.body.prepend(sceneCanvas);
let sceneKey = '';
let sceneVarsReady = false;

/* 緊張度:0 平靜、1 忙碌、2 危急。決定整個場景的色調與警示燈 */
const mood = document.createElement('div');
mood.id = 'mood';
mood.innerHTML = '<i class="m1"></i><i class="m2"></i>';
sceneCanvas.after(mood);

function tensionLevel(s: State): 0 | 1 | 2 {
  const dueToday = s.inbox.filter((i) => i.deadline <= s.day).length;
  if (s.inbox.some((i) => EVENTS[i.eventId]?.boss) || s.inbox.some((i) => i.stage) || dueToday >= 3 || s.trust <= 25 || s.boss <= 25) return 2;
  if (dueToday >= 2 || s.pendingReports >= 3 || s.trust <= 40 || s.boss <= 40) return 1;
  return 0;
}

function sceneVars(): void {
  if (sceneVarsReady) return;
  const root = document.documentElement.style;
  root.setProperty('--cup-full', `url(${spriteURL(CUP_FULL, CUP_PALETTE, 3)})`);
  root.setProperty('--cup-empty', `url(${spriteURL(CUP_EMPTY, CUP_PALETTE, 3)})`);
  root.setProperty('--siren', `url(${spriteURL(SIREN, SIREN_PALETTE, 3)})`);
  sceneVarsReady = true;
}

const sceneBub = document.createElement('div');
sceneBub.id = 'scenebub';
document.body.appendChild(sceneBub);
const sceneCap = document.createElement('div');
sceneCap.id = 'scenecap';
document.body.appendChild(sceneCap);
let splitDraw: (() => void) | null = null;
let animFrame = 0;
const noMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (!noMotion) {
  window.setInterval(() => {
    if (document.hidden || !document.body.classList.contains('split') || !splitDraw) return;
    animFrame++;
    splitDraw();
  }, 350);
}

/** 場景下方的一句話:每個階段第一天講階段重點,其他時候是同事的口頭禪或當天的氛圍 */
let lastAlert = '';
function sceneCaption(s: State): string {
  if (s.alert) return `🚨 ${s.alert}`;
  if (s.bossNext && s.day % 5 === 4) return `💀 明天首領:${EVENTS[s.bossNext].title.replace('首領:', '')}`;
  const ph = phaseOf(s.day);
  if (ph.first) return `📌 ${PHASES[ph.key].name}:${PHASES[ph.key].blurb}`;
  if (s.colleague && s.colSay) return `👥 ${s.colleague.title}:${s.colSay}`;
  return s.dayLine ? `🌤️ ${s.dayLine}` : '';
}

/** 分割版面:場景自己占一塊(直式在上方、寬螢幕在左側),介面在另一塊,互不遮擋 */
function syncSplit(s: State | null): void {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const title = s === null;
  const wide = !title && vw >= 900 && vw > vh * 1.1;
  const pw = title ? vw : wide ? Math.round(Math.min(vw * 0.46, 640)) : vw;
  const ph = title ? vh : wide ? Math.round(Math.min(vh * 0.58, pw * 0.75))
    : place === 'desk' ? clampN(Math.round(vh * 0.26), 150, 240) : clampN(Math.round(vh * 0.34), 190, 300);
  const L = computeSplitLayout(pw, ph);
  const summaryShown = modal === 'summary';
  const maxAp = s ? s.maxAp : 6;
  const ap = !s ? 6 : summaryShown ? 0 : s.ap;
  const t = s && s.maxAp > 0 ? (summaryShown ? 1 : (s.maxAp - s.ap) / s.maxAp) : 0;
  const crowd = place === 'meeting' && planning;
  const mate = s ? s.colleague?.style : selectedColleague()?.style;
  const cxv = Math.round((pw - L.W * L.S) / 2);
  const cyv = wide ? 0 : Math.round((ph - L.H * L.S) / 2);
  const bubs = s && place === 'meeting' && planning ? planBubbles(planStep) : [];
  const bubHtml = bubs.map(([who, text], i) => `<div class="sbub" style="left:${cxv + Math.floor(L.W * [0.22, 0.5, 0.78][i]) * L.S}px;top:${cyv + (L.dlg.y - 56) * L.S}px;width:${Math.min(160, Math.floor(L.W * 0.28 * L.S) - 10)}px"><b>${who}</b>${esc(text)}</div>`).join('');
  if (sceneBub.innerHTML !== bubHtml) sceneBub.innerHTML = bubHtml;
  const cap = !s ? '' : place === 'desk' ? sceneCaption(s) : '';
  if (sceneCap.textContent !== cap) sceneCap.textContent = cap;
  sceneCap.style.display = cap ? 'block' : 'none';
  const sh = shopOf();
  const forceStage = THEMES[sh.theme]?.stage;
  const pet = sh.pet && sh.owned.includes('pet_cat');
  const key = `s${pw}x${ph}:${place}${crowd ? ':plan' : ''}:${ap}/${maxAp}:${Math.round(t * 100)}:${mate ?? ''}:${s ? s.history.length : 0}:${s ? Math.round(s.players) : 0}:${forceStage ?? ''}:${pet ? 'p' : ''}`;
  if (key === sceneKey) return;
  const layoutChanged = !sceneKey.startsWith(`s${pw}x${ph}:`);
  sceneKey = key;
  if (layoutChanged) {
    const root = document.documentElement.style;
    root.setProperty('--pane-w', `${pw}px`);
    root.setProperty('--pane-h', `${ph}px`);
    root.setProperty('--cx', `${cxv}px`);
    root.setProperty('--cy', `${cyv}px`);
    sceneCanvas.style.width = `${L.W * L.S}px`;
    sceneCanvas.style.height = `${L.H * L.S}px`;
  }
  document.body.classList.toggle('split-wide', wide);
  document.body.classList.toggle('at-desk', place === 'desk');
  const where = place;
  splitDraw = () => {
    if (where === 'desk') renderOffice(sceneCanvas, L, t, mate, { ap, maxAp, series: s ? [...s.history.map((h) => h.players), s.players] : [], frame: animFrame, stage: forceStage, pet });
    else renderRoom(sceneCanvas, L, where as Room, t, crowd, mate, animFrame, forceStage);
  };
  splitDraw();
}

/** 依目前畫面顯示或隱藏場景,並在尺寸或時間改變時重畫 */
function syncScene(): void {
  const inGame = screen === 'game' && !!S;
  const scene = screen === 'start' || inGame;
  document.body.classList.toggle('split', inGame);
  document.body.classList.toggle('title', screen === 'start');
  document.body.classList.toggle('on-skills', screen === 'archive' || screen === 'shop');
  document.body.dataset.tension = inGame && S ? String(tensionLevel(S)) : '0';
  if (!scene) return;
  sceneVars();
  syncSplit(inGame ? S : null);
}

let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    sceneKey = '';
    syncScene();
  });
});

function render(): void {
  if (screen === 'archive' || screen === 'shop') {
    const y = window.scrollY;
    app.innerHTML = screen === 'shop' ? renderShop() + (modal === 'buy' ? renderBuyModal() : '') : renderArchive();
    window.scrollTo(0, y);
    lastScreen = 'skills';
    syncScene();
    return;
  }
  if (screen === 'start' || !S) {
    app.innerHTML = renderStart();
    if (lastScreen !== 'start') app.querySelector('.start')?.classList.add('open');
    const startKey = START_MODALS.includes(modal) ? modal : 'none';
    if (startKey !== 'none' && lastModal !== startKey) app.querySelector('.modal-bg')?.classList.add('open');
    lastModal = startKey;
    lastScreen = 'start';
    syncScene();
    return;
  }
  const s = S;
  // 結算畫面還在「今天」:日曆與咖啡杯先維持今天的樣子,按下「進入下一天」才翻頁、補滿
  if (s.cardPick && !s.over && modal === 'none') modal = 'cards';
  else if (!s.over && modal === 'none' && !s.cardPick) {
    if (s.bossResult) modal = 'bossresult';
    else if (s.inbox.some((i) => EVENTS[i.eventId]?.boss && i.uid !== s.bossIntro)) modal = 'boss';
  }
  const shown: State = modal === 'summary' && summary ? { ...s, day: summary.day, ap: 0 } : s;
  let html = renderGame(shown);
  const overShown = !!s.over && modal !== 'summary';
  if (overShown) html += renderOver(s);
  else if (modal === 'summary') html += renderSummary();
  else if (modal === 'intro') html += renderIntro();
  else if (modal === 'cards') html += renderCards(s);
  else if (modal === 'strats') html += renderStratModal(s);
  else if (modal === 'persona') html += renderPersonaModal();
  else if (modal === 'buy') html += renderBuyModal();
  else if (modal === 'upsell') html += renderUpsell();
  else if (modal === 'boss') html += renderBossIntro(s);
  else if (modal === 'bossresult') html += renderBossResult(s);
  else if (modal === 'gamemenu') html += renderGameMenu();
  else if (modal === 'report') html += renderReport(s);
  else if (modal === 'scout') html += renderScout(s);
  else if (modal === 'settings') html += renderSettings();
  const key = overShown ? 'over' : modal;
  // 重繪會把捲動位置歸零,同一個彈窗內操作時要保留
  const prevModal = app.querySelector('.modal') as HTMLElement | null;
  const modalTop = prevModal && key === lastModal ? prevModal.scrollTop : 0;
  const pageY = window.scrollY;
  const stageTop = app.querySelector('.stage')?.scrollTop ?? 0;
  const appTop = app.scrollTop;
  const sideTop = app.querySelector('.side-ui')?.scrollTop ?? 0;
  app.innerHTML = html;
  // 右側(或下方)的遊玩區是會捲動的容器:重畫後把位置還原,不要每次選完都跳回最上面
  app.scrollTop = appTop;
  const sideEl = app.querySelector('.side-ui');
  if (sideEl) sideEl.scrollTop = sideTop;
  const stage = app.querySelector('.stage');
  if (stage) stage.scrollTop = stageTop;
  const nextModal = app.querySelector('.modal') as HTMLElement | null;
  if (nextModal) nextModal.scrollTop = modalTop;
  window.scrollTo(0, pageY);
  const opening = key !== 'none' && key !== lastModal;
  if (opening) app.querySelector('.modal-bg')?.classList.add('open');
  lastModal = key;
  if (s.alert && s.alert !== lastAlert) { lastAlert = s.alert; flash(`🚨 ${s.alert}`, 3200); } else if (!s.alert) lastAlert = '';
  if (opening) modalEffects(key, s);
  lastScreen = 'game';
  syncScene();
  animate();
  prevAp = shown.ap;
  prevDay = shown.day;
}

/** 彈窗出現時的慶祝或警示效果 */
function modalEffects(key: string, s: State): void {
  const modalEl = app.querySelector('.modal') as HTMLElement | null;
  if (!modalEl) return;
  if (key === 'summary' && summary) {
    const lines = summary.lines;
    if (lines.some((l) => l.startsWith('✅') || l.startsWith('🏆'))) { rain(['💰', '🪙', '✨', '🎉'], 30); burst(...centerOf(modalEl), ['🎉', '✨', '💰'], 26); }
    else if (lines.some((l) => l.startsWith('❌') || l.startsWith('📉'))) modalEl.classList.add('shake-big');
  } else if (key === 'bossresult' && s.bossResult) {
    if (s.bossResult.win) { rain(['🏆', '✨', '🎉', '⭐'], 44); burst(...centerOf(modalEl), ['🏆', '✨', '⭐'], 24); } else modalEl.classList.add('shake-big');
  } else if (key === 'boss') {
    modalEl.classList.add('shake-big');
  } else if (key === 'over' && s.over) {
    if (s.award && levelFor(s.award.toXp).lv > levelFor(s.award.fromXp).lv) rain(['🎉', '🏅', '✨', '⭐', '🏆'], 60);
    else if (s.over.title.includes('轉正')) rain(['🎉', '🎊', '✨', '💰', '🏆'], 50);
    else if (s.over.title.includes('延長')) rain(['✨'], 12);
    else modalEl.classList.add('sad');
  }
}

/** 數字滾動、進度條滑動:只有數值真的變了才動 */
function animate(): void {
  app.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const k = el.dataset.count as string;
    const to = Number(el.dataset.to);
    const d = Number(el.dataset.d ?? 0);
    const suffix = el.dataset.suffix ?? '';
    const from = prevNums[k];
    prevNums[k] = to;
    if (from === undefined || from === to || reduceMotion) return;
    const card = el.closest('.metric');
    const diff = to - from;
    card?.classList.add(diff > 0 ? 'flash-up' : 'flash-down');
    // 每日結算畫面開著時,數字的變化已經列在結算表裡,不再在彈窗上方飄出浮動數字
    if (card && modal !== 'summary' && Math.abs(diff) >= Math.pow(10, -d)) {
      floatText(card, `${diff > 0 ? '+' : ''}${fmt(diff, d)}${suffix}`, diff > 0);
      if ((k === 'trust' || k === 'boss') && diff <= -5) card.classList.add('shake');
      if ((k === 'trust' || k === 'boss') && diff >= 5) burst(...centerOf(card), ['✨', '⭐'], 10);
      if (k === 'spend' && diff / Math.max(from, 1) >= 0.1) burst(...centerOf(card), ['💰', '🪙', '✨'], 14);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 650);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)), d) + suffix;
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  app.querySelectorAll<HTMLElement>('[data-gok]').forEach((el) => {
    const k = el.dataset.gok as string;
    const ok = el.dataset.ok === '1';
    const was = prevGoal[k];
    prevGoal[k] = ok;
    if (was === false && ok) { el.classList.add('goal-hit'); burst(...centerOf(el), ['✅', '✨', '🎉'], 16); }
  });
  const vEl = app.querySelector<HTMLElement>('[data-verdict]');
  if (vEl && S && S.verdict && S.verdict.line !== prevVerdict) {
    const tier = vEl.dataset.verdict;
    if (tier === 'great') burst(...centerOf(vEl), ['🎉', '✨', '⭐'], 24);
    else if (tier === 'good') burst(...centerOf(vEl), ['✨', '👍'], 8);
    else if (tier === 'awful') document.body.classList.add('shake-screen');
    if (tier === 'awful') setTimeout(() => document.body.classList.remove('shake-screen'), 500);
  }
  prevVerdict = S?.verdict?.line;
  const firstLine = app.querySelector('.feed li');
  if (firstLine && S && S.feed[0] !== prevFeed0) firstLine.classList.add('new-line');
  prevFeed0 = S?.feed[0];
  app.querySelectorAll<HTMLElement>('[data-bar]').forEach((el) => {
    const k = el.dataset.bar as string;
    const to = Number(el.dataset.w);
    const from = prevBars[k];
    prevBars[k] = to;
    if (from === undefined || from === to || reduceMotion) return;
    el.style.transition = 'none';
    el.style.width = from + '%';
    void el.offsetWidth;
    el.style.transition = '';
    el.style.width = to + '%';
  });
}

/* ---------- 提示卡:獨立的圖層,不跟著畫面重畫,點一下就收起 ---------- */
const toasts = document.createElement('div');
toasts.id = 'toasts';
document.body.appendChild(toasts);
let toastTimer = 0;

/** 把一段提示拆成圖示、標題與幾行內文:「📡 【標題】內文 🧭 補充」 */
function parseToast(msg: string): { icon: string; title: string; lines: string[]; warn: boolean } {
  let rest = msg.trim();
  const em = rest.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u);
  const icon = em ? em[1] : '';
  if (em) rest = rest.slice(em[0].length);
  const warn = /不足|失敗|不對|沒有這/.test(msg);
  const br = rest.match(/^【([^】]+)】\s*/);
  let title = '';
  if (br) { title = br[1]; rest = rest.slice(br[0].length); }
  // 補充的小段(🧭、🔎、👥 等)各自一行,其餘依句號分行
  const lines = rest.split(/\s*(?=\p{Extended_Pictographic})/u).flatMap((seg) => seg.split(/(?<=[。!?])\s*/)).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  if (!title) { title = lines.shift() ?? ''; }
  return { icon, title, lines, warn };
}

function flash(msg: string | null, ms = 1500): void {
  if (!msg) return;
  const p = parseToast(msg);
  const card = document.createElement('div');
  card.className = `toast-card${p.warn ? ' warn' : ''}`;
  card.innerHTML = `${p.icon ? `<span class="tc-i">${esc(p.icon)}</span>` : ''}<span class="tc-b"><b>${esc(p.title)}</b>${p.lines.map((l) => `<span>${esc(l)}</span>`).join('')}</span>`;
  toasts.replaceChildren(card);
  const hold = Math.min(8000, Math.max(ms, 2200 + msg.length * 55));
  window.clearTimeout(toastTimer);
  const close = (): void => { card.classList.add('out'); window.setTimeout(() => card.remove(), 220); };
  card.addEventListener('click', () => { window.clearTimeout(toastTimer); close(); });
  toastTimer = window.setTimeout(close, hold);
}

function clearToasts(): void {
  window.clearTimeout(toastTimer);
  toasts.replaceChildren();
}

/* ---------- 事件 ---------- */

function startNew(mode: Mode): void {
  S = newGame(mode, difficulty, Date.now(), levelFor(profile.xp).lv, profile.seen, personaLevels(profile.persona ?? {}), selectedColleague(), profile.unlock, profile.role, profile.curse);
  resetPlace();
  resetMotion();
  openUid = null;
  tab = 'inbox';
  screen = 'game';
  modal = 'intro';
  save(S);
  render();
}


/** 辦公室裡的對話:數字鍵選選項,空白鍵或 Enter 繼續(按鈕本身有焦點時交給瀏覽器) */
function roomKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || screen !== 'game' || place === 'desk' || modal !== 'none' || busy || transitioning) return false;
  if (e.target instanceof Element && e.target.closest('button, input, textarea, select')) return false;
  if (/^[1-9]$/.test(e.key)) {
    const btn = app.querySelectorAll<HTMLButtonElement>('.dialog-ui [data-act="opt"]')[Number(e.key) - 1];
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    const next = app.querySelector<HTMLButtonElement>('.dialog-ui button.primary[data-act="dialog-next"]');
    if (next) { next.click(); return true; }
  }
  return false;
}

document.addEventListener('keydown', (e) => {
  if (roomKey(e)) { e.preventDefault(); return; }
  // 每天結算畫面:空白鍵或 Enter 進入下一天
  if ((e.key === ' ' || e.key === 'Enter') && modal === 'summary' && !busy && !transitioning && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const next = app.querySelector<HTMLButtonElement>('.actions button.primary[data-act="close-modal"]');
    if (next) { e.preventDefault(); next.click(); return; }
  }
  if (e.key === 'Escape' && modal === 'scout') { modal = 'none'; render(); }
  else if (e.key === 'Escape' && modal === 'report') { modal = 'none'; reportQuiz = null; reportDone = null; render(); }
  else if (e.key === 'Escape' && planning && !transitioning) { void goPlace('desk', resetPlace); }
  else if (e.key === 'Escape' && (START_MODALS.includes(modal) || modal === 'gamemenu' || modal === 'strats')) { modal = 'none'; render(); }
});

// 動畫或換場期間的點擊(可能落在換場遮罩上):記下位置,結束後補做
let unstickTimer = 0;
/** 萬一互動鎖(動畫、換場)沒有解開,按鈕會全部被忽略:被擋住的點擊 1.5 秒後強制解鎖並補做 */
function unstickLater(): void {
  if (unstickTimer) return;
  unstickTimer = window.setTimeout(() => {
    unstickTimer = 0;
    if (busy || transitioning) {
      busy = false;
      transitioning = false;
      fadeCanvas.style.display = 'none';
      flushPendingClick();
    }
  }, 1500);
}
document.addEventListener('click', (e) => {
  if (busy || transitioning) { pendingClick = { x: e.clientX, y: e.clientY }; unstickLater(); }
}, true);

app.addEventListener('click', (e) => {
  if (busy || transitioning) return;
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || el.hasAttribute('disabled')) return;
  const act = el.dataset.act;
  const s = S;
  // 其他動作的結果出現時,上一件事的「一般來說」說明就不該再掛在畫面上
  if (act && ['report-pick', 'scout-pick', 'scout-skip', 'polish', 'check', 'intel', 'sloppy', 'confirm-plan'].includes(act)) lastInsight = '';
  if (act !== 'end' && endArmed) { endArmed = false; window.clearTimeout(endArmTimer); }

  switch (act) {
    case 'new': clearSave(); startNew(el.dataset.mode as Mode); return;
    case 'continue': if (s) { screen = 'game'; modal = 'none'; render(); } return;
    case 'home': modal = 'none'; resetPlace(); screen = 'start'; if (s?.over) { clearSave(); S = null; } render(); return;
    case 'plan-prev': planStep = Math.max(0, planStep - 1); render(); return;
    case 'plan-next': planStep = Math.min(4, planStep + 1); render(); return;
    case 'plan-leave': void goPlace('desk', resetPlace); return;
    case 'report-pick': {
      if (!s || !reportQuiz) return;
      const res = submitReport(s, reportQuiz, Number(el.dataset.i));
      if (!res.ok) { flash(res.text); return; }
      save(s);
      reportDone = res;
      render();
      return;
    }
    case 'boss-go': {
      const uid = Number(el.dataset.uid);
      if (s) { s.bossIntro = uid; save(s); }
      modal = 'none';
      // 迎戰:直接開始處理這個首領(房間類走進房間,桌面類展開那張卡)
      const it = s?.inbox.find((i) => i.uid === uid);
      const room = it ? sceneRoomFor(EVENTS[it.eventId]) : undefined;
      if (room) { void goPlace(room, () => { dialogUid = uid; dialogResult = false; dialogText = null; }); return; }
      tab = 'inbox'; openUid = uid; render(); scrollToOpenCard(); return;
    }
    case 'boss-result-close': { if (s) { s.bossResult = undefined; save(s); } modal = 'none'; render(); return; }
    case 'open-shop': screen = 'shop'; modal = 'none'; window.scrollTo(0, 0); render(); return;
    case 'ask-buy': buyId = el.dataset.id ?? ''; modal = 'buy'; render(); return;
    case 'cancel-buy': modal = screen === 'game' ? (s?.cardPick ? 'none' : 'none') : 'none'; buyId = ''; render(); return;
    case 'confirm-buy': {
      const r = purchase(shopOf(), buyId);
      if (r.ok) { setShop(r.shop); flash(`🛍️ 已獲得:${r.gain}`); } else flash(r.msg);
      modal = 'none'; buyId = ''; render(); return;
    }
    case 'close-upsell': modal = 'none'; render(); return;
    case 'set-theme': { const id = el.dataset.id ?? ''; const sh = shopOf(); if (!id || sh.owned.includes(id)) { setShop({ ...sh, theme: id }); sceneKey = ''; } render(); return; }
    case 'toggle-pet': { const sh = shopOf(); if (sh.owned.includes('pet_cat')) { setShop({ ...sh, pet: !sh.pet }); sceneKey = ''; } render(); return; }
    case 'toggle-fast': { const sh = shopOf(); if (canFast(sh)) setShop({ ...sh, fast: !sh.fast }); render(); return; }
    case 'reroll': {
      if (!s?.cardPick) return;
      const sh = shopOf();
      const free = monthActive(sh) && (s.rerolls ?? 0) < MONTH_FREE_REROLLS;
      if (!free && sh.tickets <= 0) { modal = 'upsell'; render(); return; }
      if (rerollPick(s)) { if (!free) setShop({ ...sh, tickets: sh.tickets - 1 }); save(s); } else flash('沒有別的候選了');
      render(); return;
    }
    case 'open-persona': modal = 'persona'; render(); return;
    case 'strat-open': modal = 'strats'; render(); return;
    case 'pick-card': if (s && el.dataset.id && pickCard(s, el.dataset.id) === null) { modal = 'none'; save(s); render(); } return;
    case 'scout-open': if (s?.scout) { modal = 'scout'; render(); } return;
    case 'scout-close': modal = 'none'; render(); return;
    case 'scout-pick': case 'scout-skip': {
      if (!s) return;
      const err = pickScout(s, act === 'scout-skip' ? null : el.dataset.id ?? '');
      if (err) { flash(err); return; }
      modal = 'none'; save(s); render();
      flash(resultOf(s.feed[0] ?? ''), 4500);
      return;
    }
    case 'report-done': case 'close-report': modal = 'none'; reportQuiz = null; reportDone = null; render(); return;
    case 'open-menu': modal = 'gamemenu'; render(); return;
    case 'open-rank': modal = 'rank'; render(); return;
    case 'open-settings': modal = 'settings'; render(); return;
    case 'col-manage': modal = 'none'; resetPlace(); screen = 'start'; if (s?.over) { clearSave(); S = null; } colMsg = ''; modal = 'colleague'; render(); return;
    case 'open-colleague': colMsg = ''; modal = 'colleague'; render(); return;
    case 'close-colleague': modal = 'none'; render(); return;
    case 'col-copy': {
      const code = encodeCard(profile.persona ?? {});
      if (code) void navigator.clipboard?.writeText(code).then(() => flash('已複製代碼'), () => flash('複製失敗,請手動選取代碼'));
      return;
    }
    case 'col-add': {
      const raw = (document.getElementById('col-input') as HTMLInputElement | null)?.value ?? '';
      const c = decodeCard(raw);
      const list = profile.colleagues ?? [];
      const norm = raw.toUpperCase().trim();
      if (!c) colMsg = '這段代碼看起來不對,請確認有沒有複製完整。';
      else if (list.length >= colleagueSlots(shopOf())) colMsg = `最多保留 ${colleagueSlots(shopOf())} 張,請先移除一張(商店可擴充欄位)。`;
      else if (list.some((x) => decodeCard(x)?.title === c.title && x.replace(/[^0-9A-Z]/g, '') === norm.replace(/[^0-9A-Z]/g, ''))) colMsg = '這張已經收過了。';
      else { profile = { ...profile, colleagues: [...list, norm], colleagueSel: list.length }; saveProfile(profile); colMsg = `收到了:${c.title}。這局會帶他一起。`; }
      render(); return;
    }
    case 'col-sel': profile = { ...profile, colleagueSel: Number(el.dataset.i) }; saveProfile(profile); render(); return;
    case 'col-del': {
      const i = Number(el.dataset.i);
      const list = (profile.colleagues ?? []).filter((_, k) => k !== i);
      const sel = profile.colleagueSel ?? -1;
      profile = { ...profile, colleagues: list, colleagueSel: sel === i ? -1 : sel > i ? sel - 1 : sel };
      saveProfile(profile); render(); return;
    }
    case 'close-menu': case 'close-rank': case 'close-settings': modal = 'none'; render(); return;
    case 'bf': setButterfly(el.dataset.v as Butterfly); render(); return;
    case 'back': screen = 'start'; modal = 'none'; buyId = ''; render(); return;
    case 'archive': screen = 'archive'; window.scrollTo(0, 0); render(); return;
    case 'buy': {
      const r = buyItem(profile, el.dataset.id ?? '');
      if (r.ok) { profile = r.profile; saveProfile(profile); } else flash(r.msg);
      render(); return;
    }
    case 'curse': { const id = el.dataset.id ?? ''; profile = { ...profile, curse: curseById(id) ? id : undefined }; saveProfile(profile); render(); return; }
    case 'role': { const id = el.dataset.id ?? 'intern'; if (roleById(id) && (profile.unlock ?? []).includes(id)) { profile = { ...profile, role: id }; saveProfile(profile); } render(); return; }
    case 'tab': tab = el.dataset.t as Tab; render(); return;
    case 'toggle': {
      const u = Number(el.dataset.uid);
      const it = s?.inbox.find((i) => i.uid === u);
      const room = it ? sceneRoomFor(EVENTS[it.eventId]) : undefined;
      if (room) { void goPlace(room, () => { dialogUid = u; dialogResult = false; dialogText = null; }); return; }
      // 展開/收合會改變上方卡片的高度:重畫後把被點的那張卡拉回原本的位置,畫面才不會跳
      const head = () => app.querySelector<HTMLElement>(`.mail-head[data-uid="${u}"]`);
      const before = head()?.getBoundingClientRect().top;
      openUid = openUid === u ? -1 : u; render();
      if (openUid === u) {
        // 展開的那一項自動捲到頂部(固定列的下方),直接從頭讀
        scrollToOpenCard();
        return;
      }
      const after = head()?.getBoundingClientRect().top;
      if (before !== undefined && after !== undefined && before !== after) {
        const scroller = app.querySelector('.stage');
        if (scroller) scroller.scrollTop += after - before; else window.scrollBy(0, after - before);
      }
      return;
    }
    case 'dialog-next': {
      const nextIt = place !== 'pantry' && dialogResult && s ? nextRoomEvent(s, place as Room) : undefined;
      const nextRoom = nextIt ? sceneRoomFor(EVENTS[nextIt.eventId]) : undefined;
      if (nextIt && nextRoom === place) { dialogUid = nextIt.uid; dialogResult = false; dialogText = null; render(); return; }
      if (nextIt && nextRoom) { void goPlace(nextRoom, () => { dialogUid = nextIt.uid; dialogResult = false; dialogText = null; }); return; }
      void goPlace('desk', resetPlace);
      return;
    }
    case 'dialog-leave': void goPlace('desk', resetPlace); return;
    case 'mode': modeSel = el.dataset.m as Mode; render(); return;
    case 'open-new': modal = 'newgame'; render(); return;
    case 'close-newgame': modal = 'none'; render(); return;
    case 'start-game': clearSave(); startNew(modeSel); return;
    case 'diff': difficulty = el.dataset.d as Difficulty; render(); return;
    case 'close-modal': modal = 'none'; render(); return;
    case 'open-plan':
      void goPlace('meeting', () => { dialogUid = null; dialogResult = false; dialogText = null; planning = true; planStep = 0; modal = 'none'; });
      return;
    case 'pick': {
      const key = el.dataset.key as keyof PlanSel;
      if (key === 'delay') sel.delay = Number(el.dataset.id);
      else sel[key] = el.dataset.id as never;
      render(); return;
    }
  }
  if (!s || s.over) return;

  if (act === 'confirm-plan') {
    const err = planCampaign(s, sel);
    modal = 'none';
    if (err) flash(err); else { save(s); render(); }
    if (place === 'meeting' && dialogUid === null) void goPlace('desk', resetPlace);
  } else if (act === 'opt') {
    const apply = () => {
      busy = false;
      const picked = s.inbox.find((i) => i.uid === Number(el.dataset.uid));
      // 做法說明講的是「一般來說」:這局的對象比較特別、結果不如預期時,補一句提醒,不要讓玩家以為學錯了
      const chosen = picked ? eventOptions(s, EVENTS[picked.eventId], picked)[Number(el.dataset.i)] : undefined;
      const unusual = picked && chosen ? styleFit(s, EVENTS[picked.eventId], picked, chosen).total < 0 : false;
      const err = chooseOption(s, Number(el.dataset.uid), Number(el.dataset.i));
      if (!err) {
        const base = (picked && EVENTS[picked.eventId]?.insight) || '';
        lastInsight = base ? `一般來說:${base}${unusual ? '(不過這次的對象比較特別,結果和一般情況不太一樣。)' : ''}` : '';
        openUid = null; if (place !== 'desk') dialogResult = true;
      }
      if (err) flash(err); else { save(s); render(); }
      setTimeout(flushPendingClick, 0);
    };
    const card = el.closest('.mail');
    const risky = el.dataset.risky === '1';
    if (card && !reduceMotion && !fastNow() && risky) {
      busy = true;
      el.classList.add('rolling');
      setTimeout(() => card.classList.add('leaving'), 330);
      setTimeout(apply, 560);
    } else if (card && !reduceMotion && !fastNow()) { busy = true; card.classList.add('leaving'); setTimeout(apply, 230); } else apply();
  } else if (act === 'report') {
    if (s.pendingReports <= 0) return;
    reportQuiz = makeReport(s);
    reportDone = null;
    modal = 'report';
    render();
  } else if (act === 'polish' || act === 'check' || act === 'intel' || act === 'sloppy') {
    const err = doAction(s, act as ActionKind);
    if (err) flash(err);
    else if (act === 'intel') { modal = 'scout'; save(s); render(); }
    else { save(s); render(); }
  } else if (act === 'end') {
    const dueToday = s.inbox.filter((i) => i.deadline <= s.day).length;
    if ((s.ap > 0 || dueToday > 0) && !endArmed) {
      // 還有沒做完的事:不跳彈窗,按鈕變成「再按一次」,提示放在上方
      endArmed = true;
      window.clearTimeout(endArmTimer);
      endArmTimer = window.setTimeout(() => { if (endArmed) { endArmed = false; render(); } }, 6000);
      const warn = [s.ap > 0 ? `還有 ${s.ap} 點行動點數沒用` : '', dueToday > 0 ? `${dueToday} 件事今天到期,逾期會被罰` : ''].filter(Boolean);
      flash(`${warn.join(',')}。再按一次結束今天`, 6000);
      return;
    }
    finishDay(s);
  }
});

/** 這局結束時,把經驗與資歷寫進跨局存檔(只結算一次) */
function settleRun(s: State): void {
  if (!s.over || s.award) return;
  const r = computeRunXp(s);
  const fromXp = profile.xp;
  const toXp = fromXp + r.total;
  const lvUp = levelFor(toXp).lv - levelFor(fromXp).lv;
  const before = profile.persona ?? {};
  const pm = mergePersona(before, s.styleUse ?? {});
  const curseMult = curseById(s.curse ?? '')?.mult ?? 1;
  const runCredits = Math.round((r.total + ((s.lv ?? 1) - 1) * 5) * curseMult);
  const creditLines: string[] = [`這局表現:+${runCredits}${curseMult > 1 ? `(挑戰 ×${curseMult})` : ''}`];
  let credits = runCredits;
  if (lvUp > 0) { credits += lvUp * CREDITS_PER_LEVEL; creditLines.push(`升 ${lvUp} 級:+${lvUp * CREDITS_PER_LEVEL}`); }
  const newAch = s.ach.filter((id) => !profile.ach.includes(id));
  for (const id of newAch) { credits += CREDITS_PER_ACH; creditLines.push(`成就「${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}」:+${CREDITS_PER_ACH}`); }
  profile = { ...profile, credits: (profile.credits ?? 0) + credits, persona: pm.next, xp: toXp, runs: profile.runs + 1, ach: [...profile.ach, ...newAch], seen: mergeSeen(profile, s.seen) };
  saveProfile(profile);
  s.award = { credits, curseMult, xp: r.total, lines: r.lines, fromXp, toXp, creditLines, personaLines: pm.lines, firstCard: !personaTitle(before) && !!personaTitle(pm.next) };
}

function finishDay(s: State): void {
  s.feed = [];
  openUid = null;
  tab = 'inbox';
  endArmed = false;
  lastInsight = '';
  clearToasts();
  summary = endDay(s);
  settleRun(s);
  // 沒有額外發生什麼事(只有下班那句話、老闆與信任沒變)的日子,不用再多按一次
  const quiet = !s.over && summary.lines.every((l) => l.startsWith('🌆'))
    && summary.before.boss === summary.boss && summary.before.trust === summary.trust;
  if (quiet) {
    const q = summary;
    summary = null;
    modal = 'none';
    save(s);
    render();
    flash(`第 ${q.day} 天平安結束:玩家 ${fmt(q.before.players)} → ${fmt(q.players)}`, 2200);
    return;
  }
  modal = 'summary';
  save(s);
  render();
}

document.body.classList.add('scene-mode');
render();
