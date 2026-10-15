import { newGame, makeReport, submitReport, endDay, planCampaign, chooseOption, EVENTS, eventOptions } from '../src/engine';

const kinds: Record<string, number> = {};
let bad = 0;
for (let seed = 1; seed <= 60; seed++) {
  const s = newGame('story', 'normal', seed, 5);
  for (let day = 0; day < 15 && !s.over; day++) {
    if (!s.campaign && s.day >= 2 && s.ap >= 3) planCampaign(s, { mechanic: 'lottery', reward: 'shard', bundle: 'starter', promo: 'notice', delay: 3 });
    s.pendingReports = Math.max(s.pendingReports, 1);
    for (let k = 0; k < 3; k++) {
      if (s.ap < 1) break;
      const q = makeReport(s);
      kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
      const goods = q.options.filter((o) => o.good === true).length;
      const ok = q.kind === 'tone' ? goods === 0 : goods === 1;
      if (!ok || q.options.length !== 3 || !q.facts.length) { bad++; console.log('壞題目', q.kind, goods, q.options.length); }
      submitReport(s, q, Math.floor(Math.random() * q.options.length));
      s.pendingReports = Math.max(s.pendingReports, 1);
    }
    for (const it of [...s.inbox]) { const o = eventOptions(s, EVENTS[it.eventId]); const i = o.findIndex((x) => x.ap <= s.ap); if (i >= 0) chooseOption(s, it.uid, i); }
    endDay(s);
  }
}
console.log('題型分佈', kinds, '壞題目', bad);
