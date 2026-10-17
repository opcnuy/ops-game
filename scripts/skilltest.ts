// 技能系統檢查:資料自洽、學習規則、12 個技能各自的實際效果、存檔與職級的技能點帳目
import {
  DIFFS, EVENTS, activeBuffs, buffActive, moodOf, pickScout, pulseActive, pulseHint, chooseOption, doAction, endDay, eventOptions, hasSkill, load, makeReport, newGame, optionCost, planCampaign, save, submitReport,
} from '../src/engine';
import { SCOUT_CARDS, scoutCard } from '../src/scout';
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

// 事件的氣氛會影響機率:技能測試固定用「氣氛普通」的種子,才量得到技能本身的加成
const NEUTRAL_V = ((): number => {
  for (let v = 12345; ; v++) if (moodOf({ uid: 0, eventId: 'e_server_lag', arrived: 1, deadline: 1, stage: 0, v }, EVENTS.e_server_lag) === 'neutral') return v;
})();
const push = (s: State, eventId: string, stage = 0): number => {
  const uid = s.uid++;
  s.inbox.push({ uid, eventId, arrived: s.day, deadline: s.day + 5, stage, v: NEUTRAL_V });
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

// forecast:確認技能存在且前置正確
ok(hasSkill(mk(['quick_report', 'template', 'forecast']), 'forecast'), '預測模型沒有被帶進對局');
// forecast:活動上線時成績的隨機起伏減半(升幅的標準差明顯變小)
{
  const spread = (skills: string[]): number => {
    const v: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t = mk(skills, 70000 + i);
      planCampaign(t, { mechanic: 'lottery', reward: 'shard', bundle: 'starter', promo: 'notice', delay: 1 });
      t.campaign!.checked = true; t.campaign!.polish = 1;
      endDay(t);
      if (t.campaign?.phase === 'live' && !t.campaign.bugged) v.push(t.campaign.lift); // 出包的不算,不然七折會蓋過雜訊
    }
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / m; // 相對起伏
  };
  const a = spread([]); const b = spread(['quick_report', 'template', 'forecast']);
  ok(b < a * 0.8, `預測模型沒有讓活動成績更穩定:${a.toFixed(3)} → ${b.toFixed(3)}`);
}

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

// 看輿情:喜好都摸清後仍可再看,掌握風向當天與隔天;客訴/輿情事件先給提示,有風險的選項更穩
{
  const s = mk([]);
  ok(!pulseActive(s) && !pulseHint(s, EVENTS.e_gacha_complaint), '還沒看輿情就有風向');
  s.intel = { reward: true, hated: true };
  const ap0 = s.ap;
  ok(doAction(s, 'intel') === null && s.ap === ap0 - 1 && pulseActive(s), '喜好都摸清後,看輿情沒有給風向');
  ok(doAction(s, 'intel') !== null && s.ap === ap0 - 1, '同一天重複看輿情不該再花點數');
  ok(!!pulseHint(s, EVENTS.e_gacha_complaint) && !!pulseHint(s, EVENTS.e_boss_campaign) && !pulseHint(s, EVENTS.i_tea), '風向提示該出現在各種事件,但插曲不用');
  endDay(s);
  ok(pulseActive(s), '隔天風向應該還在');
  endDay(s);
  ok(!pulseActive(s), '兩天後風向應該消失');
  // 效果:有風險的選項成功率(以 e_gacha_complaint 的最佳選項為例,多次試驗)
  const label = EVENTS.e_gacha_complaint.options.find((o) => o.outcomes.length > 1)?.label ?? '';
  const trial = (look: boolean): number => {
    let good = 0;
    for (let i = 0; i < 600; i++) {
      const t = mk([], 3000 + i); t.intel = { reward: true, hated: true };
      if (look) doAction(t, 'intel');
      const before = t.trust;
      const uid = push(t, 'e_gacha_complaint');
      const idx = optIndex(t, 'e_gacha_complaint', label);
      if (idx >= 0) chooseOption(t, uid, idx);
      if (t.trust > before) good++;
    }
    return good / 600;
  };
  const a = trial(false); const b = trial(true);
  ok(b > a + 0.04, `看輿情後風險選項沒有明顯更穩:${a.toFixed(2)} → ${b.toFixed(2)}`);
}

// 熬夜加班:剛到職的前兩天不累積
{
  const s = mk([]);
  const uid = push(s, 'e_adhoc_chart');
  chooseOption(s, uid, optIndex(s, 'e_adhoc_chart', '全部做完'));
  ok(!(s.habits.overtime > 0) && !(s.styleTotals?.overtime), '第一天就累積了熬夜加班');
  s.day = 3; s.ap = 6;
  const uid2 = push(s, 'e_adhoc_chart');
  chooseOption(s, uid2, optIndex(s, 'e_adhoc_chart', '全部做完'));
  ok(s.habits.overtime === 1, '第 3 天之後熬夜加班應該要累積');
}

// 氣氛與結果浮動(插曲以外的所有事件):同一個選項,碰到不同的對象結果會不同
{
  const ev = EVENTS.e_gacha_complaint;
  const label = '公布完整機率驗證報告';
  const mkItem = (v: number, stage = 0) => ({ uid: 1, eventId: ev.id, arrived: 1, deadline: 9, stage, v });
  // 氣氛分布大約 3:5:2,被催第二次一律火氣大,插曲永遠普通
  const cnt = { receptive: 0, neutral: 0, hostile: 0 };
  for (let v = 1; v <= 3000; v++) cnt[moodOf(mkItem(v * 7919), ev)]++;
  near(cnt.receptive / 3000, 0.3, 0.04, `願意聽的比例不對:${cnt.receptive}`);
  near(cnt.hostile / 3000, 0.2, 0.04, `火氣大的比例不對:${cnt.hostile}`);
  ok(moodOf(mkItem(5, 1), ev) === 'hostile', '被催第二次應該火氣很大');
  ok(moodOf(mkItem(5), EVENTS.i_tea) === 'neutral', '插曲不該有氣氛');
  ok(['receptive', 'neutral', 'hostile'].includes(moodOf(mkItem(5), EVENTS.e_boss_campaign)), '老闆事件也該有氣氛');
  // 找出三種氣氛各一個種子,比較成功率與數值
  const seeds: Record<string, number[]> = { receptive: [], neutral: [], hostile: [] };
  for (let v = 1; v < 5000; v++) { const m = moodOf(mkItem(v), ev); if (seeds[m].length < 500) seeds[m].push(v); }
  const run = (m: string) => {
    let good = 0; const vals = new Set<number>();
    seeds[m].forEach((v, i) => {
      const t = mk([], 9000 + i); const uid = t.uid++;
      t.inbox.push({ uid, eventId: ev.id, arrived: t.day, deadline: t.day + 5, stage: 0, v });
      const before = t.trust;
      chooseOption(t, uid, optIndex(t, ev.id, label));
      const d = t.trust - before;
      if (d > 0) { good++; vals.add(d); }
    });
    return { rate: good / seeds[m].length, spread: vals.size };
  };
  const r = run('receptive'), n = run('neutral'), h = run('hostile');
  ok(r.rate > n.rate + 0.05 && n.rate > h.rate + 0.05, `成功率應該 願意聽 > 普通 > 火氣大:${r.rate.toFixed(2)} ${n.rate.toFixed(2)} ${h.rate.toFixed(2)}`);
  ok(n.spread >= 3, `同一個選項成功時的信任變化應該有幾種:${n.spread}`);
  // 浮動不改變正負號,也不會把「有變動」變成 0
  for (let i = 0; i < 300; i++) {
    const t = mk([], 20000 + i); const uid = t.uid++;
    t.inbox.push({ uid, eventId: 'e_refund', arrived: t.day, deadline: t.day + 5, stage: 0, v: i * 31 + 1 });
    const before = t.trust;
    chooseOption(t, uid, optIndex(t, 'e_refund', '回覆「無法處理」'));
    if (!(t.trust < before)) { fail('扣信任的選項浮動後變成沒扣'); break; }
  }
  // 風向提示會帶出氣氛
  const sp = mk([]); sp.intel = { reward: true, hated: true }; doAction(sp, 'intel');
  const hint = pulseHint(sp, ev, mkItem(seeds.hostile[0]));
  ok(!!hint && hint.includes('火氣'), `風向提示沒有說出氣氛:${hint}`);
}

// 輿情報告:抽三張發現卡,選一張有好處也有代價,效果會持續幾天
{
  // 抽卡:三張不重複,至少一張不是壞的、至少一張免費
  for (let i = 0; i < 400; i++) {
    const s = mk([], 40000 + i); s.pendingReports = i % 2;
    doAction(s, 'intel');
    const ids = s.scout?.cards ?? [];
    const cs = ids.map((id) => scoutCard(id)!);
    if (ids.length !== 3 || new Set(ids).size !== 3 || cs.some((c) => !c)) { fail(`抽卡結果不對:${ids}`); break; }
    if (cs.every((c) => c.bad)) { fail('三張全是壞的'); break; }
    if (cs.every((c) => c.ap > 0)) { fail('三張都要花點數'); break; }
    if (s.pendingReports === 0 && ids.includes('summary')) { fail('沒有待填日報卻抽到整理日報'); break; }
  }
  // 每種卡都能選,點數與效果正確
  const withCard = (id: string, setup?: (s: State) => void): State => {
    const s = mk([], 51000); setup?.(s);
    doAction(s, 'intel'); s.scout = { day: s.day, cards: [id, 'calm', 'guide'] };
    return s;
  };
  for (const c of SCOUT_CARDS) {
    const s = withCard(c.id, (t) => { t.pendingReports = 2; t.habits.ignored_players = 3; });
    const ap0 = s.ap;
    ok(pickScout(s, c.id) === null && s.ap === ap0 - c.ap && !s.scout, `卡片「${c.name}」選下去的點數或狀態不對`);
    if (c.buff) ok(buffActive(s, c.buff.id), `卡片「${c.name}」沒有給持續狀態`);
    if (c.clearHabit) ok(!s.habits[c.clearHabit], `卡片「${c.name}」沒有清掉習慣`);
    if (c.reports) ok(s.pendingReports === 2 - c.reports, `卡片「${c.name}」沒有減日報`);
    if (c.complaintTomorrow) ok(s.followUps.some((f) => ['客訴', '輿情'].includes(EVENTS[f.eventId].kind)), `卡片「${c.name}」沒有排出隔天的事件`);
  }
  { // 點數不夠、不在手上的卡、先觀望
    const s = withCard('trend'); s.ap = 0;
    ok(pickScout(s, 'trend') !== null, '點數不夠還選得到要花點數的卡');
    ok(pickScout(s, 'leak') !== null, '選到不在手上的卡');
    ok(pickScout(s, null) === null && !s.scout, '先觀望沒有關掉報告');
    ok(pickScout(s, null) !== null, '沒有報告還能觀望');
  }
  // 傾聽:有忽視玩家的累積才會減 1
  { const a = mk([]); a.habits.ignored_players = 2; doAction(a, 'intel'); ok(a.habits.ignored_players === 1 && a.scout?.listened === true, '看輿情沒有減少忽視玩家');
    const b = mk([]); doAction(b, 'intel'); ok(!b.scout?.listened, '沒有累積也說有聽見'); }
  // 持續狀態:信任得分 +25%、老闆得失 +30%、事件選項少花 1 點、每天人數、明天少 1 點、過期
  const gain = (setup: (s: State) => void, eventId: string, label: string, stat: 'trust' | 'boss'): number => {
    let sum = 0;
    for (let i = 0; i < 200; i++) {
      const t = mk([], 60000 + i); setup(t);
      const uid = push(t, eventId); const before = t[stat];
      chooseOption(t, uid, optIndex(t, eventId, label)); sum += t[stat] - before;
    }
    return sum;
  };
  const addB = (id: string) => (t: State) => { t.buffs = [{ id, until: t.day + 2 }]; };
  ok(gain(addB('trustUp'), 'e_refund', '依政策協助申請退款流程', 'trust') > gain(() => {}, 'e_refund', '依政策協助申請退款流程', 'trust') * 1.15, '玩家挺你沒有放大信任得分');
  const bossBase = gain(() => {}, 'e_boss_campaign', '收到,馬上規劃', 'boss');
  ok(gain(addB('bossAmp'), 'e_boss_campaign', '收到,馬上規劃', 'boss') > bossBase, '老闆在看沒有放大老闆得分');
  { const t = mk([]); const uid = push(t, 'e_refund'); const opt = EVENTS.e_refund.options[0]; const it = t.inbox.find((i) => i.uid === uid)!;
    const base = optionCost(t, it, opt); addB('prepared')(t); ok(optionCost(t, it, opt) === Math.max(0, base - 1), '有備而來沒有讓客訴選項少花 1 點');
    const boss = push(t, 'e_boss_campaign'); const bi = t.inbox.find((i) => i.uid === boss)!;
    ok(optionCost(t, bi, EVENTS.e_boss_campaign.options[1]) === EVENTS.e_boss_campaign.options[1].ap, '有備而來不該影響老闆事件'); }
  { const a = mk([], 7); const b = mk([], 7); addB('hype')(a); endDay(a); endDay(b);
    ok(a.players > b.players, '話題熱度沒有讓玩家人數多一點'); }
  { const t = mk([]); t.buffs = [{ id: 'tired', until: t.day + 1 }]; endDay(t); ok(t.ap === t.maxAp - 1, '心很累沒有讓隔天少 1 點'); endDay(t); ok(t.ap === t.maxAp, '心很累應該只影響一天'); }
  { const t = mk([]); t.buffs = [{ id: 'trustUp', until: t.day + 1 }]; ok(activeBuffs(t).length === 1 && activeBuffs(t)[0].left === 2, '剩餘天數不對'); endDay(t); endDay(t); ok(activeBuffs(t).length === 0 && !(t.buffs ?? []).length, '過期的狀態沒有清掉'); }
  // 沒選的報告隔天過期;存檔讀回後報告與狀態還在,竄改的內容會被濾掉
  { const t = mk([]); doAction(t, 'intel'); endDay(t); ok(!t.scout, '沒選的報告隔天還在'); }
  { const t = mk([]); doAction(t, 'intel'); t.buffs = [{ id: 'hype', until: t.day + 2 }]; save(t); const l = load()!;
    ok(l.scout?.cards.length === 3 && l.buffs?.[0].id === 'hype', '存檔讀回後報告或狀態不見了');
    const raw = JSON.parse(JSON.stringify(t)); raw.scout.cards = ['calm', '<b>x</b>', 'nope']; raw.buffs = [{ id: 'evil', until: 5 }, { id: 'hype', until: 'x' }];
    store.set([...store.keys()].find((k) => k.includes('save'))!, JSON.stringify(raw)); const l2 = load()!;
    ok(l2.scout?.cards.length === 1 && l2.scout.cards[0] === 'calm' && l2.buffs?.length === 1, '竄改的卡片或狀態沒有被濾掉'); }
}

if (failed) throw new Error(`技能系統檢查失敗 ${failed} 項`);
console.log('✅ 技能系統檢查全部通過');
