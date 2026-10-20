// 個人風格檢查:等級換算、跨局累積與上限、帶進一局、讀檔過濾、熟練度的實際效果
import { PERSONA_RUN_CAP, mergePersona, personaLevel, personaLevels, personaTitle, sanitizePersona } from '../src/persona';
import { endDay, EVENTS, chooseOption, eventOptions, moodOf, newGame, load, save } from '../src/engine';
import { decodeCard, encodeCard } from '../src/colleague';
import { optionCost } from '../src/engine';
import type { State } from '../src/types';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
};
let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) { failed++; console.error('❌ ' + m); } };

ok(personaLevel(0) === 0 && personaLevel(7) === 0 && personaLevel(8) === 1 && personaLevel(24) === 2 && personaLevel(48) === 3, '等級門檻不對');
const m = mergePersona({ rigor: 6 }, { rigor: 30, fast: 3 });
ok(m.next.rigor === 6 + PERSONA_RUN_CAP, '單局上限沒生效');
ok(m.lines.some((l) => l.includes('升到 Lv1')), '升級說明沒出現');
ok(personaTitle({}) === undefined && personaTitle({ rigor: 8 })?.title === '愛查證的人', '稱號不對');
ok(JSON.stringify(personaLevels({ rigor: 25, open: 3 })) === '{"rigor":2}', '帶進一局的等級不對');
const bad = sanitizePersona({ rigor: 'x', open: -3, evil: 99, fast: 1e12 }, 100);
ok(Object.keys(bad).join() === 'fast' && bad.fast === 100, '讀檔過濾不對:' + JSON.stringify(bad));

// 存檔往返
const s0 = newGame('story', 'normal', 7, 1, [], {}, { rigor: 2 });
chooseOption(s0, s0.inbox[0].uid, 0);
save(s0);
const back = load() as State;
ok(back.persona?.rigor === 2 && !!back.styleUse, '存檔後風格資料遺失');

// 熟練度效果:Lv3 的 rigor 在有風險的 rigor 選項上,成功率明顯高於沒練過
const NEUTRAL = ((): number => { for (let v = 1; ; v++) if (moodOf({ uid: 0, eventId: 'e_adhoc_roi', arrived: 1, deadline: 1, v }, EVENTS.e_adhoc_roi) === 'neutral') return v; })();
function rate(level: number): number {
  let win = 0; const N = 3000;
  for (let i = 0; i < N; i++) {
    const s = newGame('story', 'normal', 100 + i, 1, [], {}, level ? { fast: level } : {});
    s.inbox = [{ uid: 99, eventId: 'e_adhoc_roi', arrived: 1, deadline: 9, v: NEUTRAL }];
    const idx = eventOptions(s, EVENTS.e_adhoc_roi, s.inbox[0]).findIndex((o) => o.label.startsWith('快速抓個大概'));
    const b = s.boss; s.ap = 6; chooseOption(s, 99, idx); if (s.boss > b) win++;
  }
  return win / N;
}
const r0 = rate(0), r3 = rate(3);
console.log(`快速做法成功率:沒練過 ${r0.toFixed(2)} → Lv3 ${r3.toFixed(2)}`);
ok(r3 - r0 > 0.08 && r3 - r0 < 0.2, `Lv3 加成幅度不在預期內:${(r3 - r0).toFixed(2)}`);

/* ---------- 同事卡 ---------- */
const pts = { rigor: 30, open: 9, fast: 3 };
const code = encodeCard(pts)!;
console.log('同事卡代碼:', code);
ok(/^OPS(-[0-9A-Z]{4})+$/.test(code), '代碼格式不對:' + code);
const dec = decodeCard(code);
ok(dec?.style === 'rigor' && dec.level === 2 && dec.title === '查證派', '解碼結果不對:' + JSON.stringify(dec));
ok(decodeCard(code.toLowerCase().replace(/-/g, ' '))?.style === 'rigor', '大小寫與分隔符號應該被容忍');
ok(encodeCard({ rigor: 3 }) === null, '沒有稱號不該產生卡');
const flip = code.slice(0, 6) + (code[6] === 'A' ? 'B' : 'A') + code.slice(7);
ok(decodeCard(flip) === null, '改過的代碼應該被擋下');
ok(decodeCard('') === null && decodeCard('OPS-1234') === null && decodeCard('隨便打') === null, '壞代碼沒被擋下');
// 全部風格最高點也能編解碼
ok(decodeCard(encodeCard({ open: 99, private: 99, quiet: 99, generous: 99, rigor: 99, fast: 99, hustle: 99 })!)?.level === 3, '最高點數編解碼失敗');

// 同事幫忙:擅長的做法少花 1 點,每天一次(Lv3 兩次);沒有同事不受影響
const mkCol = (level: number): State => {
  const s = newGame('story', 'normal', 11, 1, [], {}, {}, { style: 'rigor', level, title: 't' });
  s.inbox = [
    { uid: 90, eventId: 'e_adhoc_roi', arrived: 1, deadline: 9, v: NEUTRAL },
    { uid: 91, eventId: 'e_weekly', arrived: 1, deadline: 9, v: NEUTRAL },
    { uid: 92, eventId: 'e_audit', arrived: 1, deadline: 9, v: NEUTRAL },
  ];
  s.ap = 12; return s;
};
const rigorIdx = (s: State, uid: number): number => { const it = s.inbox.find((i) => i.uid === uid)!; return eventOptions(s, EVENTS[it.eventId], it).findIndex((o) => o.style === 'rigor'); };
const costOf = (s: State, uid: number): number => { const it = s.inbox.find((i) => i.uid === uid)!; return optionCost(s, it, eventOptions(s, EVENTS[it.eventId], it)[rigorIdx(s, uid)]); };
const c1 = mkCol(1);
const before = costOf(c1, 90);
ok(before === EVENTS.e_adhoc_roi.options.find((o) => o.style === 'rigor')!.ap - 1, '同事沒有讓擅長的做法少花 1 點');
chooseOption(c1, 90, rigorIdx(c1, 90));
ok(costOf(c1, 91) === EVENTS.e_weekly.options.find((o) => o.style === 'rigor')!.ap, '同事一天應該只幫一次');
const c3 = mkCol(3);
chooseOption(c3, 90, rigorIdx(c3, 90));
ok(costOf(c3, 91) === EVENTS.e_weekly.options.find((o) => o.style === 'rigor')!.ap, '同事不分等級,一天都只幫一次');
c3.day++; c3.inbox.forEach((i) => { i.deadline = 99; });
ok(costOf(c3, 91) === EVENTS.e_weekly.options.find((o) => o.style === 'rigor')!.ap - 1, '隔天同事應該又能幫忙');
const none = newGame('story', 'normal', 11, 1, []);
ok(none.colleague === undefined, '沒帶同事卻有同事');

// 同事闖禍:幾局下來一定會出現對應的事件,而且是他擅長的那一種
let trouble = 0;
for (let k = 0; k < 40; k++) {
  const s = newGame('story', 'normal', 700 + k, 1, [], {}, {}, { style: 'hustle', level: 3, title: 't' });
  for (let d = 0; d < 8 && !s.over; d++) { if (s.inbox.some((i) => i.eventId === 'col_hustle')) { trouble++; break; } s.inbox = []; endDay(s); }
}
console.log(`同事闖禍:40 局裡 ${trouble} 局出現`);
ok(trouble >= 20 && trouble <= 40, '同事闖禍的頻率不在預期內:' + trouble);

// 同事專屬事件:沒帶同事絕不出現;帶了之後會出現,且風格專屬的只在對應風格出現
const colIds = Object.values(EVENTS).filter((e) => e.colleague).map((e) => e.id);
let withoutMate = 0, withMate = 0; const wrongStyle: string[] = [];
for (let k = 0; k < 60; k++) {
  const a = newGame('story', 'normal', 900 + k, 1, []);
  const b = newGame('story', 'normal', 900 + k, 1, [], {}, {}, { style: 'rigor', level: 2, title: 't' });
  for (let d = 0; d < 9; d++) {
    if (a.inbox.some((i) => colIds.includes(i.eventId))) withoutMate++;
    for (const i of b.inbox) { const e = EVENTS[i.eventId]; if (e.colleague) { withMate++; if (e.colStyle && e.colStyle !== 'rigor') wrongStyle.push(e.id); } }
    a.inbox = []; b.inbox = []; endDay(a); endDay(b);
  }
}
console.log(`同事專屬事件:沒帶同事 ${withoutMate} 次;帶同事 60 局共 ${withMate} 次`);
ok(withoutMate === 0, '沒帶同事卻出現同事專屬事件');
ok(withMate >= 60 && wrongStyle.length === 0, '帶同事時專屬事件頻率或風格不對:' + withMate + wrongStyle.join());
// 同事專屬事件可以揭露老闆或社群性格
const rv = newGame('story', 'normal', 5, 1, [], {}, {}, { style: 'private', level: 1, title: 't' });
rv.inbox = [{ uid: 70, eventId: 'col_g_lunch', arrived: 1, deadline: 9, v: NEUTRAL }]; rv.ap = 6;
let learned = false;
for (let k = 0; k < 30 && !learned; k++) { const c = JSON.parse(JSON.stringify(rv)) as State; c.rng = k * 977 + 3; chooseOption(c, 70, eventOptions(c, EVENTS.col_g_lunch, c.inbox[0]).findIndex((o) => o.style === 'private')); learned = !!c.traits?.known.boss; }
ok(learned, '同事的消息應該能揭露老闆性格');

// 存檔往返
save(c3); const back2 = load() as State;
ok(back2.colleague?.style === 'rigor' && back2.colleague.level === 3, '存檔後同事資料遺失');

console.log(failed ? `❌ ${failed} 項失敗` : '✅ 個人風格檢查全部通過');
if (failed) throw new Error('個人風格檢查失敗');
