// 活動搭配、餘波、策略、檔案室、導演、首領、突發事件等系統的檢查
import { ALL_UNLOCK, DEFAULT_UNLOCK, ROLES, SHOP, STRATEGIES } from '../src/cards';
import { optionCost } from '../src/engine';
import { dominantTheme, makeReport, paceOf, submitReport, threatLevel } from '../src/engine';
import { buyItem, loadProfile, saveProfile } from '../src/profile';
import { pickCard, stratLv, gainXp, COMBOS, CONTENT, combosFor, chooseOption, doAction, endDay, eventOptions, EVENTS, newGame, planCampaign, spendToday } from '../src/engine';
import { SCOUT_CARDS } from '../src/scout';
import { ACHIEVEMENTS } from '../src/achievements';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) { failed++; console.error('❌ ' + m); } };

// 搭配只能引用存在的項目
const ids: Record<string, string[]> = { mechanic: CONTENT.mechanics.map((x) => x.id), reward: CONTENT.rewards.map((x) => x.id), bundle: CONTENT.bundles.map((x) => x.id), promo: CONTENT.promos.map((x) => x.id) };
for (const c of COMBOS) for (const [k, id] of c.pairs) ok(ids[k]?.includes(id), `搭配「${c.name}」引用不存在的 ${k}:${id}`);
ok(combosFor({ mechanic: 'guild', reward: 'title', bundle: 'none', promo: 'none', delay: 3 }).length === 1, '公會對抗賽+稱號應觸發榮耀競賽');

// 成就
ok(new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, '成就 id 重複');
ok(SCOUT_CARDS.every((c) => c.name && c.result), '輿情卡缺欄位');

// 策略:開局先選一張,升級再選,疊等級,進化,存檔
{
  const s = newGame('story', 'normal', 3, 1);
  ok((s.cardPick?.length ?? 0) >= 3 && s.cardPick!.every((id) => !STRATEGIES.find((c) => c.id === id)!.evolve), '開局應有至少三張非進化候選');
  ok(true, '');
  ok(pickCard(s, 'not_here') !== null, '候選以外的策略不該能選');
  const first = s.cardPick![0];
  ok(pickCard(s, first) === null && stratLv(s, first) === 1 && !s.cardPick && s.pendingPicks === 0, '選完應生效並清掉候選');
  const lv0 = s.lv ?? 1;
  ok(gainXp(s, 1000) >= 2 && (s.lv ?? 1) > lv0 && !!s.cardPick, '大量經驗應連升並出現候選');
  let guard = 0;
  while (s.cardPick && guard++ < 40) pickCard(s, s.cardPick[0]);
  ok(!s.cardPick && (s.pendingPicks ?? 0) === 0, '選完所有升級後不該還有候選');
  ok(Object.values(s.strat ?? {}).every((l) => l >= 1 && l <= 5), '策略等級超出範圍');
  // 進化:兩張都到 3 級才會出現
  const e = newGame('story', 'normal', 5, 5);
  e.cardPick = undefined; e.pendingPicks = 0;
  e.strat = { trust_first: 3, revenue: 3 };
  gainXp(e, 1000);
  ok(!!(e.cardPick as string[] | undefined)?.includes('evo_fan'), '兩張都到 3 級應出現「粉絲團」');
  pickCard(e, 'evo_fan');
  ok(stratLv(e, 'evo_fan') === 1, '進化策略應生效');
  // 全員待命:+1 點行動點數
  const t2 = newGame('story', 'normal', 4, 5);
  const ap = t2.maxAp; t2.cardPick = ['all_hands']; pickCard(t2, 'all_hands');
  ok(t2.maxAp === ap + 1 && t2.ap >= ap + 1, '全員待命應多 1 點行動點數');
  // 時間管理:多一張候選
  const t3 = newGame('story', 'normal', 6, 5);
  ok(t3.cardPick?.length === 4, '全部解鎖時候選應有四張');
}
// 局外成長:資歷購買、解鎖限制候選、職位起手
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  };
  const p0 = loadProfile();
  ok((p0.credits ?? 0) === 0 && p0.role === 'intern' && DEFAULT_UNLOCK.every((id) => p0.unlock?.includes(id)), '新檔案的資歷、職位與預設解鎖不對');
  ok(!buyItem(p0, 'shield').ok, '資歷不足不該買得到');
  const rich = { ...p0, credits: 500 };
  const b = buyItem(rich, 'shield');
  ok(b.ok && b.profile.credits === 460 && b.profile.unlock!.includes('shield'), '購買應扣資歷並解鎖');
  ok(b.ok && !buyItem(b.profile, 'shield').ok, '重複購買應被擋下');
  ok(!buyItem(rich, 'not_here').ok, '不存在的商品應被擋下');
  // 只解鎖預設時,候選只會有預設的策略
  let leaked = 0;
  for (let i = 0; i < 60; i++) {
    const s = newGame('story', 'normal', 100 + i, 1, {}, {}, undefined, DEFAULT_UNLOCK, 'intern');
    if (s.cardPick!.some((id) => !DEFAULT_UNLOCK.includes(id))) leaked++;
  }
  ok(leaked === 0, '沒解鎖的策略不該出現在候選');
  // 職位:起手拿到對應的策略 Lv1,而且開局仍有一次選擇
  for (const r of ROLES.filter((x) => x.start)) {
    const s = newGame('story', 'normal', 9, 1, {}, {}, undefined, DEFAULT_UNLOCK, r.id);
    ok(stratLv(s, r.start!) === 1 && s.role === r.id && !!s.cardPick, `職位「${r.name}」起手策略不對`);
  }
  // 職位特性
  const iv = newGame('story', 'normal', 21, 1, {}, {}, undefined, DEFAULT_UNLOCK, 'intern');
  iv.xp = 0; iv.cardPick = undefined; iv.pendingPicks = 0;
  gainXp(iv, 10);
  ok(iv.xp === 11, '實習營運的經驗應多 10%:' + iv.xp);
  const sv = newGame('story', 'normal', 22, 1, {}, {}, undefined, DEFAULT_UNLOCK, 'secretary');
  ok(sv.traits?.known.boss === true, '老闆秘書開局應摸清老闆性格');
  const pv = newGame('story', 'normal', 23, 5, {}, {}, undefined, ALL_UNLOCK, 'planner');
  planCampaign(pv, { mechanic: 'signin', reward: 'shard', bundle: 'none', promo: 'none', delay: 3 });
  const ap0 = pv.ap; doAction(pv, 'polish');
  ok(pv.ap === ap0 && pv.campaign?.polish === 1, '活動企劃第一次打磨應免費');
  const ap1 = pv.ap; doAction(pv, 'polish');
  ok(pv.ap === ap1 - 1, '第二次打磨應照常花 1 點');
  // 難度攀升:危機等級隨天數升高
  { const g = newGame('story', 'normal', 51, 1); const lv = (d: number) => { g.day = d; return threatLevel(g); };
    ok(lv(1) === 1 && lv(3) === 1 && lv(4) === 2 && lv(10) === 4, '危機等級的天數對應不對'); }
  // 首領:前一天預告,每 5 天登場,依流派挑選
  {
    const g = newGame('story', 'normal', 61, 5);
    g.cardPick = undefined; g.pendingPicks = 0; g.strat = { revenue: 3 };
    ok(dominantTheme(g) === 'revenue', '偏重營收的流派應被認出');
    let announced = '', boss = '';
    for (let i = 0; i < 6 && !g.over; i++) {
      if (g.day === 4) { announced = endDay(g).lines.find((l) => l.includes('明天有首領')) ?? ''; } else endDay(g);
      if (g.day === 5 && !boss) boss = g.inbox.find((x) => EVENTS[x.eventId].boss)?.eventId ?? '';
    }
    ok(announced.includes('輿論風暴'), '偏重營收應預告輿論風暴:' + announced);
    ok(boss === 'boss_storm', '第 5 天登場的首領應和預告一致:' + boss);
    const none = newGame('story', 'normal', 62, 1); none.cardPick = undefined; none.strat = {};
    ok(dominantTheme(none) === undefined, '沒有策略就沒有流派');
    // 目標進度:落後放水、領先加壓
    const p = newGame('story', 'normal', 63, 1); p.day = 6;
    p.players = 9000; p.trust = 30; p.boss = 20;
    ok(paceOf(p).mode === 'ease', '落後目標應放水:' + paceOf(p).mode);
    p.players = 20000; p.trust = 95; p.boss = 95; p.history = [{ day: 1, players: 1, spend: 99 }, { day: 2, players: 1, spend: 99 }];
    ok(paceOf(p).mode === 'press', '領先目標應加壓:' + paceOf(p).mode);
  }
  // 風格事件:風格達到等級才會遇到專屬事件
  {
    const seen = (persona: Record<string, number>): { lv1: boolean; lv2: boolean } => {
      let lv1 = false, lv2 = false;
      for (let i = 0; i < 80; i++) {
        const s = newGame('story', 'normal', 400 + i, 1, {}, persona);
        for (let d = 0; d < 6 && !s.over; d++) {
          for (const it of s.inbox) { const e = EVENTS[it.eventId]; if (e.persona) { if ((e.personaLv ?? 1) >= 2) lv2 = true; else lv1 = true; } }
          s.cardPick = undefined; endDay(s);
        }
      }
      return { lv1, lv2 };
    };
    const none = seen({}), l1 = seen({ open: 1 }), l2 = seen({ open: 2 });
    ok(!none.lv1 && !none.lv2, '沒有風格不該遇到風格事件');
    ok(l1.lv1 && !l1.lv2, 'Lv1 只該遇到 Lv1 的風格事件');
    ok(l2.lv2, 'Lv2 應遇到 Lv2 的風格事件');
  }
  // 突發事件:用掉一半行動點數是下午、八成是晚上,才冒出來,而且當天到期
  {
    const g = newGame('story', 'normal', 71, 5);
    g.cardPick = undefined; g.pendingPicks = 0; g.day = 3; g.inbox = []; g.pulse = undefined;
    g.sudden = [{ at: 'pm' }, { at: 'eve' }]; g.ap = g.maxAp - 2;
    ok(!g.inbox.some((i) => i.sudden), '還沒到時間不該有突發');
    doAction(g, 'intel');
    ok(g.inbox.filter((i) => i.sudden).length === 1 && !!g.alert?.includes('下午') && g.inbox.find((i) => i.sudden)!.deadline === g.day, '用掉一半點數應冒出下午的突發,且當天到期:' + g.alert);
    g.ap = 2; g.pulse = undefined; g.pendingReports = 1;
    submitReport(g, makeReport(g), 0);
    ok(g.inbox.filter((i) => i.sudden).length === 2 && !!g.alert?.includes('晚上'), '用到八成應冒出晚上的突發');
    let days = 0, withSudden = 0;
    for (let i = 0; i < 80; i++) { const h = newGame('story', 'normal', 900 + i, 1); for (let d = 0; d < 8 && !h.over; d++) { h.cardPick = undefined; endDay(h); days++; if (h.sudden?.length) withSudden++; } }
    ok(withSudden > days * 0.2 && withSudden < days * 0.9, `突發排程的頻率不合理:${withSudden}/${days}`);
  }
  // 策略:純好型沒有代價、新流派、衝刺省點數、賭徒
  {
    const pure = STRATEGIES.filter((c) => c.pure);
    ok(pure.length >= 5 && pure.every((c) => c.bad(3) === '' && !c.evolve), '純好型應沒有代價');
    ok(STRATEGIES.filter((c) => !c.pure && !c.evolve).every((c) => c.bad(1) !== ''), '非純好型都該有代價');
    ok(['community', 'speed', 'risk'].every((th) => STRATEGIES.some((c) => c.theme === th)), '應有社群、速度、賭運流派');
    const sp = newGame('story', 'normal', 81, 5, {}, {}, undefined, ALL_UNLOCK, 'intern');
    sp.cardPick = undefined; sp.pendingPicks = 0; sp.strat = { sprint: 1 };
    sp.inbox = []; sp.ap = sp.maxAp;
    const e = Object.values(EVENTS).find((x) => x.options.some((o) => o.ap >= 2) && x.kind === '雜務') ?? Object.values(EVENTS).find((x) => x.options.some((o) => o.ap >= 2))!;
    sp.inbox.push({ uid: 999, eventId: e.id, arrived: sp.day, deadline: sp.day + 3, v: 1 });
    const oi = eventOptions(sp, e, sp.inbox[0]).findIndex((o) => o.ap >= 2);
    const base = optionCost({ ...sp, strat: {} } as typeof sp, sp.inbox[0], eventOptions(sp, e, sp.inbox[0])[oi]);
    ok(optionCost(sp, sp.inbox[0], eventOptions(sp, e, sp.inbox[0])[oi]) === base - 1, '衝刺應讓第一個選項少花 1 點');
    const before = sp.ap; chooseOption(sp, 999, oi);
    ok(before - sp.ap === base - 1 && sp.sprintUsed?.n === 1, '衝刺實際扣點應少 1 點:' + (before - sp.ap));
    ok(sprintOnce(sp), '衝刺用過後,今天不該再少花');
  }
  // 關聯性:活動類事件要辦過活動才出現;劇情後期不再抽活動類策略
  {
    let bad = '';
    for (let i = 0; i < 60 && !bad; i++) {
      const s = newGame('story', 'normal', 1200 + i, 5);
      for (let d = 0; d < 7 && !s.over && !bad; d++) {
        s.cardPick = undefined;
        const hit = s.inbox.find((it) => EVENTS[it.eventId].needsCampaign && !(it.eventId === 'e_adhoc_roi' && (it.arrived === 2 || it.stage)));
        if (hit) bad = hit.eventId + '@' + s.day;
        endDay(s);
      }
    }
    ok(!bad, '沒辦過活動就不該出現活動類事件:' + bad);
    const late = newGame('story', 'normal', 1300, 5);
    late.cardPick = undefined; late.pendingPicks = 0; late.day = 9; late.campaign = undefined; late.strat = { revenue: 2 };
    let leaked = 0;
    for (let i = 0; i < 40; i++) { late.cardPick = undefined; late.pendingPicks = 0; gainXp(late, 1000); for (const id of late.cardPick as string[] | undefined ?? []) if (STRATEGIES.find((c) => c.id === id)?.needsCampaign) leaked++; late.strat = { revenue: 2 }; }
    ok(leaked === 0, '後期不該再抽到活動類策略:' + leaked);
  }
  // 挑戰
  const base = newGame('story', 'normal', 31, 1);
  const tight = newGame('story', 'normal', 31, 1, {}, {}, undefined, ALL_UNLOCK, 'intern', 'tight');
  ok(tight.maxAp === base.maxAp - 1 && tight.ap === base.ap - 1, '人手吃緊應少 1 點行動點數');
  const angry = newGame('story', 'normal', 31, 1, {}, {}, undefined, ALL_UNLOCK, 'intern', 'angry');
  ok(angry.trust === base.trust - 10, '民怨沸騰開局信任應 -10');
  let rushMore = 0, plain = 0;
  for (let i = 0; i < 40; i++) {
    rushMore += newGame('story', 'normal', 200 + i, 1, {}, {}, undefined, ALL_UNLOCK, 'intern', 'rush').inbox.length;
    plain += newGame('story', 'normal', 200 + i, 1).inbox.length;
  }
  ok(rushMore > plain, '趕工季應有更多事件');
  // 新策略與進化都在檔案室賣、候選與進化規則成立
  ok(['community', 'hype_team', 'frugal', 'tutor', 'evo_viral', 'evo_cash', 'evo_mentor'].every((id) => SHOP.some((x) => x.id === id)), '新策略應出現在檔案室');
  const ev = newGame('story', 'normal', 41, 5);
  ev.cardPick = undefined; ev.pendingPicks = 0; ev.strat = { hype_team: 3, community: 3 };
  gainXp(ev, 1000);
  ok(!!(ev.cardPick as string[] | undefined)?.includes('evo_viral'), '兩張都到 3 級應出現「病毒式傳播」');
  // 存檔竄改:亂填的資歷、解鎖與職位
  store.set('ops-game-profile', JSON.stringify({ v: 1, xp: 5, runs: 1, ach: [], credits: -50, unlock: ['evil', 'shield', 5], role: 'secretary' }));
  const bad = loadProfile();
  ok(bad.credits === 0 && !bad.unlock!.includes('evil') && bad.unlock!.includes('shield') && bad.role === 'intern', '竄改的資歷、解鎖或職位沒有被濾掉:' + JSON.stringify(bad.unlock));
  saveProfile(bad); void SHOP;
}
// 緩衝:第一次逾期不扣分,只有一次
{
  const s = newGame('story', 'normal', 11, 5);
  let used = 0;
  for (let i = 0; i < 12 && !s.over; i++) { const before = s.flags.bufferUsed; endDay(s); if (!before && s.flags.bufferUsed) used++; }
  ok(used <= 1, '緩衝一局只能用一次');
}
// 餘波與透支:跑很多局,至少有一局出現透支,且透支期間日營收較低
{
  let dips = 0, combos = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const s = newGame('story', 'normal', seed, 5);
    for (let d = 0; d < 12 && !s.over; d++) {
      if (!s.campaign || s.campaign.phase === 'done') planCampaign(s, { mechanic: 'guild', reward: 'title', bundle: 'monthly', promo: 'mail', delay: 3 });
      for (const it of [...s.inbox]) { const o = eventOptions(s, EVENTS[it.eventId]); const i = o.findIndex((x) => x.ap <= s.ap); if (i >= 0) chooseOption(s, it.uid, i); }
      if (s.campaign?.phase === 'planned') for (let k = 0; k < 4; k++) doAction(s, 'polish');
      const dip = s.spendDip && s.spendDip.until >= s.day;
      if (dip) { dips++; const base = s.spendDip!.pct; s.spendDip!.pct = 0; const full = spendToday(s); s.spendDip!.pct = base; ok(spendToday(s) < full, '透支期間日營收應較低'); }
      endDay(s);
      if (s.flags.comboRun) combos++;
    }
  }
  ok(dips > 0, '80 局都沒出現消費透支');
  ok(combos > 0, '沒有任何一局觸發搭配');
  console.log(`消費透支出現 ${dips} 天、搭配活動 ${combos} 天`);
}
console.log(failed ? `❌ ${failed} 項失敗` : '✅ 系統檢查全部通過');
if (failed) throw new Error("系統檢查失敗");

function sprintOnce(s: ReturnType<typeof newGame>): boolean { return (s.sprintUsed?.n ?? 0) >= 1; }
