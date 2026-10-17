// 答案翻轉率:同一個事件,在不同的隱藏性格與氣氛下,「最好的選項」會不會換人
import { EVENTS } from '../src/engine';
import { BOSS_TRAITS, COMMUNITY_TRAITS, MOOD_LEVELS } from '../src/traits';
import type { GameEvent, Outcome, Style } from '../src/types';

const goodness = (o: Outcome): number => (o.effects?.trust ?? 0) + (o.effects?.boss ?? 0) + (o.effects?.retention ?? 0) + (o.effects?.players ?? 0) * 0.5;

function mainStat(ev: GameEvent): 'trust' | 'boss' {
  let player = 0; let boss = 0;
  for (const o of ev.options) for (const x of o.outcomes) {
    player += Math.abs(x.effects?.trust ?? 0) + Math.abs(x.effects?.players ?? 0) * 0.5 + Math.abs(x.effects?.retention ?? 0);
    boss += Math.abs(x.effects?.boss ?? 0);
  }
  return player > boss ? 'trust' : 'boss';
}

function value(o: { outcomes: Outcome[]; style?: Style }, total: number): number {
  const outs = o.outcomes.map((x) => ({ p: x.p, g: goodness(x) }));
  if (outs.length > 1 && total) {
    const best = outs.reduce((a, b) => (b.g > a.g ? b : a)); const worst = outs.reduce((a, b) => (b.g < a.g ? b : a));
    const m = total > 0 ? Math.min(total * 0.06, worst.p) : -Math.min(-total * 0.06, best.p);
    best.p += m; worst.p -= m;
  }
  return outs.reduce((a, x) => a + x.p * x.g, 0) + total;
}

let n = 0; let flipTrait = 0; let flipAll = 0; let tagged = 0; const dist: Record<string, number> = {};
for (const ev of Object.values(EVENTS)) {
  if (ev.kind === '插曲' || ev.options.length < 2) continue;
  n++;
  const table = mainStat(ev) === 'boss' ? BOSS_TRAITS : COMMUNITY_TRAITS;
  const argmaxes = new Set<number>(); const argmaxesNeutral = new Set<number>();
  for (const t of Object.values(table)) {
    for (const [mood, ml] of Object.entries(MOOD_LEVELS)) {
      const vals = ev.options.map((o) => {
        const total = o.style ? Math.max(-3, Math.min(3, (t.levels[o.style] ?? 0) + (ml[o.style] ?? 0))) : 0;
        return value(o, total) - (o.ap > 0 ? 0 : 0);
      });
      const best = vals.indexOf(Math.max(...vals));
      argmaxes.add(best);
      if (mood === 'neutral') argmaxesNeutral.add(best);
    }
  }
  if (argmaxesNeutral.size > 1) flipTrait++;
  if (argmaxes.size > 1) flipAll++;
  dist[argmaxes.size] = (dist[argmaxes.size] ?? 0) + 1;
  if (ev.options.some((o) => o.style)) tagged++;
}
console.log(`事件 ${n} 個(有做法標記的 ${tagged} 個)`);
console.log(`只靠隱藏性格,最佳選項會換人的事件:${flipTrait}(${Math.round((flipTrait / n) * 100)}%)`);
console.log(`加上氣氛,最佳選項會換人的事件:${flipAll}(${Math.round((flipAll / n) * 100)}%);最佳選項有幾種:`, dist);
