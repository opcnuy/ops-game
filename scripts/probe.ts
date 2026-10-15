import { newGame, chooseOption, planCampaign, doAction, endDay, goalValue, EVENTS } from '../src/engine';
for (const diff of ['normal', 'hard'] as const) {
  const acc = { players: 0, retention: 0, spend: 0, trust: 0, boss: 0 }; const N = 40;
  for (let i = 0; i < N; i++) {
    const s = newGame('story', diff, 1000 + i); let g = 0;
    while (!s.over && g++ < 100) {
      if ((!s.campaign || s.campaign.phase === 'done') && s.day >= 2 && s.ap >= 3)
        planCampaign(s, { mechanic: 'dungeon', reward: 'skin', bundle: 'skinpack', promo: 'social', delay: 3 });
      if (s.campaign?.phase === 'planned') { doAction(s, 'check'); doAction(s, 'polish'); doAction(s, 'polish'); }
      if (!(s.intel.reward && s.intel.hated)) doAction(s, 'intel');
      for (const it of [...s.inbox]) {
        const ev = EVENTS[it.eventId];
        const a = ev.options.map((o, k) => ({ o, k })).filter(({ o }) => o.ap <= s.ap);
        if (a.length) chooseOption(s, it.uid, a.sort((x, y) => y.o.ap - x.o.ap)[0].k);
      }
      while (s.ap > 0 && s.pendingReports > 0) doAction(s, 'report');
      endDay(s);
    }
    for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += goalValue(s, k) / N;
  }
  console.log(diff, Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +v.toFixed(1)])));
}
