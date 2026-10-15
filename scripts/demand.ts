// 統計:每天收件匣裡的事,「中間價位的選項」加起來大約要幾點行動點數(供給是 6 點)
import { newGame, chooseOption, endDay, planCampaign, doAction, EVENTS, eventOptions, optionCost } from '../src/engine';
import type { Difficulty } from '../src/types';

function run(diff: Difficulty, seed: number) {
  const s = newGame('story', diff, seed, 5);
  const rows: { n: number; need: number }[] = [];
  let guard = 0;
  while (!s.over && guard++ < 40) {
    let need = 0;
    for (const it of s.inbox) {
      const costs = eventOptions(s, EVENTS[it.eventId]).map((o) => optionCost(s, it, o)).sort((a, b) => a - b);
      need += costs[Math.floor(costs.length / 2)] ?? 0;
    }
    rows.push({ n: s.inbox.length, need });
    // 簡單處理:每件事選「中間價位」的選項,直到點數用完
    for (const it of [...s.inbox]) {
      const opts = eventOptions(s, EVENTS[it.eventId]);
      const order = opts.map((o, i) => ({ i, c: optionCost(s, it, o) })).sort((a, b) => a.c - b.c);
      const pick = order[Math.floor(order.length / 2)];
      if (pick && pick.c <= s.ap) chooseOption(s, it.uid, pick.i);
    }
    while (s.ap > 0 && s.pendingReports > 0) doAction(s, 'report');
    void planCampaign;
    rows[rows.length - 1].need = rows[rows.length - 1].need; // 紀錄的是處理前
    endDay(s);
  }
  return rows;
}

for (const diff of ['easy', 'normal', 'hard'] as const) {
  let n = 0, need = 0, days = 0, over = 0;
  for (let i = 0; i < 40; i++) for (const r of run(diff, 500 + i)) { n += r.n; need += r.need; days++; if (r.need > 6) over++; }
  console.log(`${diff.padEnd(6)} 每天事件 ${(n / days).toFixed(1)} 件 · 需要約 ${(need / days).toFixed(1)} 點 · 超過 6 點的天數 ${Math.round((over / days) * 100)}%`);
}
