import { newGame, endDay } from '../src/engine';
for (const d of ['easy', 'normal', 'hard'] as const) {
  const s = newGame('story', d, 7);
  while (!s.over) { s.inbox = []; endDay(s); }
  const reg = Object.entries(s.seen).filter(([k]) => !k.startsWith('c_') && k !== 'e_weekly');
  const chain = Object.entries(s.seen).filter(([k]) => k.startsWith('c_'));
  console.log(d, '一般事件種類', reg.length, '單一最多', Math.max(...reg.map(([, n]) => n)), '次;連鎖事件', JSON.stringify(Object.fromEntries(chain)));
}
