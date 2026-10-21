import { newGame, chooseOption, planCampaign, doAction, endDay, goalMet, EVENTS, eventOptions, optionCost } from '../src/engine';
import type { Difficulty, State } from '../src/types';

// 「普通玩家」:每件事選中間價位或較便宜的選項,留一點點行動點數給活動;不是最佳解也不亂選
function play(diff: Difficulty, seed: number, style: 'mid' | 'thrifty' | 'careful'): State {
  const s = newGame('story', diff, seed, 5);
  let g = 0;
  while (!s.over && g++ < 100) {
    if ((!s.campaign || s.campaign.phase === 'done') && s.day >= 2 && s.ap >= 3)
      planCampaign(s, { mechanic: 'dungeon', reward: 'skin', bundle: 'skinpack', promo: 'social', delay: 3 });
    if (s.campaign?.phase === 'planned' && s.ap >= 1) { doAction(s, 'check'); if (s.ap >= 2) doAction(s, 'polish'); }
    const sorted = [...s.inbox].sort((a, b) => a.deadline - b.deadline);
    for (const it of sorted) {
      const opts = eventOptions(s, EVENTS[it.eventId]).map((o, i) => ({ i, c: optionCost(s, it, o), good: o.outcomes.reduce((a, x) => a + x.p * ((x.effects?.trust ?? 0) + (x.effects?.boss ?? 0)), 0) }));
      const ok = opts.filter((o) => o.c <= s.ap);
      if (!ok.length) continue;
      const pick = style === 'thrifty' ? ok.sort((a, b) => a.c - b.c)[0] : ok.sort((a, b) => b.good / (1 + b.c) - a.good / (1 + a.c))[0];
      chooseOption(s, it.uid, pick.i);
    }
    while (s.ap > 0 && s.pendingReports > 0) doAction(s, 'report');
    endDay(s);
  }
  return s;
}

for (const diff of ['easy', 'normal', 'hard'] as const) {
  for (const style of ['thrifty', 'mid', 'careful'] as const) {
    const N = 60; let all = 0, met = 0, total = 0, fired = 0; const t: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const s = play(diff, 3000 + i, style);
      const m = s.goals.filter((g) => goalMet(s, g)).length; total = s.goals.length; met += m; if (m === total) all++;
      if (s.boss <= 0 || s.trust <= 0) fired++;
      const k = s.over?.title ?? '?'; t[k] = (t[k] ?? 0) + 1;
    }
    console.log(`[${diff}] ${style.padEnd(8)} 全達成 ${String(Math.round((all / N) * 100)).padStart(3)}%  平均 ${(met / N).toFixed(1)}/${total}  中途失敗 ${fired}`, t);
  }
}
