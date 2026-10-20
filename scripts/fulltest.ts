// 完整檢查:內容資料是否自洽、遊戲邏輯在大量隨機對局下不會壞掉
import {
  CONTENT, DIFFS, ENDING_STYLES, PHASES, STORY_DAYS, EVENTS, HABITS, chooseOption, doAction, endDay, eventOptions, goalMet, load, endingStyle, makeReport, newGame, optionCost, planCampaign, spendToday, submitReport,
} from '../src/engine';
import { SKILLS, prereqMet } from '../src/skills';
import { LEVELS, mergeSeen } from '../src/profile';
import variants from '../src/content/variants.json';
import optLabels from '../src/content/optlabels.json';
import extra from '../src/content/extraOptions.json';
import type { Difficulty, EventKind, Mode, State } from '../src/types';

let failures = 0;
const fail = (msg: string) => { failures++; console.log('✗', msg); };
const KINDS: EventKind[] = ['老闆', '原廠', '技術', '客訴', '輿情', '數據', '雜務', '插曲'];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/* ---------- 1. 內容資料 ---------- */
const ids = new Set<string>();
for (const e of Object.values(EVENTS)) {
  if (ids.has(e.id)) fail(`事件 id 重複:${e.id}`);
  ids.add(e.id);
  if (!KINDS.includes(e.kind)) fail(`${e.id} 的種類不合法:${e.kind}`);
  if (!e.title || !e.body || !e.from) fail(`${e.id} 缺少標題、內容或來源`);
  if (!(e.deadline >= 1)) fail(`${e.id} 期限不合法`);
  if (e.kind !== '插曲' && !e.insight?.trim()) fail(`${e.id} 沒有做法說明(insight)`);
  if (e.insight) {
    if (e.insight.length > 80) fail(`${e.id} 的說明太長:${e.insight.length} 字`);
    // 說明只寫做法;沒有出處的數據與「研究顯示」一類的說法一律不放
    if (/[0-9]+\s*%|[0-9]+\s*倍|研究顯示|調查顯示|統計顯示|數據顯示|根據.{0,8}(報告|研究|調查)/.test(e.insight)) fail(`${e.id} 的說明含有數據或出處類說法:${e.insight}`);
  }
  for (const p of e.phase ?? []) if (!(p in PHASES)) fail(`${e.id} 的階段不合法:${p}`);
  if ((e.weight ?? 0) > 0 && !e.phase?.length) fail(`${e.id} 在隨機事件池裡,但沒有標階段`);
  if (!e.options.length) fail(`${e.id} 沒有選項`);
  for (const [i, o] of e.options.entries()) {
    if (!o.label) fail(`${e.id} 選項 ${i} 沒有文字`);
    if (!(o.ap >= 0 && o.ap <= 6)) fail(`${e.id} 選項 ${i} 點數不合理:${o.ap}`);
    const total = sum(o.outcomes.map((x) => x.p));
    if (Math.abs(total - 1) > 0.001) fail(`${e.id} 選項 ${i} 機率加總 ${total.toFixed(3)} ≠ 1`);
    for (const out of o.outcomes) {
      if (!out.result) fail(`${e.id} 選項 ${i} 有結果沒文字`);
      if (out.followUp && !EVENTS[out.followUp.eventId]) fail(`${e.id} 選項 ${i} 連到不存在的事件 ${out.followUp.eventId}`);
      for (const k of Object.keys(out.habit ?? {})) if (!HABITS[k]) fail(`${e.id} 用了未定義的習慣 ${k}`);
      if (out.reveal && !['reward', 'hated', 'boss', 'community'].includes(out.reveal)) fail(`${e.id} reveal 不合法`);
    }
  }
  for (const k of Object.keys(e.ignore.habit ?? {})) if (!HABITS[k]) fail(`${e.id} ignore 用了未定義的習慣 ${k}`);
  if (e.colleague && (e.weight ?? 0) > 0) fail(`${e.id} 是同事專屬事件,不該進一般隨機池`);
  if (e.colStyle && !e.colleague) fail(`${e.id} 有指定風格卻沒標同事專屬`);
  if (e.trigger && !HABITS[e.trigger.habit]) fail(`${e.id} 的觸發習慣不存在:${e.trigger.habit}`);
  if (e.trigger && !e.hint) fail(`${e.id} 是連鎖事件但沒有因果說明`);
}
// 每個習慣是否至少有一個連鎖事件在等它(正面或負面都應該有後續)
const triggered = new Set(Object.values(EVENTS).filter((e) => e.trigger).map((e) => e.trigger!.habit));
for (const h of Object.keys(HABITS)) if (!triggered.has(h)) console.log(`  (提醒)習慣「${h}」沒有對應的連鎖事件`);
// 每個「當天連帶」事件至少被某個選項引用
const refs = new Set<string>();
for (const e of Object.values(EVENTS)) for (const o of e.options) for (const x of o.outcomes) if (x.followUp) refs.add(x.followUp.eventId);
for (const e of Object.values(EVENTS)) if (e.id.startsWith('r_') && !refs.has(e.id)) fail(`連帶事件 ${e.id} 沒有被任何選項引用`);

for (const [g, list] of Object.entries(CONTENT) as [string, { id: string; name: string; desc: string; minLevel?: number }[]][]) {
  const seen = new Set<string>();
  for (const it of list) {
    if (seen.has(it.id)) fail(`${g} id 重複:${it.id}`);
    seen.add(it.id);
    if (!it.name || !it.desc) fail(`${g}/${it.id} 缺文字`);
    if ((it.minLevel ?? 1) > LEVELS.length) fail(`${g}/${it.id} 職級門檻超過最高職級`);
  }
  if (!list.some((x) => (x.minLevel ?? 1) === 1)) fail(`${g} 沒有 Lv1 就能用的項目`);
}
for (const k of SKILLS) {
  for (const r of [...(k.requires ?? []), ...(k.requiresAny ?? [])]) if (!SKILLS.some((x) => x.id === r)) fail(`技能 ${k.id} 前置不存在:${r}`);
  if (k.tier > 1 && !k.requires && !k.requiresAny) fail(`技能 ${k.id} 不是起點卻沒有前置`);
  if (k.tier === 1 && !prereqMet(k, [])) fail(`起點技能 ${k.id} 不應有前置`);
}
if (LEVELS.some((l, i) => i > 0 && l.xp <= LEVELS[i - 1].xp)) fail('職級經驗門檻沒有遞增');
// 變體文字、選項措辭、額外選項:id 與選項數量要對得上,機率要加總為 1
for (const [id, alts] of Object.entries(variants as Record<string, { title?: string; brief?: string; body?: string }[]>)) {
  if (!EVENTS[id]) fail(`variants 有不存在的事件:${id}`);
  for (const a of alts) if (!a.brief && !a.body) fail(`variants ${id} 有一筆沒有文字`);
}
for (const [id, perOpt] of Object.entries(optLabels as Record<string, string[][]>)) {
  const ev = EVENTS[id];
  if (!ev) { fail(`optlabels 有不存在的事件:${id}`); continue; }
  if (perOpt.length !== ev.options.length) fail(`optlabels ${id} 選項數量 ${perOpt.length} ≠ ${ev.options.length}`);
  perOpt.forEach((alts, i) => alts.forEach((l) => { if (ev.options.some((o) => o.label === l)) fail(`optlabels ${id} 選項 ${i} 的變體和原文相同:${l}`); }));
}
for (const [kind, opts] of Object.entries(extra.pools as Record<string, { label: string; outcomes: { p: number }[] }[]>)) {
  if (!KINDS.includes(kind as EventKind)) fail(`extraOptions 種類不合法:${kind}`);
  for (const o of opts) if (Math.abs(sum(o.outcomes.map((x) => x.p)) - 1) > 0.001) fail(`extraOptions ${kind}/${o.label} 機率加總 ≠ 1`);
}
console.log(`內容檢查:${ids.size} 個事件、${SKILLS.length} 個技能、${LEVELS.length} 個職級`);

/* ---------- 2. 大量隨機對局的不變量 ---------- */
function checkState(s: State, where: string): void {
  const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
  if (!inRange(s.retention, 0, 100)) fail(`${where} 留存超出範圍 ${s.retention}`);
  if (!inRange(s.trust, 0, 100)) fail(`${where} 信任超出範圍 ${s.trust}`);
  if (!inRange(s.boss, 0, 100)) fail(`${where} 老闆滿意超出範圍 ${s.boss}`);
  if (!Number.isFinite(s.players) || s.players < 0) fail(`${where} 玩家人數不合法 ${s.players}`);
  if (!inRange(s.ap, 0, s.maxAp)) fail(`${where} 行動點數不合法 ${s.ap}/${s.maxAp}`);
  if (s.pendingReports < 0) fail(`${where} 待填日報為負`);
  const uids = s.inbox.map((i) => i.uid);
  if (new Set(uids).size !== uids.length) fail(`${where} 收件匣 uid 重複`);
  const evs = s.inbox.map((i) => i.eventId);
  if (new Set(evs).size !== evs.length) fail(`${where} 收件匣有重複事件`);
  for (const it of s.inbox) if (!EVENTS[it.eventId]) fail(`${where} 收件匣有不存在的事件 ${it.eventId}`);
  if (!Number.isFinite(spendToday(s))) fail(`${where} 營收不是數字`);
  if (s.habits && Object.values(s.habits).some((v) => v < 0 || !Number.isFinite(v))) fail(`${where} 習慣數值不合法`);
  JSON.stringify(s); // 要能存檔
}

let games = 0, endings = 0, interludes = 0, chains = 0, reports = 0, anyOver = 0;
const modes: Mode[] = ['story', 'endless'];
const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
const skillSets = [[], ['quick_report', 'soothe', 'auto_report'], SKILLS.map((k) => k.id)];
for (const mode of modes) for (const diff of diffs) for (const level of [1, 3, 5]) for (const skills of skillSets) for (let seed = 1; seed <= 6; seed++) {
  const s = newGame(mode, diff, seed * 977 + level, level, skills);
  games++;
  const cap = mode === 'story' ? 25 : 45;
  for (let step = 0; step < cap && !s.over; step++) {
    const tag = `${mode}/${diff}/Lv${level}/技能${skills.length}/seed${seed}/day${s.day}`;
    checkState(s, tag);
    if (s.day >= 2 && (!s.campaign || s.campaign.phase === 'done') && s.ap >= 3) {
      const err = planCampaign(s, { mechanic: 'signin', reward: 'shard', bundle: 'none', promo: 'none', delay: 1 + (seed % 3) });
      if (err && err !== '行動點數不足') fail(`${tag} 規劃活動失敗:${err}`);
    }
    if (s.campaign?.phase === 'planned') { doAction(s, 'check'); doAction(s, 'polish'); }
    doAction(s, 'intel');
    // 日報
    s.pendingReports = Math.max(s.pendingReports, step % 3);
    if (s.pendingReports > 0 && (s.ap > 0 || skills.includes('auto_report'))) {
      const q = makeReport(s);
      const r = submitReport(s, q, step % q.options.length);
      if (!r.ok) fail(`${tag} 日報交不出去:${r.text}`);
      reports++;
    }
    // 事件:隨機選一個負擔得起的選項(含技能解鎖的)
    for (const it of [...s.inbox]) {
      const opts = eventOptions(s, EVENTS[it.eventId]);
      const ok = opts.map((o, i) => ({ i, c: optionCost(s, it, o) })).filter((x) => x.c <= s.ap);
      if (!ok.length) continue;
      const err = chooseOption(s, it.uid, ok[(step + it.uid) % ok.length].i);
      if (err) fail(`${tag} 選擇失敗:${err}`);
      if (EVENTS[it.eventId].kind === '插曲') interludes++;
      if (s.feed[0]?.includes('🔔')) chains++;
    }
    const sum = endDay(s);
    if (!sum || !Array.isArray(sum.lines)) fail(`${tag} 每日結算異常`);
    if (sum.lines.length && sum.lines.some((l) => typeof l !== 'string' || !l.trim())) fail(`${tag} 結算有空白行`);
    if (!sum.lines.some((l) => l.startsWith('🌆'))) fail(`${tag} 結算缺少「下班前」一句`);
    if (!s.dayLine) fail(`${tag} 缺少每日開場句`);
  }
  const ms = s.moments ?? [];
  if (ms.length > 40) fail(`${diff} seed${seed} 難忘時刻超過 40 筆:${ms.length}`);
  for (const m of ms) {
    if (!m.icon || !m.text.trim() || !(m.w > 0) || !(m.day >= 1)) fail(`${diff} seed${seed} 難忘時刻格式不對:${JSON.stringify(m)}`);
    if (/「「|」」」/.test(m.text.replace(/「[^「」]*「[^「」]*」[^「」]*」/g, ''))) fail(`難忘時刻引號重複:${m.text}`);
  }
  if (s.over) { endings++; anyOver += s.award ? 1 : 0; if (!s.over.title) fail('結局沒有標題'); }
  if (mode === 'story' && !s.over && s.day <= STORY_DAYS) fail(`劇情模式 ${diff} seed${seed} 跑 25 步還沒結束,卡在第 ${s.day} 天`);
  checkState(s, '結束');
  void goalMet;
}
console.log(`對局檢查:${games} 局、${endings} 局到結局、玩了 ${interludes} 次插曲、${chains} 次選擇引出新事件、${reports} 份日報`);

/* ---------- 3. 存檔往返 ---------- */
{
  const s = newGame('story', 'normal', 42, 3, ['soothe']);
  for (let i = 0; i < 6; i++) endDay(s);
  const back = JSON.parse(JSON.stringify(s)) as State;
  for (let i = 0; i < 5; i++) { endDay(s); endDay(back); }
  if (JSON.stringify(s) !== JSON.stringify(back)) fail('存檔讀回後,接下來的演算結果不一致(隨機種子沒存好?)');
  else console.log('存檔往返:讀回後繼續遊戲,結果與不存檔完全一致');
}
/* ---------- 3.4 結局資料與風格 ---------- */
{
  const seenHabits = new Set<string>();
  for (const [id, st] of Object.entries(ENDING_STYLES)) {
    if (!st.name || !st.good.trim() || !st.rough.trim()) fail(`結局風格 ${id} 缺文字`);
    if (!st.habits.length) fail(`結局風格 ${id} 沒有對應的習慣`);
    for (const h of st.habits) {
      if (h === 'procrastinate' || h === 'late_reports') fail(`風格 ${id} 不該用系統自動累積的習慣:${h}`);
      if (!(h in HABITS)) fail(`結局風格 ${id} 的習慣不存在:${h}`);
      if (seenHabits.has(h)) fail(`習慣 ${h} 同時屬於兩種風格`);
      seenHabits.add(h);
    }
  }
  // 累計最多的風格決定結局;太少或並列都不下定論
  const mkEnd = (totals: Record<string, number>, good: boolean) => { const s = newGame('story', 'normal', 5, 1, []); s.styleTotals = totals; return endingStyle(s, good); };
  const a = mkEnd({ transparency: 4, blame: 1 }, true);
  if (a?.name !== '公開透明派' || a.text !== ENDING_STYLES.transparent.good) fail(`風格判斷不對:${JSON.stringify(a)}`);
  if (mkEnd({ transparency: 4 }, false)?.text !== ENDING_STYLES.transparent.rough) fail('結局不好時應該用 rough 的說法');
  if (mkEnd({ transparency: 1 }, true)) fail('次數不到門檻不該下定論');
  if (mkEnd({ transparency: 3, pushback: 3 }, true)) fail('並列第一不該下定論');
  if (mkEnd({ overtime: 2, rushed: 2 }, true)?.name !== '拚命三郎派') fail('同一種風格的多個習慣沒有加總');
  // 實際對局:全部標題都能產生,且風格欄位格式正確
  const got = new Set<string>(); let styled = 0, ended = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = newGame('story', 'normal', seed, 3, []);
    while (!s.over) {
      let n = 0;
      for (const it of [...s.inbox]) { if (n++ >= 2 + (seed % 3)) break; for (let o = 0; o < EVENTS[it.eventId].options.length; o++) if (chooseOption(s, it.uid, o) === null) break; }
      endDay(s);
    }
    ended++; got.add(s.over.title);
    if (s.over.style) { styled++; if (!s.over.style.name || !s.over.style.text) fail('結局風格格式不對'); }
  }
  console.log(`結局:200 局出現 ${got.size} 種結局、${styled}/${ended} 局有風格說明`);
}

/* ---------- 3.5 跨局新鮮度 ---------- */
{
  const poolIds = Object.values(EVENTS).filter((e) => (e.weight ?? 0) > 0 && (e.minLevel ?? 1) <= 5).map((e) => e.id);
  const fresh = poolIds.slice(0, 6);
  const past = Object.fromEntries(poolIds.filter((id) => !fresh.includes(id)).map((id) => [id, 4]));
  const firstDays = (pastSeen: Record<string, number>): number => {
    let hit = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = newGame('story', 'normal', seed, 5, [], pastSeen);
      for (let d = 0; d < 5; d++) endDay(s);
      hit += fresh.filter((id) => (s.seen[id] ?? 0) > 0).length;
    }
    return hit / 60;
  };
  const base = firstDays({}), withPast = firstDays(past);
  if (!(withPast > base + 1)) fail(`跨局新鮮度沒有讓沒看過的事件更早出現:${base.toFixed(2)} → ${withPast.toFixed(2)}`);
  else console.log(`跨局新鮮度:前 5 天出現 ${fresh.length} 個沒看過的事件 ${base.toFixed(2)} → ${withPast.toFixed(2)} 個`);
  // 同一局內仍然「抽完一輪才重複」:有足夠事件時,10 天內同一個隨機事件不該重複出現
  let dup = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame('story', 'normal', seed, 5, [], past);
    for (let d = 0; d < STORY_DAYS; d++) endDay(s);
    dup += Object.entries(s.seen).filter(([id, n]) => n > 1 && (EVENTS[id]?.weight ?? 0) > 0).length;
  }
  if (dup > 0) fail(`有 ${dup} 次在同一局內重複抽到同一個隨機事件,跨局偏好不該破壞單局不重複`);
  // 職級資料:累計、上限與竄改檢查
  const merged = mergeSeen({ v: 1, xp: 0, runs: 0, sp: 0, skills: [], ach: [], seen: { a: 98, b: 1 } }, { a: 5, c: 2 });
  if (merged.a !== 99 || merged.b !== 1 || merged.c !== 2) fail(`跨局累計不對:${JSON.stringify(merged)}`);
}
void DIFFS;

if (failures > 0) throw new Error(`${failures} 項失敗`);
console.log('\n✅ 全部通過');

/* ---------- 存檔竄改防護 ---------- */
{
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  };
  const base = newGame('story', 'normal', 7, 1, []);
  const evil = JSON.parse(JSON.stringify(base));
  evil.dayLine = '<img src=x onerror=alert(1)>';
  evil.log = [{ day: 1, text: '<script>alert(1)</script>' }, 'bad', null];
  evil.inbox.push({ uid: 99, eventId: '__proto__', arrived: 1, deadline: 1 });
  evil.players = 'NaN'; evil.ap = 9999; evil.skills = ['<b>', 'quick_report'];
  evil.over = { title: '"><svg onload=1>', body: 'x' };
  mem.set(Array.from(mem.keys())[0] ?? 'ops-game-save-v1', '');
  mem.set('ops-game-save-v1', JSON.stringify(evil));
  const got = load();
  if (!got) throw new Error('竄改存檔應被清理後讀回,不是拒絕');
  const dump = JSON.stringify(got);
  if (/[<>]/.test(dump.replace(/\\u003c|\\u003e/g, ''))) throw new Error('清理後仍含角括號');
  if (!Number.isFinite(got.players) || got.ap > 12) throw new Error('數值未被限制');
  if (got.inbox.some((i: { eventId: string }) => i.eventId === '__proto__')) throw new Error('未知事件未被移除');
  mem.set('ops-game-save-v1', '{"v":1,"mode":"x"}');
  if (load() !== null) throw new Error('結構錯誤的存檔應被拒絕');
  console.log('存檔竄改防護:通過');
}
