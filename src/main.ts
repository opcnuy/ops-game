import './style.css';
import { BUFFS, scoutCard } from './scout';
import { CUP_EMPTY, CUP_FULL, CUP_PALETTE, SIREN, SIREN_PALETTE, computeLayout, renderOffice, spriteURL } from './scene/office';
import type { Place } from './scene/office';
import { ROOMS, renderRoom } from './scene/rooms';
import type { Room } from './scene/rooms';
import { createFadeCanvas, dissolve } from './scene/fade';
import { storageKey } from './storage';
import {
  CAMPAIGN_TARGET, CONTENT, DIFFS, activeBuffs, pickScout, pulseActive, pulseHint, EVENTS, computeRunXp, PHASES, phaseOf, GOAL_INFO, STORY_DAYS, chooseOption, clearSave, doAction, endDay,
  HABITS, find, goalMet, goalValue, hasSkill, makeReport, submitReport, itemOptions, eventText, load, newGame, optionCost, planCampaign, planCost, save, spendToday, weekdayLabel,
} from './engine';
import type { ActionKind, ReportQuiz } from './engine';
import { LEVELS, SP_PER_LEVEL, availableSp, levelFor, loadProfile, mergeSeen, nextLevel, saveProfile } from './profile';
import { ACHIEVEMENTS, LINES, SKILLS, prereqMet, prereqText, sanitizeSkills, skillById } from './skills';
import type { Skill } from './skills';
import type { SkillLine } from './skills';
import type { DaySummary, Difficulty, EventKind, EventOption, GameEvent, Goal, InboxItem, Mode, PlanSel, State } from './types';

const app = document.getElementById('app') as HTMLDivElement;

let S: State | null = load();
let profile = loadProfile();
let screen: 'start' | 'game' | 'skills' = 'start';
type ModalKind = 'none' | 'planner' | 'summary' | 'intro' | 'settings' | 'gamemenu' | 'report' | 'rank' | 'scout';
let modal: ModalKind = 'none';
let summary: DaySummary | null = null;
let toast = '';
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
const ROOM_OF_KIND: Partial<Record<EventKind, Room>> = { 老闆: 'boss', 原廠: 'meeting' };
const sceneRoomFor = (ev: { kind: EventKind }): Room | undefined => (sceneOn() ? ROOM_OF_KIND[ev.kind] : undefined);
function resetPlace(): void { planning = false; planStep = 0; notebookOpen = false; place = 'desk'; dialogUid = null; dialogResult = false; dialogText = null; }
let selSkill: string | null = null;
let notebookOpen = false;
let lastNb = false;
let nbTab: 'log' | 'skills' = 'log';

type Butterfly = 'auto' | 'on' | 'off';
type UiMode = 'scene' | 'simple';
const SETTINGS_KEY = storageKey('ops-game-settings');
const loadedSettings = (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { butterfly?: string; uiMode?: string }; } catch { return {}; }
})();
let butterfly: Butterfly = loadedSettings.butterfly === 'on' || loadedSettings.butterfly === 'off' ? loadedSettings.butterfly : 'auto';
let uiMode: UiMode = loadedSettings.uiMode === 'simple' ? 'simple' : 'scene';
/** 視窗太矮時(例如手機橫放),場景版放不下內容,自動改用簡易版面;設定本身不變 */
const MIN_SCENE_H = 520;
function sceneOn(): boolean { return uiMode === 'scene' && window.innerHeight >= MIN_SCENE_H; }
let lastSceneOn = false;
function saveSettings(): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ butterfly, uiMode })); } catch { /* 略過 */ }
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

function metric(key: keyof typeof TIPS, label: string, num: number, digits: number, suffix: string, delta: string, bar?: number): string {
  const cls = delta.startsWith('+') ? 'up' : delta.startsWith('-') ? 'down' : '';
  const w = Math.max(0, Math.min(100, bar ?? 0));
  return `<div class="metric"><span class="label" title="${TIPS[key]}">${METRIC_ICON[key]} ${label}</span>
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

function renderProfile(): string {
  const cur = levelFor(profile.xp);
  return `<div class="profile"><button class="pt" data-act="open-rank" title="看職級詳情"><b>${cur.title}</b><span>Lv ${cur.lv} ›</span></button>
    <div class="xpbar"><span style="--to:${xpPercent(profile.xp)}%"></span></div>
    <small>${nextHint()} · 已完成 ${profile.runs} 局</small>
    <button class="skills-btn" data-act="skills">${sceneOn() ? '📓 技能筆記本' : '🧠 技能'}${availableSp(profile) > 0 ? ` <em>${availableSp(profile)} 點可用</em>` : ` <small>已學 ${profile.skills.length} 個</small>`}</button></div>`;
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
    <p class="scout-intro">你翻完論壇和社群,冒出了 ${sc.cards.length} 件事。<b>今天只顧得了一件</b>,選一件去處理,其他的就讓它過去,處理完才知道結果。</p>
    ${sc.found ? `<p class="scout-found">🔎 ${esc(sc.found)}</p>` : ''}
    <div class="scout-cards">${cards}</div>
    <div class="actions"><button data-act="scout-skip">都先不處理</button></div>
    <details class="scout-notes"><summary>今日概況</summary><ul>${notes.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></details>
    <p class="muted report-foot">沒選的話,這份報告明天就過期了。</p>
  </div></div>`;
}

function renderReport(s: State): string {
  const q = reportQuiz;
  if (!q) return '';
  const free = hasSkill(s, 'auto_report');
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
      ${uiMode === 'scene'
        ? '<button data-act="ui-mode" data-m="simple">🗒️ 切換成簡易畫面</button>'
        : '<button data-act="ui-mode" data-m="scene">🏢 切換成場景畫面</button>'}
      <button data-act="home">🏠 回主頁(進度會保留)</button>
    </div>
    <div class="actions"><button class="primary" data-act="close-menu">繼續遊戲</button></div>
  </div></div>`;
}

const nextHint = (): string => {
  const nxt = nextLevel(profile.xp);
  return nxt ? `再 ${nxt.xp - profile.xp} 經驗升為「${nxt.title}」` : '已達最高職級';
};

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
    <p class="muted">每局結束依表現獲得經驗;難度越高,經驗倍率越大。升級可得技能點。</p>
    <div class="actions"><button class="primary" data-act="close-rank">關閉</button></div>
  </div></div>`;
}

/** 主頁可開的彈窗(設定、職級詳情) */
const START_MODALS: ModalKind[] = ['settings', 'rank'];
function renderStartModal(): string {
  return modal === 'settings' ? renderSettings() : modal === 'rank' ? renderRank() : '';
}

function renderSettings(): string {
  const seg = <T extends string>(items: [T, string][], cur: T, act: string, attr: string) =>
    `<div class="seg">${items.map(([v, l]) => `<button class="${cur === v ? 'sel' : ''}" data-act="${act}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="modal-bg"><div class="modal settings-modal">
    <div class="modal-head"><h2>⚙️ 設定</h2><button class="x" data-act="close-settings" aria-label="關閉">✕</button></div>
    <div class="set-row"><div class="set-text"><b>畫面</b><p class="muted">場景:像素辦公室。簡易:清單式介面,比較輕量。</p></div>
      ${seg<UiMode>([['scene', '場景'], ['simple', '簡易']], uiMode, 'ui-mode', 'm')}</div>
    <div class="set-row"><div class="set-text"><b>因果提示</b><p class="muted">顯示「為什麼會發生這件事」與選項影響預告。自動:簡單、普通顯示,困難隱藏。</p></div>
      ${seg<Butterfly>([['auto', '自動'], ['on', '顯示'], ['off', '隱藏']], butterfly, 'bf', 'v')}</div>
    <div class="actions"><button class="primary" data-act="close-settings">完成</button></div>
  </div></div>`;
}

/** 場景版主頁:選單放在螢幕上,職級是牆上的工牌,按鍵在桌面 */
function renderStartScene(): string {
  const has = S && !S.over;
  const cur = levelFor(profile.xp);
  const stars: Record<Difficulty, string> = { easy: '⭐', normal: '⭐⭐', hard: '⭐⭐⭐' };
  const brief = (d: Difficulty) => `${DIFFS[d].goals.length} 個目標<small>${DIFFS[d].maxAp < 6 ? '每天少 1 點' : '&nbsp;'}</small>`;
  const modes: [Mode, string, string, string][] = [
    ['story', '📖', '劇情模式', '10 天試用期,達標才能轉正'],
    ['endless', '♾️', '無限模式', '每 10 天考核,撐越久越好'],
  ];
  const sp = availableSp(profile);
  return `<div class="scene-ui start-scene">
    <div class="wall-ui">
      <div class="wall-left"><button class="cal badge" data-act="open-rank" title="${nextHint()}(點開看職級詳情)">
        <span>${cur.title}</span><b>Lv ${cur.lv}</b><div class="xpbar mini"><span style="--to:${xpPercent(profile.xp)}%"></span></div></button></div>
      <div class="wall-mid"></div>
      <div class="wall-right"><div class="wall-btns">${versionTag()}<button class="ghost" data-act="open-settings">⚙️ 設定</button></div></div>
    </div>
    <div class="screen-ui menu">
      <div class="menu-title">營運日常<small>當一天遊戲營運,看你撐不撐得過試用期</small></div>
      <div class="menu-body">
        <div class="menu-step"><h4><span class="num">1</span> 模式</h4>
          <div class="pick2">${modes.map(([m, icon, name, desc]) =>
            `<button class="diff ${m === modeSel ? 'sel' : ''}" data-act="mode" data-m="${m}"><span class="big">${icon}</span><span class="dt"><b>${name}</b><span>${desc}</span></span></button>`).join('')}</div></div>
        <div class="menu-step"><h4><span class="num">2</span> 難度 <small>兩種模式通用</small></h4>
          <div class="diffs">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) =>
            `<button class="diff ${d === difficulty ? 'sel' : ''}" data-act="diff" data-d="${d}"><span class="big">${stars[d]}</span><b>${DIFFS[d].label}</b><span>${brief(d)}</span></button>`).join('')}</div></div>
        <p class="menu-foot">所有遊戲、角色與數字皆為虛構</p>
      </div>
    </div>
    <div class="desk-ui" style="grid-template-columns: ${has ? '1fr 1fr 1.7fr' : '1fr 1.7fr'}">
      ${has ? `<button data-act="continue"><span>▶ 繼續</span><span class="cost">第 ${Math.ceil(S!.day / 5)} 週</span></button>` : ''}
      <button data-act="skills"><span>📓 技能</span><span class="cost">${sp > 0 ? `${sp} 點可用` : `已學 ${profile.skills.length}`}</span></button>
      <button class="primary" data-act="start-game"><span>${has ? '開始新遊戲' : '開始遊戲'} ▶</span><span class="cost">${modeSel === 'story' ? '劇情' : '無限'} · ${DIFFS[difficulty].label}</span></button>
    </div>
  </div>${renderStartModal()}`;
}

function renderStart(): string {
  if (sceneOn()) return renderStartScene();
  const has = S && !S.over;
  const modes: [Mode, string, string, string][] = [
    ['story', '📖', '劇情模式', '10 天試用期,達標才能轉正'],
    ['endless', '♾️', '無限模式', '每 10 天考核,撐越久越好'],
  ];
  const stars: Record<Difficulty, string> = { easy: '⭐', normal: '⭐⭐', hard: '⭐⭐⭐' };
  const brief = (d: Difficulty) => `${DIFFS[d].goals.length} 個目標<small>${DIFFS[d].maxAp < 6 ? '每天少 1 點' : '&nbsp;'}</small>`;
  return `<div class="start">${versionTag()}
    <div class="hero"><div class="logo">📱📊🎯</div><h1>營運日常</h1>
      <p class="tagline">當一天遊戲營運,看你撐不撐得過試用期</p></div>
    ${renderProfile()}
    ${has ? `<button class="continue" data-act="continue"><span class="ci">▶️</span><span><b>繼續遊戲</b><small>${S!.mode === 'story' ? '劇情' : '無限'} · ${DIFFS[S!.difficulty].label} · ${weekdayLabel(S!.day)}</small></span></button>` : ''}
    <div class="step"><h3><span class="num">1</span> 模式</h3>
      <div class="pick2">${modes.map(([m, icon, name, desc]) =>
        `<button class="diff ${m === modeSel ? 'sel' : ''}" data-act="mode" data-m="${m}"><span class="big">${icon}</span><b>${name}</b><span>${desc}</span></button>`).join('')}</div></div>
    <div class="step"><h3><span class="num">2</span> 難度 <small class="muted">兩種模式通用</small></h3>
      <div class="diffs">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) =>
        `<button class="diff ${d === difficulty ? 'sel' : ''}" data-act="diff" data-d="${d}"><span class="big">${stars[d]}</span><b>${DIFFS[d].label}</b><span>${brief(d)}</span></button>`).join('')}</div></div>
    <button class="primary start-btn" data-act="start-game">${has ? '開始新遊戲' : '開始遊戲'} ▶<small>${modeSel === 'story' ? '劇情' : '無限'}模式 · ${DIFFS[difficulty].label}</small></button>
    <button class="settings-btn" data-act="open-settings">⚙️ 設定</button>
    <p class="muted foot">所有遊戲、角色與數字皆為虛構</p>
  </div>${renderStartModal()}`;
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

function renderSkillChips(s: State): string {
  if (!s.skills.length) return '';
  return `<div class="card"><h3>🧠 本局技能</h3>${s.skills.map((id) => `<span class="chip good" title="${esc(skillById(id)?.desc ?? '')}">${esc(skillById(id)?.name ?? id)}</span>`).join('')}</div>`;
}

function renderHabits(s: State): string {
  if (!showHints(s.difficulty)) return '';
  const chips = Object.entries(s.habits).filter(([, n]) => n > 0)
    .map(([k, n]) => `<span class="chip ${HABITS[k]?.good ? 'good' : ''}">${HABITS[k]?.label ?? k} ×${n}</span>`).join('');
  return `<div class="card"><h3>🦋 你最近的習慣</h3>${chips || '<span class="muted">目前沒有明顯的習慣。</span>'}
    <p class="muted">日常行為會累積,累積夠了就會引發後續的事。</p></div>`;
}

function renderFeedLine(s: State, line: string): string {
  const [main, note] = line.split('||🦋');
  return `<li>${esc(main)}${note && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(note)}</div>` : ''}</li>`;
}

function renderOptionButtons(s: State, it: InboxItem, ev: GameEvent): string {
  return itemOptions(s, ev, it).map(({ opt: o, index: i }, pos) => {
    const risky = o.outcomes.length > 1;
    const cost = optionCost(s, it, o);
    return `<button data-act="opt" data-uid="${it.uid}" data-i="${i}" ${risky ? 'data-risky="1"' : ''} ${s.ap < cost ? 'disabled' : ''}>
        <span class="lbl">${sceneOn() && place !== 'desk' ? `<i class="kbd">${pos + 1}</i>` : ''}${o.fromSkill ? '✨ ' : ''}${esc(o.label)}</span>
        <span class="cost ${cost > o.ap ? 'up' : cost < o.ap ? 'down' : ''}">${cost ? '⚡'.repeat(cost) : '免費'}</span></button>`;
  }).join('');
}

function renderInbox(s: State): string {
  const sorted = [...s.inbox].sort((a, b) => (b.stage ?? 0) - (a.stage ?? 0) || a.deadline - b.deadline);
  const banner = s.feed[0] ? `<div class="result-note">${renderFeedLine(s, s.feed[0]).replace(/^<li>|<\/li>$/g, '')}${lastInsight ? `<div class="insight">💡 ${esc(lastInsight)}</div>` : ''}</div>` : '';
  const ph = phaseOf(s.day);
  const phaseLine = ph.first ? `<div class="day-line">📌 ${PHASES[ph.key].name}:${esc(PHASES[ph.key].blurb)}</div>` : '';
  const buffs = activeBuffs(s);
  const buffBar = buffs.length ? `<div class="buff-bar">${buffs.map((b) => `<span class="buff" title="${esc(BUFFS[b.id].desc)}">${BUFFS[b.id].icon} ${BUFFS[b.id].name}<small>${b.left} 天</small></span>`).join('')}</div>` : '';
  const dayLine = buffBar + (s.dayLine ? `<div class="day-line">🌤️ ${esc(s.dayLine)}</div>` : '') + phaseLine;
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
      ${it.stage ? '<div class="hint warn">上次沒處理,對方又來催了。這次處理要多花 1 點,再不處理就不了了之。</div>' : ''}
      ${it.hint && !it.stage && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(it.hint)}</div>` : ''}
      ${pulseHint(s, ev, it) ? `<div class="hint pulse">📡 風向:${esc(pulseHint(s, ev, it) ?? '')}</div>` : ''}
      ${tx.brief && tx.brief !== tx.body ? `<details class="more"><summary>詳情</summary><div>${esc(tx.body)}</div></details>` : ''}
      <div class="opts">${opts}</div></div>` : '';
    return `<div class="card mail ${open ? 'open' : ''} ${isNew ? 'enter' : ''} ${it.stage ? 'escalated' : ''}" style="--i:${delay}">
      <button class="mail-head" data-act="toggle" data-uid="${it.uid}" aria-expanded="${open}">
        <span class="k k-${ev.kind}">${KIND_ICON[ev.kind] ?? '📌'}</span>
        <span class="mh"><b>${it.stage ? '🔥 ' : ''}${esc(tx.title)}</b>${open ? '' : `<small>${esc(tx.brief ?? tx.body)}</small>`}</span>
        <span class="due ${left <= 0 ? 'urgent' : ''}">${due}</span>${room ? `<span class="go">🚪 ${ROOMS[room].name}</span>` : `<span class="chev">${open ? '▾' : '▸'}</span>`}
      </button>${detail}</div>`;
  }).join('');
  return `${dayLine}${banner}${rows}`;
}

function renderCampaign(s: State): string {
  const c = s.campaign;
  if (!c || c.phase === 'done') {
    return `<div class="camp-state muted">${c ? '上一檔活動已結束。' : '目前沒有活動。'}老闆期待營收提升 ${Math.round(CAMPAIGN_TARGET * 100)}%。</div>
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
function renderPlanRoom(s: State): string {
  sanitizeSel(s);
  const steps: { key: keyof PlanSel; title: string; items: { id: string; name: string; desc: string; tag?: string; minLevel?: number }[] }[] = [
    { key: 'mechanic', title: '玩法', items: CONTENT.mechanics.map((m) => ({ ...m, tag: `打磨×${m.need}` })) },
    { key: 'reward', title: '獎勵', items: CONTENT.rewards },
    { key: 'bundle', title: '商品', items: CONTENT.bundles },
    { key: 'promo', title: '宣傳', items: CONTENT.promos.map((p) => ({ ...p, tag: p.ap ? `+${p.ap} 點` : '' })) },
    { key: 'delay', title: '時間', items: [
      { id: '1', name: '1 天後上線', desc: '極限趕工,幾乎沒有打磨與驗收的時間。' },
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
  const cost = planCost(sel);
  const summary = last
    ? `<div class="plan-sum">玩法「${find(CONTENT.mechanics, sel.mechanic).name}」・獎勵「${find(CONTENT.rewards, sel.reward).name}」・商品「${find(CONTENT.bundles, sel.bundle).name}」・宣傳「${find(CONTENT.promos, sel.promo).name}」</div>`
    : '';
  const bubbles = planBubbles(planStep).map(([who, text], i) => `<div class="bubble b${i + 1}"><b>${who}</b>${esc(text)}</div>`).join('');
  return `<div class="scene-ui room">
    <div class="room-top"><div class="room-chip">📹 會議室</div></div>
    <div class="bubbles">${bubbles}</div>
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

function renderRoomUI(s: State): string {
  if (place === 'meeting' && planning) return renderPlanRoom(s);
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
    title = tx.title;
    text = tx.brief ?? tx.body;
    const hint = it.stage ? '上次沒處理,對方又來催了。這次處理要多花 1 點。' : it.hint && showHints(s.difficulty) ? `🦋 ${it.hint}` : '';
    const ph = pulseHint(s, ev, it);
    body = `${hint ? `<div class="hint">${esc(hint)}</div>` : ''}${ph ? `<div class="hint pulse">📡 風向:${esc(ph)}</div>` : ''}<div class="opts">${renderOptionButtons(s, it, ev)}</div>`;
  } else if (dialogResult && s.feed[0]) {
    speaker = '結果';
    text = resultOf(s.feed[0]);
    const note = s.feed[0].split('||🦋')[1];
    body = `${note && showHints(s.difficulty) ? `<div class="hint">🦋 ${esc(note)}</div>` : ''}${lastInsight ? `<div class="insight">💡 ${esc(lastInsight)}</div>` : ''}<button class="primary" data-act="dialog-next">${nextLabel}</button>${nextEv ? '<button class="dlg-leave" data-act="dialog-leave">← 先回座位</button>' : ''}`;
  } else {
    text = dialogText ?? '';
    body = '<button class="primary" data-act="dialog-next">▶ 回座位</button>';
  }
  return `<div class="scene-ui room">
    <div class="room-top"><div class="room-chip">${info.icon} ${info.name}</div></div>
    <div class="dialog-ui">
      <div class="dlg-head"><div class="dlg-speaker">${esc(speaker)}</div><div class="cups mini" title="今天能做的事有限">${renderCups(s)}</div></div>
      ${title ? `<div class="dlg-title">${esc(title)}</div>` : ''}
      <div class="dlg-text">${esc(text)}</div>
      ${body}
      ${it && !dialogResult ? '<button class="dlg-leave" data-act="dialog-next">← 先回座位</button>' : ''}
    </div></div>`;
}

function renderGame(s: State): string {
  if (sceneOn() && tab === 'log') tab = 'inbox';
  const prev = s.history[s.history.length - 1];
  const spend = spendToday(s);
  const days = s.mode === 'story' ? `${Math.min(s.day, STORY_DAYS)}/${STORY_DAYS}` : `第 ${s.day} 天`;
  const camp = s.campaign && s.campaign.phase !== 'done';
  const tabs: [Tab, string][] = [
    ['inbox', `📥 收件匣 <em>${s.inbox.length}</em>`],
    ['camp', `🎪 活動${camp ? ' <i class="dot"></i>' : ''}`],
    ['goals', '🎯 目標'],
    ['log', '📜 紀錄'],
  ];
  let body = '';
  if (tab === 'inbox') body = renderInbox(s);
  else if (tab === 'camp') body = `<div class="card"><h3>活動</h3>${renderCampaign(s)}</div>`;
  else if (tab === 'goals') body = `${renderGoals(s)}${renderSkillChips(s)}${renderHabits(s)}
    <details class="card glossary"><summary>名詞小教室</summary><dl>
      <dt>留存率</dt><dd>${TIPS.retention}</dd><dt>日營收</dt><dd>${TIPS.spend}</dd>
      <dt>🔥 再次催辦</dt><dd>逾期沒處理的事,隔天會再來催。處理要多花 1 點,再逾期就不了了之。</dd></dl></details>`;
  else body = renderLog(s);
  const metricsHtml = `
      ${metric('players', '玩家', s.players, 0, '', delta(s.players, prev.players))}
      ${metric('retention', '留存', s.retention, 1, '%', '', s.retention)}
      ${metric('spend', '營收(萬點)', spend, 1, '', delta(spend, prev.spend, 1))}
      ${metric('trust', '信任', s.trust, 0, '', '', s.trust)}
      ${metric('boss', '老闆', s.boss, 0, '', '', s.boss)}`;
  const tabList = sceneOn() ? tabs.filter(([k]) => k !== 'log') : tabs;
  const tabsHtml = tabList.map(([k, label]) => `<button class="${tab === k ? 'sel' : ''}" data-act="tab" data-t="${k}">${label}</button>`).join('')
    + (sceneOn() ? '<button data-act="open-notebook">📓 筆記本</button>' : '');
  const dockHtml = `
    ${s.scout
    ? '<button class="pulse" data-act="scout-open"><span>📡 輿情報告</span><span class="cost">待選</span></button>'
    : `<button data-act="intel" ${s.ap < 1 || s.pulse === s.day ? 'disabled' : ''}><span>💬 看輿情${pulseActive(s) ? ' 📡' : ''}</span><span class="cost">⚡</span></button>`}
    <button data-act="report" ${(!hasSkill(s, 'auto_report') && s.ap < 1) || s.pendingReports <= 0 ? 'disabled' : ''}><span>📝 填日報${s.pendingReports ? ` (${s.pendingReports})` : ''}</span><span class="cost ${hasSkill(s, 'auto_report') ? 'down' : ''}">${hasSkill(s, 'auto_report') ? '免費' : '⚡'}</span></button>
    <button data-act="sloppy" ${s.pendingReports <= 0 ? 'disabled' : ''} title="不花點數,但會留下草率的紀錄"><span>🙈 隨便填</span><span class="cost">免費</span></button>
    <button class="primary end ${s.ap === 0 || !s.inbox.length ? 'pulse' : ''}" data-act="end"><span>${endArmed ? '再按一次結束' : '結束今天 ▶'}</span></button>`;
  if (sceneOn() && place !== 'desk') return renderRoomUI(s);
  if (sceneOn()) {
    const cups = Array.from({ length: s.maxAp }, (_, i) => {
      const spent = prevAp >= 0 && i >= s.ap && i < prevAp;
      const gained = prevAp >= 0 && i < s.ap && i >= prevAp;
      return `<i class="cup ${i < s.ap ? 'on' + (gained ? ' fill' : '') : 'off' + (spent ? ' pop' : '')}"></i>`;
    }).join('');
    const week = Math.ceil(s.day / 5);
    const wd = ['週一', '週二', '週三', '週四', '週五'][(s.day - 1) % 5];
    return `<div class="scene-ui">
      <i class="mug-steam"></i>
      <div class="wall-ui">
        <div class="wall-left"><div class="cal ${prevDay >= 0 && prevDay !== s.day ? 'bump' : ''}"><span>第 ${week} 週</span><b>${wd}</b><small>${days} · ${PHASES[phaseOf(s.day).key].name}</small></div>
          <div class="wall-tools"><button class="menu-btn" data-act="open-menu" aria-label="選單" title="選單">☰</button><i class="beacon" title="有緊急的事"></i></div></div>
        <div class="wall-mid"></div>
        <div class="wall-right"><div class="cups" title="今天能做的事有限,用完就只能下班">${cups}</div></div>
      </div>
      <div class="screen-ui">
        <div class="metrics">${metricsHtml}</div>
        <nav class="tabs">${tabsHtml}</nav>
        <main class="stage">${body}</main>
      </div>
      <div class="desk-ui">${dockHtml}</div>
    </div>`;
  }
  return `
  <div class="game">
  <header class="hud">
    <div class="topbar">
      <div class="day ${prevDay >= 0 && prevDay !== s.day ? 'bump' : ''}">${weekdayLabel(s.day)} <span class="muted">${days} · ${PHASES[phaseOf(s.day).key].name} · ${s.mode === 'story' ? '劇情' : '無限'} · ${DIFFS[s.difficulty].label}</span></div>
      <div class="ap" title="今天能做的事有限,用完就只能結束這一天">
        ${Array.from({ length: s.maxAp }, (_, i) => {
          const spent = prevAp >= 0 && i >= s.ap && i < prevAp;
          const gained = prevAp >= 0 && i < s.ap && i >= prevAp;
          return `<i class="${i < s.ap ? (gained ? 'fill' : '') : 'off' + (spent ? ' pop' : '')}"></i>`;
        }).join('')}
      </div>
      <button class="menu-btn" data-act="open-menu" aria-label="選單">☰ 選單</button>
    </div>
    <div class="metrics">${metricsHtml}</div>
  </header>
  <nav class="tabs">${tabsHtml}</nav>
  <main class="stage">${body}</main>
  <footer class="dock">${dockHtml}</footer>
  </div>`;
}

function choiceGroup(title: string, key: keyof PlanSel, items: { id: string; name: string; desc: string; minLevel?: number }[]): string {
  const lv = S?.level ?? 1;
  return `<div class="group"><h4>${title}</h4><div class="choices">${items.map((it) => {
    const need = it.minLevel ?? 1;
    if (lv < need) {
      return `<button class="choice locked" disabled><b>🔒 ${it.name}</b><span>職級「${LEVELS[need - 1].title}」解鎖</span></button>`;
    }
    return `<button class="choice ${sel[key] === it.id ? 'sel' : ''}" data-act="pick" data-key="${key}" data-id="${it.id}">
      <b>${it.name}</b><span>${it.desc}</span></button>`;
  }).join('')}</div></div>`;
}

function renderPlanner(s: State): string {
  // 目前選的項目如果還沒解鎖,退回第一個可用的
  const groups: [keyof PlanSel, { id: string; minLevel?: number }[]][] = [
    ['mechanic', CONTENT.mechanics], ['reward', CONTENT.rewards], ['bundle', CONTENT.bundles], ['promo', CONTENT.promos],
  ];
  for (const [k, list] of groups) {
    const cur = list.find((x) => x.id === sel[k]);
    if (!cur || (cur.minLevel ?? 1) > s.level) sel[k] = (list.find((x) => (x.minLevel ?? 1) <= s.level) ?? list[0]).id as never;
  }
  const cost = planCost(sel);
  const delays = [
    { id: '1', name: '1 天後上線', desc: '極限趕工,幾乎沒有打磨與驗收的時間。' },
    { id: '2', name: '2 天後上線', desc: '很趕,打磨機會少。' },
    { id: '3', name: '3 天後上線', desc: '標準時程。' },
  ];
  return `<div class="modal-bg"><div class="modal planner">
    <div class="modal-head"><h2>規劃新活動</h2><button class="x" data-act="close-modal" aria-label="關閉">✕</button></div>
    <p class="muted">四個選擇共同決定成績:好不好玩、獎勵吸不吸引、有沒有購買慾、有沒有人知道。<br>先去看看輿情,可能會更有方向。</p>
    ${choiceGroup('玩法', 'mechanic', CONTENT.mechanics.map((m) => ({ ...m, desc: `${m.desc}(需打磨 ${m.need} 次)` })))}
    ${choiceGroup('獎勵', 'reward', CONTENT.rewards)}
    ${choiceGroup('商品', 'bundle', CONTENT.bundles)}
    ${choiceGroup('宣傳', 'promo', CONTENT.promos.map((p) => ({ ...p, desc: `${p.desc}${p.ap ? `(+${p.ap} 點)` : ''}` })))}
    <div class="group"><h4>上線時間</h4><div class="choices">${delays.map((d) =>
      `<button class="choice ${String(sel.delay) === d.id ? 'sel' : ''}" data-act="pick" data-key="delay" data-id="${d.id}"><b>${d.name}</b><span>${d.desc}</span></button>`).join('')}</div></div>
    
    <div class="actions">
      <button data-act="close-modal">取消</button>
      <button class="primary" data-act="confirm-plan" ${s.ap < cost ? 'disabled' : ''}>送出企劃(${cost} 點)</button>
    </div></div></div>`;
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
    ${d.lines.length ? `<hr>${d.lines.map((l) => `<p>${esc(l)}</p>`).join('')}` : '<hr><p class="muted">今天沒有特別的事。這大概是個壞兆頭。</p>'}
    <div class="actions"><button class="primary" data-act="close-modal">進入下一天</button></div>
  </div></div>`;
}

function renderIntro(): string {
  return `<div class="modal-bg"><div class="modal">
    <h2>歡迎上班</h2>
    <p>你是這款遊戲的<b>${LEVELS[S!.level - 1].title}</b>(Lv ${S!.level}・${DIFFS[S!.difficulty].label}難度)。每天有 ${S!.maxAp} 點行動點數,可以用來:</p>
    <p>・處理收件匣的事件(老闆、原廠、玩家都在等你)<br>・規劃並打磨活動<br>・看輿情、填日報</p>
    <p>點數用不完不會累積,事情沒處理也不會消失,只會變成麻煩。<br>注意四個數字:<b>人數、留存、營收、信任</b>,還有老闆的臉色。</p>
    <hr><p><b>${S!.mode === 'story' ? '試用期結束時要達成:' : '第一次考核(第 10 天)要達成:'}</b><br>${S!.goals.map((g) => '・' + goalText(g)).join('<br>')}</p>
    <p class="muted">提示:同樣的選擇,結果不一定一樣。先看輿情能摸清玩家喜好,今明兩天的事件也會先看得出氣氛。</p>
    <div class="actions"><button class="primary" data-act="close-modal">開始第一天</button></div>
  </div></div>`;
}

function renderAward(s: State): string {
  const a = s.award;
  if (!a) return '';
  const from = levelFor(a.fromXp);
  const to = levelFor(a.toXp);
  const nxt = nextLevel(a.toXp);
  const unlocks = LEVELS.filter((l) => l.lv > from.lv && l.lv <= to.lv).flatMap((l) => l.unlocks);
  return `<div class="award"><h3>🏅 職級經驗 +${a.xp}</h3>
    <ul>${a.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="xpbar"><span style="--to:${xpPercent(a.toXp)}%"></span></div>
    <small>${to.title} Lv ${to.lv}${nxt ? ` · 距離「${nxt.title}」還差 ${nxt.xp - a.toXp}` : ' · 最高職級'}</small>
    ${a.sp > 0 ? `<div class="spgain">🧠 技能點 +${a.sp}<ul>${a.spLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    ${to.lv > from.lv ? `<div class="levelup">🎉 升職了!${from.title} → ${to.title}<ul>${unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}</div>`;
}

type NodeState = 'owned' | 'can' | 'poor' | 'locked';

/** 技能畫面的資料來源:主頁是「可編輯」(用跨局職級),遊戲中是「只讀」(用這局帶進來的技能) */
interface SkillCtx { owned: string[]; sp: number; edit: boolean }
const editCtx = (): SkillCtx => ({ owned: profile.skills, sp: availableSp(profile), edit: true });
const viewCtx = (s: State): SkillCtx => ({ owned: s.skills, sp: 0, edit: false });

function nodeState(k: Skill, c: SkillCtx): NodeState {
  if (c.owned.includes(k.id)) return 'owned';
  if (!prereqMet(k, c.owned)) return 'locked';
  return c.edit && c.sp >= k.cost ? 'can' : 'poor';
}

function renderNode(k: Skill, c: SkillCtx): string {
  const st = nodeState(k, c);
  const parents = (k.tier === 1 ? ['root'] : [...(k.requires ?? []), ...(k.requiresAny ?? [])]).join(' ');
  return `<button class="node ${st} ${selSkill === k.id ? 'sel' : ''}" data-act="pick-skill" data-id="${k.id}" data-parents="${parents}" title="${k.name}" aria-label="${k.name}">
    <span class="ni">${st === 'locked' ? '🔒' : k.icon}</span><span class="nc">${st === 'owned' ? '✓' : k.cost}</span></button>`;
}

function renderSkillDetail(c: SkillCtx): string {
  const k = selSkill ? skillById(selSkill) : undefined;
  if (!k) return `<div class="skill-detail"><div class="sd-inner muted">${c.edit ? '點技能看說明,學會上一層才能學下一層。' : '點技能看說明。技能在開局時就固定了。'}</div></div>`;
  const st = nodeState(k, c);
  let action = '';
  let extra = '';
  if (c.edit) {
    if (st === 'owned') action = `<button data-act="unlearn" data-id="${k.id}">取消</button>`;
    else if (st === 'locked') action = '<button disabled>🔒 未解鎖</button>';
    else if (st === 'poor') action = `<button disabled>差 ${k.cost - c.sp} 點</button>`;
    else action = `<button class="primary" data-act="learn" data-id="${k.id}">學習 ${k.cost} 點</button>`;
    if (st === 'owned' && sanitizeSkills(c.owned.filter((x) => x !== k.id)).length < c.owned.length - 1) extra = ' <span class="warn">(連帶取消依賴它的技能)</span>';
    if (st === 'locked') extra = ` <span class="warn">${prereqText(k)}</span>`;
  } else {
    extra = st === 'owned' ? ' <span class="good">✓ 本局已學會</span>' : ' <span class="muted">本局沒有學這個技能</span>';
  }
  return `<div class="skill-detail"><div class="sd-inner">
    <div class="sd-text"><b>${k.icon} ${k.name}</b> <span class="muted">${k.cost} 點</span>
      <div class="sd-desc">${k.desc}${extra}</div></div>${action}</div></div>`;
}

/** 一張技能樹:共同起點 + 三條分支 */
function renderSkillTree(c: SkillCtx): string {
  const lineKeys: SkillLine[] = ['data', 'comm', 'proj'];
  const cols = lineKeys.map((line) => {
    const info = LINES[line];
    const rows = ([1, 2, 3] as const).map((tier) => {
      const ks = SKILLS.filter((k) => k.line === line && k.tier === tier);
      return `<div class="tier cols-${ks.length}">${ks.map((k) => renderNode(k, c)).join('')}</div>`;
    }).join('');
    return `<div class="col"><div class="col-label" title="${info.blurb}">${info.icon} ${info.label}</div>${rows}</div>`;
  }).join('');
  return `<section class="card tree-card cur"><div class="tree tree-all">
      <div class="root-row"><div class="node root owned" data-id="root" title="營運人員"><span class="ni">🧑‍💼</span></div></div>
      <div class="cols">${cols}</div>
    </div></section>`;
}

function renderSkills(): string {
  const c = editCtx();
  const ach = ACHIEVEMENTS.map((a) => `<li>${profile.ach.includes(a.id) ? '✅' : '⬜'} <b>${a.name}</b> <span class="muted">${a.desc}</span></li>`).join('');
  const inner = `
    <header class="skills-head"><button class="ghost" data-act="back">← 返回</button>
      <div class="sp"><b>${c.sp}</b><small>可用點(共 ${profile.sp})</small></div>
      <button data-act="reset-skills" ${profile.skills.length ? '' : 'disabled'}>重置</button></header>
    ${renderSkillTree(c)}
    <details class="card skills-info"><summary>🏅 成就與說明</summary>
      <p class="muted">技能在<b>開始新遊戲</b>時生效,整局固定。重置免費。升一級得 ${SP_PER_LEVEL} 點,每個成就第一次達成得 1 點。</p>
      <ul class="ach">${ach}</ul></details>
    ${renderSkillDetail(c)}`;
  if (sceneOn()) return `<div class="nb-wrap"><div class="notebook"><div class="nb-spiral"></div><div class="nb-body skills-page">${inner}</div></div></div>`;
  return `<div class="game skills-page">${inner}</div>`;
}

/** 遊戲中的筆記本:紀錄與本局技能(只讀) */
function renderNotebookOverlay(s: State): string {
  const page = nbTab === 'log'
    ? `<div class="nb-log">${renderLog(s)}</div>`
    : `${renderSkillTree(viewCtx(s))}${renderSkillDetail(viewCtx(s))}`;
  return `<div class="nb-overlay"><div class="nb-stack">
    <div class="nb-tabs">
      <button class="${nbTab === 'log' ? 'sel' : ''}" data-act="nb-tab" data-t="log">📜 紀錄</button>
      <button class="${nbTab === 'skills' ? 'sel' : ''}" data-act="nb-tab" data-t="skills">🧠 技能</button>
      <button class="nb-close" data-act="close-notebook" aria-label="合上筆記本">✕</button>
    </div>
    <div class="notebook"><div class="nb-spiral"></div><div class="nb-body">${page}</div></div>
  </div></div>`;
}

/** 在技能樹上畫出節點之間的連線(位置依畫面實際排版計算) */
function drawSkillLines(): void {
  document.querySelectorAll<HTMLElement>('.tree').forEach((tree) => {
    tree.querySelector('.tree-lines')?.remove();
    const box = tree.getBoundingClientRect();
    if (box.width === 0) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tree-lines');
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    tree.querySelectorAll<HTMLElement>('.node[data-parents]').forEach((child) => {
      const parents = (child.dataset.parents ?? '').split(' ').filter(Boolean);
      const cr = child.getBoundingClientRect();
      for (const pid of parents) {
        const parent = tree.querySelector<HTMLElement>(`.node[data-id="${pid}"]`);
        if (!parent) continue;
        const pr = parent.getBoundingClientRect();
        const x1 = pr.left + pr.width / 2 - box.left;
        const y1 = pr.bottom - box.top;
        const x2 = cr.left + cr.width / 2 - box.left;
        const y2 = cr.top - box.top;
        const my = (y1 + y2) / 2;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
        const parentOwned = parent.classList.contains('owned');
        const childOwned = child.classList.contains('owned');
        path.setAttribute('class', childOwned && parentOwned ? 'on' : parentOwned ? 'open' : '');
        svg.appendChild(path);
      }
    });
    tree.prepend(svg);
  });
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
    await dissolve(fadeCanvas, 160, 'in');
    place = next;
    apply?.();
    sceneKey = '';
    render();
    await dissolve(fadeCanvas, 240, 'out');
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

function closePlanner(): void {
  modal = 'none';
  if (place === 'meeting' && dialogUid === null) void goPlace('desk', resetPlace);
  else render();
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
  if (s.inbox.some((i) => i.stage) || dueToday >= 3 || s.trust <= 25 || s.boss <= 25) return 2;
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

/** 依目前模式顯示或隱藏場景,並在尺寸或時間改變時重畫 */
function syncScene(): void {
  const inGame = screen === 'game' && !!S;
  const on = sceneOn() && (screen === 'start' || inGame);
  document.body.classList.toggle('scene-mode', on);
  document.body.dataset.tension = on && inGame && S ? String(tensionLevel(S)) : '0';
  if (!on) return;
  sceneVars();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const L = computeLayout(vw, vh);
  // 結算畫面還停在「今天」的傍晚,要按下「進入下一天」才回到早上
  const t = inGame && S && S.maxAp > 0 ? (modal === 'summary' ? 1 : (S.maxAp - S.ap) / S.maxAp) : 0;
  const where: Place = inGame ? place : 'desk';
  // 橫向時牆面右欄很矮:咖啡杯縮成單排;直式空間夠,維持 30px 排兩排
  const cup = L.W > L.H ? Math.max(18, Math.min(28, Math.floor((L.rightW * L.S) / Math.max(1, S?.maxAp ?? 6)))) : 30;
  document.documentElement.style.setProperty('--cup', `${cup}px`);
  document.documentElement.style.setProperty('--cup-wrap', L.W > L.H ? 'nowrap' : 'wrap');
  const crowd = inGame && where === 'meeting' && planning;
  const key = `${vw}x${vh}:${screen}:${where}${crowd ? ':plan' : ''}:${Math.round(t * 100)}`;
  if (key === sceneKey) return;
  const layoutChanged = !sceneKey.startsWith(`${vw}x${vh}:`);
  sceneKey = key;
  if (layoutChanged) {
    const root = document.documentElement.style;
    const px = (n: number) => `${n * L.S}px`;
    root.setProperty('--top-h', px(L.topH));
    root.setProperty('--desk-y', px(L.deskY));
    root.setProperty('--desk-h', px(L.H - L.deskY));
    root.setProperty('--mon-x', px(L.mon.x));
    root.setProperty('--mon-w', px(L.mon.w));
    root.setProperty('--scr-x', px(L.scr.x));
    root.setProperty('--scr-y', px(L.scr.y));
    root.setProperty('--scr-w', px(L.scr.w));
    root.setProperty('--scr-h', px(L.scr.h));
    root.setProperty('--left-w', px(L.leftW));
    root.setProperty('--right-w', px(L.rightW));
    [0.22, 0.5, 0.78].forEach((f, i) => root.setProperty(`--c${i + 1}-x`, px(Math.floor(L.W * f))));
    root.setProperty('--dlg-x', px(L.dlg.x));
    root.setProperty('--dlg-y', px(L.dlg.y));
    root.setProperty('--dlg-w', px(L.dlg.w));
    root.setProperty('--dlg-h', px(L.dlg.h));
    root.setProperty('--S', `${L.S}px`);
    document.body.classList.toggle('has-mug', !!L.mug);
    if (L.mug) { root.setProperty('--mug-x', px(L.mug.x)); root.setProperty('--mug-y', px(L.mug.y)); }
    sceneCanvas.style.width = px(L.W);
    sceneCanvas.style.height = px(L.H);
  }
  if (where === 'desk') renderOffice(sceneCanvas, L, t);
  else renderRoom(sceneCanvas, L, where as Room, t, crowd);
}

let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    sceneKey = '';
    const now = sceneOn();
    if (now !== lastSceneOn) { lastSceneOn = now; resetPlace(); render(); return; }
    syncScene();
  });
});

function render(): void {
  document.body.classList.toggle('scene-mode', sceneOn() && (screen === 'start' || (screen === 'game' && !!S)));
  if (screen === 'skills') {
    const y = window.scrollY;
    app.innerHTML = renderSkills();
    window.scrollTo(0, y);
    lastScreen = 'skills';
    requestAnimationFrame(drawSkillLines);
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
  const shown: State = modal === 'summary' && summary ? { ...s, day: summary.day, ap: 0 } : s;
  let html = renderGame(shown);
  const overShown = !!s.over && modal !== 'summary';
  if (overShown) html += renderOver(s);
  else if (modal === 'planner') html += renderPlanner(s);
  else if (modal === 'summary') html += renderSummary();
  else if (modal === 'intro') html += renderIntro();
  else if (modal === 'gamemenu') html += renderGameMenu();
  else if (modal === 'report') html += renderReport(s);
  else if (modal === 'scout') html += renderScout(s);
  else if (modal === 'settings') html += renderSettings();
  if (notebookOpen && sceneOn() && !s.over) html += renderNotebookOverlay(s);
  if (toast) html += `<div class="toast">${esc(toast)}</div>`;
  const key = overShown ? 'over' : modal;
  // 重繪會把捲動位置歸零,同一個彈窗內操作時要保留
  const prevModal = app.querySelector('.modal') as HTMLElement | null;
  const modalTop = prevModal && key === lastModal ? prevModal.scrollTop : 0;
  const pageY = window.scrollY;
  const stageTop = app.querySelector('.stage')?.scrollTop ?? 0;
  app.innerHTML = html;
  const stage = app.querySelector('.stage');
  if (stage) stage.scrollTop = stageTop;
  const nextModal = app.querySelector('.modal') as HTMLElement | null;
  if (nextModal) nextModal.scrollTop = modalTop;
  window.scrollTo(0, pageY);
  const opening = key !== 'none' && key !== lastModal;
  if (opening) app.querySelector('.modal-bg')?.classList.add('open');
  if (notebookOpen && !lastNb) app.querySelector('.nb-overlay')?.classList.add('open');
  lastNb = notebookOpen;
  lastModal = key;
  if (opening) modalEffects(key, s);
  lastScreen = 'game';
  syncScene();
  animate();
  if (notebookOpen && nbTab === 'skills') requestAnimationFrame(drawSkillLines);
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
    if (card && Math.abs(diff) >= Math.pow(10, -d)) {
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

let toastTimer = 0;
function flash(msg: string | null, ms = 1500): void {
  if (!msg) return;
  toast = msg;
  render();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast = ''; render(); }, ms);
}

/* ---------- 事件 ---------- */

function startNew(mode: Mode): void {
  S = newGame(mode, difficulty, Date.now(), levelFor(profile.xp).lv, profile.skills, profile.seen);
  resetPlace();
  resetMotion();
  openUid = null;
  tab = 'inbox';
  screen = 'game';
  modal = 'intro';
  save(S);
  render();
}

window.addEventListener('resize', () => { if (screen === 'skills') drawSkillLines(); });

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
  else if (e.key === 'Escape' && (START_MODALS.includes(modal) || modal === 'gamemenu')) { modal = 'none'; render(); }
  else if (e.key === 'Escape' && notebookOpen) { notebookOpen = false; render(); }
  else if (e.key === 'Escape' && modal === 'planner') closePlanner();
});

// 動畫或換場期間的點擊(可能落在換場遮罩上):記下位置,結束後補做
document.addEventListener('click', (e) => {
  if (busy || transitioning) pendingClick = { x: e.clientX, y: e.clientY };
}, true);

app.addEventListener('click', (e) => {
  if (busy || transitioning) return;
  if (notebookOpen && (e.target as HTMLElement).classList.contains('nb-overlay')) { notebookOpen = false; render(); return; }
  if (modal === 'planner' && (e.target as HTMLElement).classList.contains('modal-bg')) { closePlanner(); return; }
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || el.hasAttribute('disabled')) return;
  const act = el.dataset.act;
  const s = S;
  if (act !== 'end' && endArmed) { endArmed = false; window.clearTimeout(endArmTimer); }

  switch (act) {
    case 'new': clearSave(); startNew(el.dataset.mode as Mode); return;
    case 'continue': if (s) { screen = 'game'; modal = 'none'; render(); } return;
    case 'home': modal = 'none'; resetPlace(); screen = 'start'; if (s?.over) { clearSave(); S = null; } render(); return;
    case 'ui-mode': if (modal === 'gamemenu') modal = 'none'; uiMode = (el.dataset.m as UiMode) === 'simple' ? 'simple' : 'scene'; resetPlace(); saveSettings(); sceneKey = ''; render(); return;
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
    case 'close-menu': case 'close-rank': case 'close-settings': modal = 'none'; render(); return;
    case 'bf': setButterfly(el.dataset.v as Butterfly); render(); return;
    case 'skills': screen = 'skills'; window.scrollTo(0, 0); render(); return;
    case 'back': screen = 'start'; render(); return;
    case 'open-notebook': notebookOpen = true; nbTab = 'log'; render(); return;
    case 'close-notebook': notebookOpen = false; render(); return;
    case 'nb-tab': nbTab = el.dataset.t === 'skills' ? 'skills' : 'log'; selSkill = null; render(); return;
    case 'pick-skill': selSkill = el.dataset.id ?? null; render(); return;
    case 'learn': {
      const k = skillById(el.dataset.id ?? '');
      if (k && !profile.skills.includes(k.id) && prereqMet(k, profile.skills) && availableSp(profile) >= k.cost) {
        profile = { ...profile, skills: [...profile.skills, k.id] };
        saveProfile(profile);
        render();
        const node = document.querySelector(`.node[data-id="${k.id}"]`);
        if (node) { node.classList.add('learned'); burst(...centerOf(node), ['✨', '⭐', k.icon], 14); }
      }
      return;
    }
    case 'unlearn': {
      profile = { ...profile, skills: sanitizeSkills(profile.skills.filter((x) => x !== el.dataset.id)) };
      saveProfile(profile);
      render(); return;
    }
    case 'reset-skills': profile = { ...profile, skills: [] }; saveProfile(profile); render(); return;
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
    case 'start-game': clearSave(); startNew(modeSel); return;
    case 'diff': difficulty = el.dataset.d as Difficulty; render(); return;
    case 'close-modal': if (modal === 'planner') closePlanner(); else { modal = 'none'; render(); } return;
    case 'open-plan':
      if (sceneOn()) void goPlace('meeting', () => { dialogUid = null; dialogResult = false; dialogText = null; planning = true; planStep = 0; modal = 'none'; });
      else { modal = 'planner'; render(); }
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
      const err = chooseOption(s, Number(el.dataset.uid), Number(el.dataset.i));
      if (!err) { lastInsight = (picked && EVENTS[picked.eventId]?.insight) || ''; openUid = null; if (place !== 'desk') dialogResult = true; }
      if (err) flash(err); else { save(s); render(); }
      setTimeout(flushPendingClick, 0);
    };
    const card = el.closest('.mail');
    const risky = el.dataset.risky === '1';
    if (card && !reduceMotion && risky) {
      busy = true;
      el.classList.add('rolling');
      setTimeout(() => card.classList.add('leaving'), 330);
      setTimeout(apply, 560);
    } else if (card && !reduceMotion) { busy = true; card.classList.add('leaving'); setTimeout(apply, 230); } else apply();
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

/** 這局結束時,把經驗寫進跨局職級(只結算一次) */
function settleRun(s: State): void {
  if (!s.over || s.award) return;
  const r = computeRunXp(s);
  const fromXp = profile.xp;
  const toXp = fromXp + r.total;
  const lvUp = levelFor(toXp).lv - levelFor(fromXp).lv;
  const spLines: string[] = [];
  if (lvUp > 0) spLines.push(`升 ${lvUp} 級:+${lvUp * SP_PER_LEVEL}`);
  const newAch = s.ach.filter((id) => !profile.ach.includes(id));
  for (const id of newAch) spLines.push(`成就「${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}」:+1`);
  const sp = lvUp * SP_PER_LEVEL + newAch.length;
  profile = { ...profile, xp: toXp, runs: profile.runs + 1, sp: profile.sp + sp, ach: [...profile.ach, ...newAch], seen: mergeSeen(profile, s.seen) };
  saveProfile(profile);
  s.award = { xp: r.total, lines: r.lines, fromXp, toXp, sp, spLines };
}

function finishDay(s: State): void {
  s.feed = [];
  openUid = null;
  tab = 'inbox';
  endArmed = false;
  lastInsight = '';
  toast = '';
  window.clearTimeout(toastTimer);
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

lastSceneOn = sceneOn();
render();
