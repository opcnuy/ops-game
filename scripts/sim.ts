import { pickCard, newGame, chooseOption, pickScout, styleFit, planCampaign, doAction, endDay, goalMet, EVENTS, eventOptions, optionCost } from '../src/engine';
import { scoutCard } from '../src/scout';
import type { Difficulty, State } from '../src/types';

declare const process: { env: Record<string, string | undefined> };

// localStorage 在 Node 不存在,引擎的存檔函式只在瀏覽器呼叫,這裡不用處理

function play(strategy: 'random' | 'careful' | 'lazy', diff: Difficulty, seed: number, level = 5, skills: string[] = []): State {
  const s = newGame('story', diff, seed, level, skills, {}, {}, undefined, undefined, process.env.ROLE ?? 'intern', process.env.CURSE || undefined);
  let guard = 0;
  while (!s.over && guard++ < 100) {
    while (s.cardPick) pickCard(s, process.env.CARD && s.cardPick.includes(process.env.CARD) ? process.env.CARD : s.cardPick[Math.floor(Math.random() * s.cardPick.length)]);
    if (strategy !== 'lazy') {
      if (!s.campaign || s.campaign.phase === 'done') {
        if (s.day >= 2 && s.ap >= 3) {
          planCampaign(s, strategy === 'careful'
            ? (level >= 2
              ? { mechanic: 'dungeon', reward: 'skin', bundle: 'skinpack', promo: 'social', delay: Number(process.env.DELAY ?? 3) }
              : { mechanic: 'lottery', reward: 'shard', bundle: 'starter', promo: 'notice', delay: Number(process.env.DELAY ?? 3) })
            : { mechanic: 'signin', reward: 'material', bundle: 'none', promo: 'none', delay: Number(process.env.DELAY ?? 2) });
        }
      }
      if (strategy === 'careful') {
        if (s.campaign?.phase === 'planned') { doAction(s, 'check'); doAction(s, 'polish'); doAction(s, 'polish'); }
        // LOOK=daily:每天都看輿情(選一張不壞、最划算的卡);預設只在還沒摸清喜好時看
        if ((process.env.LOOK === 'daily' || !(s.intel.reward && s.intel.hated)) && doAction(s, 'intel') === null && s.scout) {
          const pick = s.scout.cards.map((id) => scoutCard(id)!).filter((c) => !c.bad && c.ap <= s.ap).sort((a, b) => a.ap - b.ap)[0];
          pickScout(s, pick?.id ?? null);
        }
      }
      // 處理收件匣:careful 選最便宜的有效選項,random 隨機(突發事件會中途冒出來,所以多掃幾輪)
      for (let pass = 0; pass < 3; pass++) for (const it of [...s.inbox]) {
        const ev = EVENTS[it.eventId];
        const affordable = eventOptions(s, ev).map((o, i) => ({ o: { ...o, ap: optionCost(s, it, o) }, i })).filter(({ o }) => o.ap <= s.ap);
        if (!affordable.length) continue;
        // INFORMED=1:知道這局的隱藏性格,優先挑契合度高的做法(其次才看花多少點)
        const fitOf = (o: typeof affordable[number]['o']): number => (process.env.INFORMED ? styleFit(s, ev, it, o).total : 0);
        const pick = strategy === 'careful'
          ? affordable.sort((a, b) => fitOf(b.o) - fitOf(a.o) || b.o.ap - a.o.ap)[0]
          : affordable[Math.floor(Math.random() * affordable.length)];
        chooseOption(s, it.uid, pick.i);
      }
      while (s.ap > 0 && s.pendingReports > 0) doAction(s, 'report');
    }
    endDay(s);
  }
  return s;
}

const BUILD = ['quick_report', 'soothe', 'crisis_pr', 'auto_report', 'risk_ctrl', 'time_mgmt', 'forecast'];
for (const skills of [[], BUILD]) for (const diff of (process.env.EASY ? ['easy', 'normal', 'hard'] : ['normal', 'hard']) as ('easy' | 'normal' | 'hard')[]) {
  const level = 5;
  for (const strat of ['careful'] as const) {
    const N = 60;
    const tally: Record<string, number> = {};
    let allMet = 0, metSum = 0, total = 0;
    for (let i = 0; i < N; i++) {
      const s = play(strat, diff, 1000 + i, level, skills);
      tally[s.over?.title ?? '(未結束)'] = (tally[s.over?.title ?? '(未結束)'] ?? 0) + 1;
      const met = s.goals.filter((g) => goalMet(s, g)).length;
      total = s.goals.length; metSum += met; if (met === total) allMet++;
    }
    console.log(`[${skills.length ? '有技能' : '無技能'} ${diff}] ${strat.padEnd(7)} 全達成 ${String(Math.round((allMet / N) * 100)).padStart(3)}%  平均達成 ${(metSum / N).toFixed(1)}/${total}`, tally);
  }
}
