// 個人風格檢查:等級換算、跨局累積與上限、帶進一局、讀檔過濾、熟練度的實際效果
import { PERSONA_RUN_CAP, mergePersona, personaLevel, personaLevels, personaTitle, sanitizePersona } from '../src/persona';
import { EVENTS, chooseOption, eventOptions, moodOf, newGame, load, save } from '../src/engine';
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

console.log(failed ? `❌ ${failed} 項失敗` : '✅ 個人風格檢查全部通過');
if (failed) throw new Error('個人風格檢查失敗');
