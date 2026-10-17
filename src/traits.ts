import type { Style } from './types';

/** 每一局開頭抽好、整局不變的隱藏性格:決定哪一種做法比較吃香。玩家要從反應裡慢慢摸出來 */
export type BossTrait = 'data' | 'bold' | 'safe';
export type CommunityTrait = 'angry' | 'kind' | 'picky';
export type Mood = 'receptive' | 'neutral' | 'hostile';

type Levels = Partial<Record<Style, number>>;

export const STYLE_NAME: Record<Style, string> = {
  open: '公開透明', private: '私下溝通', quiet: '低調處理', generous: '補償讓步', rigor: '查證講證據', fast: '快速簡化', hustle: '親自硬扛',
};

export interface TraitInfo<L extends string> { id: L; name: string; desc: string; levels: Levels; good: string; bad: string }

export const BOSS_TRAITS: Record<BossTrait, TraitInfo<BossTrait>> = {
  data: { id: 'data', name: '數據派', desc: '林總偏愛有數據、有查證的做法,討厭含糊帶過。',
    levels: { rigor: 2, open: 1, quiet: -1, fast: -1 },
    good: '林總點點頭:「有數字就好說。」', bad: '林總皺眉:「數字呢?依據在哪?」' },
  bold: { id: 'bold', name: '衝勁派', desc: '林總偏愛快速、敢衝的做法,嫌太慢太保守。',
    levels: { fast: 2, hustle: 1, generous: 1, rigor: -1, quiet: -1 },
    good: '林總眼睛一亮:「對,就是要這種速度。」', bad: '林總看了看錶:「會不會太慢了?」' },
  safe: { id: 'safe', name: '穩健派', desc: '林總偏愛穩妥、守規矩的做法,不喜歡冒險。',
    levels: { rigor: 1, quiet: 1, open: 1, hustle: -1, fast: -1, generous: -1 },
    good: '林總鬆了口氣:「這樣比較穩。」', bad: '林總皺了一下眉:「這樣風險會不會太大?」' },
};

export const COMMUNITY_TRAITS: Record<CommunityTrait, TraitInfo<CommunityTrait>> = {
  angry: { id: 'angry', name: '愛抱怨', desc: '玩家社群脾氣大,吃有誠意的補償與私下溝通,最討厭被敷衍。',
    levels: { private: 1, generous: 1, hustle: 1, open: -1, quiet: -2 },
    good: '有玩家留言:「至少看得到誠意。」', bad: '玩家回得很衝:「又是官腔!」' },
  kind: { id: 'kind', name: '好說話', desc: '玩家社群很包容,願意聽公開說明,太大方反而讓人覺得好欺負。',
    levels: { open: 1, generous: -1 },
    good: '玩家說:「好啦,謝謝說明。」', bad: '有人在討論:「官方會不會太好說話了?」' },
  picky: { id: 'picky', name: '愛追究', desc: '玩家社群愛追根究柢,要看到證據與查證,私下處理和含糊帶過都不買單。',
    levels: { rigor: 2, open: 1, private: -1, generous: -1, fast: -1, quiet: -2 },
    good: '有玩家認真看完後說:「這次有憑有據。」', bad: '玩家追問:「證據呢?你們怎麼查的?」' },
};

/** 這件事當下的氣氛(每一件事各自抽):同樣的做法,對氣在頭上的人和願意聽的人效果不同 */
export const MOOD_LEVELS: Record<Mood, Levels> = {
  receptive: { open: 1, fast: 1 },
  neutral: {},
  hostile: { private: 1, generous: 1, open: -1, quiet: -1, fast: -1 },
};

export const MOOD_FLAVOR: Record<Exclude<Mood, 'neutral'>, { good: string; bad: string }> = {
  receptive: { good: '對方聽得很專心。', bad: '對方沒聽進去,好像有點白費力氣。' },
  hostile: { good: '對方的語氣緩和了一些。', bad: '對方的火氣好像更大了。' },
};

/** 事件文字裡藏的氣氛線索:有時候會出現,出現了就是真的 */
export const MOOD_CLUES = {
  player: { receptive: ['語氣還算客氣。', '看得出來對方願意聽聽官方怎麼說。'], hostile: ['訊息裡的驚嘆號特別多。', '對方明顯在氣頭上。'] },
  inner: { receptive: ['對方今天心情看起來不錯。', '氣氛看起來還算輕鬆。'], hostile: ['對方看起來有點急。', '對方的語氣很不耐煩。'] },
} as const;
