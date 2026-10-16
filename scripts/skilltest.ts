// 技能系統檢查:資料自洽、學習規則、12 個技能各自的實際效果、存檔與職級的技能點帳目
import {
  DIFFS, EVENTS, chooseOption, doAction, endDay, eventOptions, hasSkill, load, makeReport, newGame, optionCost, planCampaign, save, submitReport,
} from '../src/engine';
import { ACHIEVEMENTS, LINES, SKILLS, prereqMet, prereqText, sanitizeSkills, skillById } from '../src/skills';
import { LEVELS, SP_PER_LEVEL, availableSp, levelFor, loadProfile, saveProfile, spentSp } from '../src/profile';
import type { State } from '../src/types';

// Node 沒有 localStorage:用最小替身,讓存檔與職級的讀寫也能一起測
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let failed = 0;
const fail = (msg: string): void => { failed++; console.error('❌ ' + msg); };
const ok = (cond: boolean, msg: string): void => { if (!cond) fail(msg); };
const near = (v: number, target: number, tol: number, msg: string): void => {
  if (Math.abs(v - target) > tol) fail(`${msg}:實測 ${v.toFixed(3)},預期約 ${target}(±${tol})`);
};

const push = (s: State, eventId: string, stage = 0): number => {
  const uid = s.uid++;
  s.inbox.push({ uid, eventId, arrived: s.day, deadline: s.day + 5, stage, v: 12345 });
  return uid;
};
const optIndex = (s: State, eventId: string, label: string): number =>
  eventOptions(s, EVENTS[eventId]).findIndex((o) => o.label === label);

/* ---------- 1. 技能資料 ---------- */
const ids = new Set<string>();
for (const k of SKILLS) {
  ok(!ids.has(k.id), `技能 id 重複:${k.id}`); ids.add(k.id);
  ok(k.cost >= 1 && k.cost <= 3, `${k.id} 花費不合理:${k.cost}`);
  ok(k.cost === k.tier, `${k.id} 花費 ${k.cost} 與層級 ${k.tier} 不一致`);
  ok(!!k.name && !!k.desc && !!k.icon, `${k.id} 缺文字或圖示`);
  ok(k.line in LINES, `${k.id} 的路線不存在:${k.line}`);
  const pre = [...(k.requires ?? []), ...(k.requiresAny ?? [])];
  for (const p of pre) {
    const pk = skillById(p);
    ok(!!pk, `${k.id} 的前置不存在:${p}`);
    if (pk) {
      ok(pk.line === k.line, `${k.id} 的前置 ${p} 不在同一條路線`);
      ok(pk.tier === k.tier - 1, `${k.id} 的前置 ${p} 不是上一層`);
    }
  }
  ok(prereqText(k) === '' ? k.tier === 1 : k.tier > 1, `${k.id} 前置文字與層級不符`);
}
for (const line of Object.keys(LINES)) {
  const mine = SKILLS.filter((k) => k.line === line);
  ok([1, 2, 3].every((t) => mine.some((k) => k.tier === t)), `${line} 路線缺少某一層`);
}
const totalCost = SKILLS.reduce((n, k) => n + k.cost, 0);
const totalSp = (LEVELS.length - 1) * SP_PER_LEVEL + ACHIEVEMENTS.length;
console.log(`技能資料:${SKILLS.length} 個技能、全部學滿要 ${totalCost} 點;升到滿級加上全部成就共 ${totalSp} 點`);
ok(totalSp < totalCost, '技能點足以學滿所有技能,就沒有取捨了');
ok(SKILLS.filter((k) => k.tier === 1).every((k) => k.cost <= SP_PER_LEVEL), 'Lv2 的技能點買不起起點技能');

/* ---------- 2. 學習規則 ---------- */
ok(!prereqMet(skillById('forecast')!, []), '沒學前置也能學預測模型');
ok(!prereqMet(skillById('forecast')!, ['quick_report']), '只學一層前置就能學第三層');
ok(prereqMet(skillById('forecast')!, ['quick_report', 'template']), 'requiresAny 學了其中一個仍不能學');
ok(prereqMet(skillById('forecast')!, ['quick_report', 'data_unify']), 'requiresAny 學了另一個不能學');
ok(sanitizeSkills(['forecast']).length === 0, '沒前置的第三層技能沒被清掉');
ok(sanitizeSkills(['quick_report', 'bogus', 'template']).join() === 'quick_report,template', '不存在的技能沒被過濾');
// 取消起點技能,依賴它的整串一起取消
ok(sanitizeSkills(['quick_report', 'template', 'forecast'].filter((x) => x !== 'quick_report')).length === 0, '取消起點技能沒有連帶取消');
// requiresAny:取消其中一個,另一個還在,第三層應該保留
ok(sanitizeSkills(['quick_report', 'data_unify', 'template', 'forecast'].filter((x) => x !== 'data_unify')).includes('forecast'), '取消其中一條支線卻連帶取消了第三層');
ok(sanitizeSkills(['quick_report', 'data_unify', 'forecast'].filter((x) => x !== 'data_unify')).includes('forecast') === false, '兩條支線都沒了,第三層應該被取消');

/* ---------- 3. 12 個技能的實際效果 ---------- */
const mk = (skills: string[], seed = 1, level = 5): State => newGame('story', 'normal', seed, level, skills);
const rate = (trials: number, run: (seed: number, withSkill: boolean) => boolean, withSkill: boolean): number => {
  let n = 0;
  for (let i = 0; i < trials; i++) if (run(1000 + i, withSkill)) n++;
  return n / trials;
};

// time_mgmt:每天多 1 點(開局、隔天、存檔讀回後都要有)
{
  const a = mk([]); const b = mk(['auto_report', 'risk_ctrl', 'time_mgmt']);
  ok(b.maxAp === a.maxAp + 1 && b.ap === a.ap + 1, `時間管理沒有多 1 點:${a.maxAp}→${b.maxAp}`);
  endDay(b);
  ok(b.ap === b.maxAp && b.maxAp === a.maxAp + 1, '隔天沒有補滿到多 1 點');
  const hard = newGame('story', 'hard', 5, 5, ['time_mgmt']);
  ok(hard.maxAp === DIFFS.hard.maxAp + 1, '困難難度加上時間管理的點數不對');
}

// auto_report:認真填日報不花點數,答題也不花
{
  const a = mk([]); const b = mk(['auto_report']);
  a.pendingReports = b.pendingReports = 3;
  const a0 = a.ap, b0 = b.ap;
  ok(doAction(a, 'report') === null && a.ap === a0 - 1, '沒技能時填日報應該花 1 點');
  ok(doAction(b, 'report') === null && b.ap === b0, '日報自動化後填日報還是花了點數');
  b.ap = 0;
  ok(doAction(b, 'report') === null, '日報自動化後 0 點也應該能填日報');
  b.ap = 3;
  const quiz = makeReport(b);
  const before = b.ap;
  submitReport(b, quiz, 0);
  ok(b.ap === before, '日報自動化後答日報題還是花了點數');
}

// 額外選項:只在對的事件種類出現,沒學就沒有
{
  const cases: [string, string, string, string][] = [
    ['template', 'e_adhoc_chart', '用報表範本快速出表', 'e_server_lag'],
    ['advocate', 'e_gacha_complaint', '請核心玩家出面說明', 'e_tool_broken'],
    ['network', 'e_server_lag', '找熟人幫忙', 'e_gacha_complaint'],
  ];
  for (const [skill, evId, label, otherEv] of cases) {
    const without = mk([]); const withS = mk([skill]);
    ok(optIndex(without, evId, label) < 0, `${skill}:沒學就出現了「${label}」`);
    const idx = optIndex(withS, evId, label);
    ok(idx >= 0, `${skill}:學了卻沒有「${label}」(${evId})`);
    ok(optIndex(withS, otherEv, label) < 0, `${skill}:不相干的事件(${otherEv})也出現了「${label}」`);
    if (idx >= 0) {
      const uid = push(withS, evId);
      ok(chooseOption(withS, uid, idx) === null, `${skill}:額外選項選不下去`);
      ok(!withS.inbox.some((i) => i.uid === uid), `${skill}:選了額外選項,事件沒有被處理掉`);
    }
  }
  // 日報類的 data 事件:報表範本也要在 e_data_dup 出現
  ok(optIndex(mk(['template']), 'e_data_dup', '用報表範本快速出表') >= 0, 'template:對帳事件沒有範本選項');
}

// data_unify:數據類選項花費 >1 的少 1 點,=1 的不變,非數據類不變
{
  const a = mk([]); const b = mk(['data_unify']);
  const costOf = (s: State, evId: string, i: number): number => {
    const uid = push(s, evId); const it = s.inbox.find((x) => x.uid === uid)!;
    return optionCost(s, it, eventOptions(s, EVENTS[evId])[i]);
  };
  ok(costOf(a, 'e_adhoc_chart', 0) === 3 && costOf(b, 'e_adhoc_chart', 0) === 2, '口徑統一:3 點選項應變 2 點');
  ok(costOf(a, 'e_adhoc_chart', 1) === 1 && costOf(b, 'e_adhoc_chart', 1) === 1, '口徑統一:1 點選項不該再減');
  ok(costOf(b, 'e_adhoc_chart', 2) === 0, '口徑統一:0 點選項應維持 0');
  ok(costOf(a, 'e_server_lag', 0) === costOf(b, 'e_server_lag', 0), '口徑統一影響到非數據事件');
}

// crisis_pr:再次催辦的事不用多花 1 點
{
  const a = mk([]); const b = mk(['soothe', 'crisis_pr']);
  const costStage = (s: State, stage: number): number => {
    const uid = push(s, 'e_gacha_complaint', stage); const it = s.inbox.find((x) => x.uid === uid)!;
    return optionCost(s, it, EVENTS['e_gacha_complaint'].options[0]);
  };
  const base = costStage(a, 0);
  ok(costStage(a, 1) === base + 1, '沒有危機公關時,催辦應多 1 點');
  ok(costStage(b, 1) === base, '危機公關沒有抵銷催辦的 1 點');
  const free = EVENTS['e_gacha_complaint'].options.findIndex((o) => o.ap === 0);
  if (free >= 0) ok(optionCost(a, a.inbox.find((i) => i.eventId === 'e_gacha_complaint')!, EVENTS['e_gacha_complaint'].options[free]) === 0, '0 點選項被催辦加成了');
}

// quick_report:「快速」選項的最好結果機率 +0.2
{
  const ev = EVENTS['e_adhoc_chart']; const qi = ev.options.findIndex((o) => o.tag === 'quick');
  const best = ev.options[qi].outcomes.reduce((a, b) => (a.p >= b.p ? a : b));
  const run = (seed: number, w: boolean): boolean => {
    const s = mk(w ? ['quick_report'] : [], seed); const uid = push(s, 'e_adhoc_chart');
    chooseOption(s, uid, qi);
    return s.feed[0].includes(best.result) || s.log[0].text.includes(best.result);
  };
  const base = rate(1500, run, false), boosted = rate(1500, run, true);
  near(base, best.p, 0.04, '快速報表基準機率');
  near(boosted - base, 0.2, 0.05, '快速報表提升幅度');
  // 不是 quick 的選項不該被加成
  const noQ = (seed: number, w: boolean): boolean => {
    const s = mk(w ? ['quick_report'] : [], seed); const uid = push(s, 'e_adhoc_chart');
    chooseOption(s, uid, 0); return true;
  };
  rate(10, noQ, true);
}

// soothe:客訴、輿情事件裡有風險的選項成功率 +0.1;其他種類不受影響
{
  const check = (evId: string, expectBoost: boolean): void => {
    const ev = EVENTS[evId];
    const oi = ev.options.findIndex((o) => o.outcomes.length > 1);
    if (oi < 0) { fail(`${evId} 沒有有風險的選項可測`); return; }
    const outs = ev.options[oi].outcomes;
    const good = (o: typeof outs[number]): number => Object.values(o.effects ?? {}).reduce((a, b) => a + (b as number), 0);
    const best = outs.reduce((a, b) => (good(a) >= good(b) ? a : b));
    const run = (seed: number, w: boolean): boolean => {
      const s = mk(w ? ['soothe'] : [], seed); const uid = push(s, evId);
      chooseOption(s, uid, oi);
      return s.feed[0].includes(best.result) || s.log[0].text.includes(best.result);
    };
    const d = rate(2500, run, true) - rate(2500, run, false);
    near(d, expectBoost ? Math.min(0.1, 1) : 0, 0.045, `安撫話術對 ${evId}(${ev.kind})的提升`);
  };
  check('e_gacha_complaint', true);
  check('e_social_meme', true);
  check('e_server_lag', false);
}

// social_sense:看輿情一次揭露兩項
{
  const a = mk([]); const b = mk(['soothe', 'advocate', 'social_sense']);
  doAction(a, 'intel'); doAction(b, 'intel');
  ok(Number(a.intel.reward) + Number(a.intel.hated) === 1, '沒有社群敏銳時一次應只揭露一項');
  ok(b.intel.reward && b.intel.hated, '社群敏銳沒有一次揭露兩項');
}

// risk_ctrl:活動上線出問題的機率減半(沒驗收的情況 0.37 → 0.185)
{
  const run = (seed: number, w: boolean): boolean => {
    const s = mk(w ? ['auto_report', 'risk_ctrl'] : [], seed);
    planCampaign(s, { mechanic: 'signin', reward: 'material', bundle: 'none', promo: 'none', delay: 1 });
    endDay(s);
    return s.campaign?.phase === 'live' && !!s.campaign.bugged;
  };
  const base = rate(1200, run, false), cut = rate(1200, run, true);
  near(base, 0.37, 0.05, '沒有風險控管的出包率');
  near(cut, 0.185, 0.04, '風險控管後的出包率');
}

// forecast:引擎面沒有限制(畫面只在學會時顯示),這裡確認技能存在且前置正確
ok(hasSkill(mk(['quick_report', 'template', 'forecast']), 'forecast'), '預測模型沒有被帶進對局');

/* ---------- 4. 存檔與職級的帳目 ---------- */
{
  const s = mk(['quick_report', 'data_unify', 'forecast']);
  save(s);
  const back = load();
  ok(!!back && back.skills.join() === s.skills.join(), '存檔讀回後技能不一致');
  // 竄改存檔:塞入不存在或前置不成立的技能
  const raw = JSON.parse(store.get([...store.keys()].find((k) => k.includes('save'))!)!);
  raw.skills = ['forecast', 'bogus', 'time_mgmt'];
  store.set([...store.keys()].find((k) => k.includes('save'))!, JSON.stringify(raw));
  const tampered = load();
  ok(!!tampered && tampered.skills.length === 0, `竄改存檔的技能沒被清掉:${tampered?.skills.join()}`);
}
{
  const key = 'ops-game-profile';
  store.set(key, JSON.stringify({ v: 1, xp: 1000, runs: 9, sp: 8, skills: ['time_mgmt', 'quick_report', 'bogus'], ach: ['first_win'] }));
  const p = loadProfile();
  ok(p.skills.join() === 'quick_report', `職級資料的技能沒被清乾淨:${p.skills.join()}`);
  ok(spentSp(p) === 1 && availableSp(p) === 7, `技能點帳目不對:花 ${spentSp(p)} 剩 ${availableSp(p)}`);
  // 跨局事件次數:竄改的鍵與數值要被清掉或限制範圍
  store.set(key, JSON.stringify({ v: 1, xp: 0, runs: 0, sp: 0, skills: [], ach: [], seen: { e_ok: 3, ['x'.repeat(80)]: 1, e_big: 99999, e_str: 'a', e_neg: -5 } }));
  const sn = loadProfile().seen ?? {};
  ok(sn.e_ok === 3 && sn.e_big === 99 && sn.e_neg === 0 && !('e_str' in sn) && Object.keys(sn).length === 3, `跨局事件次數沒被清乾淨:${JSON.stringify(sn)}`);
  // 舊存檔沒有技能點:依職級補發升級獎勵
  store.set(key, JSON.stringify({ v: 1, xp: 300, runs: 3, skills: [], ach: [] }));
  const old = loadProfile();
  ok(old.sp === (levelFor(300).lv - 1) * SP_PER_LEVEL, `舊存檔補發技能點不對:${old.sp}`);
  // 模擬學習流程
  let prof = { ...old, sp: 4 };
  const learn = (id: string): boolean => {
    const k = skillById(id)!;
    if (prof.skills.includes(id) || !prereqMet(k, prof.skills) || availableSp(prof) < k.cost) return false;
    prof = { ...prof, skills: [...prof.skills, id] }; saveProfile(prof); return true;
  };
  ok(learn('soothe') && availableSp(prof) === 3, '學第一個技能後點數不對');
  ok(!learn('social_sense'), '沒前置也學得會社群敏銳');
  ok(learn('advocate') && availableSp(prof) === 1, '學第二層後點數不對');
  ok(!learn('crisis_pr'), '點數不足(剩 1,要 2)卻學得會');
  ok(!learn('soothe'), '重複學習同一個技能');
  prof = { ...prof, skills: sanitizeSkills(prof.skills.filter((x) => x !== 'soothe')) };
  ok(prof.skills.length === 0 && availableSp(prof) === 4, '取消起點技能後,點數沒有全額退回');
}

if (failed) throw new Error(`技能系統檢查失敗 ${failed} 項`);
console.log('✅ 技能系統檢查全部通過');
