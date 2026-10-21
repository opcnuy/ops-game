/** 策略:升級時三選一,可疊到 5 級,常駐、每天自動生效。每張都有好處,也有代價 */
export type Tone = 'gold' | 'red' | 'blue' | 'green';
export type Theme = 'trust' | 'revenue' | 'boss' | 'data' | 'grind' | 'steady' | 'community' | 'speed' | 'risk';
export const THEME_LABEL: Record<Theme, string> = { trust: '口碑', revenue: '營收', boss: '討好老闆', data: '數據', grind: '撐場', steady: '穩守', community: '社群', speed: '速度', risk: '賭運' };

export interface Strategy {
  id: string;
  icon: string;
  name: string;
  tone: Tone;
  /** 路線:決定遊戲會怎麼針對你的打法出題 */
  theme: Theme;
  max: number;
  /** 在檔案室解鎖要多少資歷(0 = 一開始就有) */
  cost: number;
  /** 純好型:沒有代價,效果比較小 */
  pure?: boolean;
  /** 效果要靠活動才發揮:劇情後期(活動來不及辦了)就不再出現 */
  needsCampaign?: boolean;
  /** 進化策略:需要這些策略都達到指定等級 */
  evolve?: { from: [string, number][]; };
  good: (lv: number) => string;
  bad: (lv: number) => string;
}

const pct = (n: number): string => `${Math.round(n)}%`;

export const STRATEGIES: Strategy[] = [
  { id: 'trust_first', icon: '🤝', name: '口碑第一', tone: 'gold', theme: 'trust', max: 5, cost: 0,
    good: (l) => `信任增加 +${pct(l * 15)}`, bad: (l) => `活動營收 -${pct(l * 6)}` },
  { id: 'revenue', icon: '💰', name: '衝營收', tone: 'red', theme: 'revenue', max: 5, cost: 0, needsCampaign: true,
    good: (l) => `活動營收 +${pct(l * 15)}`, bad: (l) => `每 2 天信任 -${Math.ceil(l / 2)}` },
  { id: 'lowkey', icon: '🤫', name: '低調運營', tone: 'blue', theme: 'steady', max: 5, cost: 0,
    good: (l) => `逾期處罰 -${pct(l * 12)}`, bad: (l) => `活動營收 -${pct(l * 4)}` },
  { id: 'all_hands', icon: '🔔', name: '全員待命', tone: 'red', theme: 'grind', max: 5, cost: 50,
    good: (l) => `行動點數 +${l >= 4 ? 2 : 1}`, bad: (l) => `逾期處罰 +${pct(l * 20)}` },
  { id: 'data_driven', icon: '📊', name: '數據導向', tone: 'blue', theme: 'data', max: 5, cost: 40,
    good: (l) => `日報免費,答對老闆 +${l}`, bad: (l) => `人數成長 -${(l * 0.05).toFixed(2)}%/天` },
  { id: 'boss_pet', icon: '🎩', name: '老闆親信', tone: 'gold', theme: 'boss', max: 5, cost: 60,
    good: (l) => `老闆好感增加 +${pct(l * 20)}`, bad: (l) => `信任增加 -${pct(l * 8)}` },
  { id: 'shield', icon: '🛡️', name: '公關盾', tone: 'green', theme: 'trust', max: 5, cost: 40,
    good: (l) => `信任與老闆的損失 -${pct(l * 10)}`, bad: (l) => `信任增加 -${pct(l * 5)}` },
  { id: 'insight', icon: '🔭', name: '洞察力', tone: 'green', theme: 'data', max: 5, cost: 50,
    good: (l) => (l >= 3 ? '每天自動掌握風向' : l === 2 ? '開局摸清老闆與社群' : '開局摸清老闆性格'), bad: (l) => `人數成長 -${(l * 0.04).toFixed(2)}%/天` },
  { id: 'campaign_pro', icon: '🎪', name: '活動專家', tone: 'gold', theme: 'revenue', max: 5, cost: 50, needsCampaign: true,
    good: (l) => `上線出問題 -${pct(l * 15)}`, bad: (l) => (l >= 3 ? '規劃活動多 1 點' : '規劃活動無額外代價') },
  { id: 'community', icon: '📣', name: '社群經營', tone: 'green', theme: 'community', max: 5, cost: 50,
    good: (l) => `輿情發現卡的效果 +${pct(l * 25)}`, bad: (l) => `週報被點名的處罰 +${pct(l * 20)}` },
  { id: 'hype_team', icon: '🎆', name: '話題製造機', tone: 'red', theme: 'community', max: 5, cost: 50, needsCampaign: true,
    good: (l) => `活動上線的人數成長 +${pct(l * 25)}`, bad: (l) => `活動上線時留存 -${(l * 0.3).toFixed(1)}` },
  { id: 'frugal', icon: '🧾', name: '精打細算', tone: 'blue', theme: 'revenue', max: 5, cost: 40, needsCampaign: true,
    good: (l) => `活動後的消費透支 -${pct(l * 20)}`, bad: (l) => `活動營收 -${pct(l * 3)}` },
  { id: 'tutor', icon: '🎓', name: '傳幫帶', tone: 'gold', theme: 'data', max: 5, cost: 60,
    good: (l) => `經驗 +${pct(l * 15)}`, bad: (l) => `老闆好感增加 -${pct(l * 5)}` },
  // 純好型:沒有代價,效果比較小
  { id: 'notes', icon: '📝', name: '筆記術', tone: 'green', theme: 'data', max: 5, cost: 0, pure: true,
    good: (l) => `經驗 +${pct(l * 8)}`, bad: () => '' },
  { id: 'quick_reply', icon: '⚡', name: '快速回覆', tone: 'green', theme: 'trust', max: 5, cost: 30, pure: true,
    good: (l) => `客訴、輿情處理成功率 +${pct(l * 4)}`, bad: () => '' },
  { id: 'checklist', icon: '✅', name: '檢核表', tone: 'green', theme: 'revenue', max: 5, cost: 30, needsCampaign: true, pure: true,
    good: (l) => `活動上線出問題 -${pct(l * 8)}`, bad: () => '' },
  { id: 'allies', icon: '🫂', name: '盟友', tone: 'green', theme: 'trust', max: 5, cost: 40, pure: true,
    good: (l) => `信任增加 +${pct(l * 4)}`, bad: () => '' },
  { id: 'lucky', icon: '🍀', name: '好運', tone: 'green', theme: 'risk', max: 5, cost: 40, pure: true,
    good: (l) => `不確定結果的成功率 +${pct(l * 2)}`, bad: () => '' },
  // 更多路線
  { id: 'sprint', icon: '🏃', name: '衝刺', tone: 'red', theme: 'speed', max: 5, cost: 50,
    good: (l) => `每天前 ${l >= 3 ? 2 : 1} 個事件選項少花 1 點`, bad: (l) => `事件的好處 -${pct(l * 4)}` },
  { id: 'gambler', icon: '🎲', name: '賭徒', tone: 'red', theme: 'risk', max: 5, cost: 60,
    good: (l) => `高風險選項成功率 +${pct(l * 4)},贏了好處 +${pct(l * 10)}`, bad: (l) => `輸了損失 +${pct(l * 15)}` },
  // 從舊技能樹併進來的:都沒有代價,效果各有各的用途
  { id: 'quick_report', icon: '📈', name: '快速報表', tone: 'green', theme: 'data', max: 3, cost: 30, pure: true,
    good: (l) => `「快速抓個大概」類選項成功率 +${pct(l * 8)}`, bad: () => '' },
  { id: 'unify', icon: '🧮', name: '口徑統一', tone: 'green', theme: 'data', max: 1, cost: 40, pure: true,
    good: () => '數據、報表類事件的選項少花 1 點', bad: () => '' },
  { id: 'template', icon: '🗂️', name: '報表範本庫', tone: 'green', theme: 'data', max: 1, cost: 40, pure: true,
    good: () => '數據、報表類事件多一個選項:用範本快速出表', bad: () => '' },
  { id: 'auto_report', icon: '🤖', name: '日報自動化', tone: 'green', theme: 'data', max: 1, cost: 30, pure: true,
    good: () => '認真填日報不花點數', bad: () => '' },
  { id: 'audit_eye', icon: '🔍', name: '數字直覺', tone: 'green', theme: 'data', max: 1, cost: 40, pure: true,
    good: () => '日報答對時,信任額外 +1', bad: () => '' },
  { id: 'advocate', icon: '🗣️', name: '玩家代言人', tone: 'green', theme: 'trust', max: 1, cost: 50, pure: true,
    good: () => '客訴、輿情事件多一個選項:請核心玩家出面說明', bad: () => '' },
  { id: 'crisis_pr', icon: '🚒', name: '危機公關', tone: 'green', theme: 'steady', max: 1, cost: 40, pure: true,
    good: () => '逾期後再次催辦的事,處理不用多花 1 點', bad: () => '' },
  { id: 'buffer', icon: '🕰️', name: '緩衝時間', tone: 'green', theme: 'steady', max: 1, cost: 60, pure: true,
    good: () => '每局第一次事件逾期,對方不追究', bad: () => '' },
  { id: 'network', icon: '📞', name: '跨部門人脈', tone: 'green', theme: 'boss', max: 1, cost: 50, pure: true,
    good: () => '技術、原廠事件多一個選項:找熟人幫忙', bad: () => '' },
  { id: 'social_sense', icon: '📡', name: '社群敏銳', tone: 'green', theme: 'community', max: 1, cost: 50, pure: true,
    good: () => '看輿情一次揭露兩項玩家情報', bad: () => '' },
  { id: 'fan_base', icon: '💞', name: '鐵粉經營', tone: 'green', theme: 'community', max: 1, cost: 50, pure: true,
    good: () => '看輿情帶來的持續狀態多撐 1 天', bad: () => '' },
  // 進化:兩張策略都到 3 級才會出現,取得後常駐
  { id: 'evo_fan', icon: '👑', name: '粉絲團', tone: 'blue', theme: 'trust', max: 1, cost: 100,
    evolve: { from: [['trust_first', 3], ['revenue', 3]] },
    good: () => '信任增加 +50%,活動營收 +30%', bad: () => '無' },
  { id: 'evo_iron', icon: '⚙️', name: '鐵腕', tone: 'blue', theme: 'grind', max: 1, cost: 100,
    evolve: { from: [['all_hands', 3], ['lowkey', 3]] },
    good: () => '行動點數 +1,逾期不再被處罰', bad: () => '無' },
  { id: 'evo_viral', icon: '🚀', name: '病毒式傳播', tone: 'blue', theme: 'community', max: 1, cost: 110, needsCampaign: true,
    evolve: { from: [['hype_team', 3], ['community', 3]] },
    good: () => '活動上線的人數成長 +50%,每天人數 +0.3%', bad: () => '無' },
  { id: 'evo_gambit', icon: '🃏', name: '孤注一擲', tone: 'blue', theme: 'risk', max: 1, cost: 110,
    evolve: { from: [['gambler', 3], ['lucky', 3]] },
    good: () => '高風險選項成功率 +15%,輸了不再多賠', bad: () => '無' },
  { id: 'evo_cash', icon: '🏦', name: '現金流', tone: 'blue', theme: 'revenue', max: 1, cost: 110, needsCampaign: true,
    evolve: { from: [['frugal', 3], ['revenue', 3]] },
    good: () => '活動營收 +40%,不再有消費透支', bad: () => '無' },
  { id: 'evo_mentor', icon: '🧙', name: '資深導師', tone: 'blue', theme: 'data', max: 1, cost: 110,
    evolve: { from: [['tutor', 3], ['shield', 3]] },
    good: () => '經驗 +50%,信任與老闆的損失 -30%', bad: () => '無' },
];

export const strategyById = (id: string): Strategy | undefined => STRATEGIES.find((c) => c.id === id);

/** 這局最多同時帶幾種策略(不含進化) */
export const MAX_SLOTS = 6;

/** 升到第 n 級需要的經驗 */
export const xpNeed = (lv: number): number => 20 + 20 * lv;

/** 職位:開局先拿到的策略(Lv1),其他仍照常升級選 */
export interface Role { id: string; icon: string; name: string; desc: string; cost: number; start?: string; trait: string; traitDesc: string }
export const ROLES: Role[] = [
  { id: 'intern', icon: '🧑‍💼', name: '實習營運', desc: '沒有起手策略', cost: 0, trait: '學得快', traitDesc: '經驗 +10%' },
  { id: 'analyst', icon: '📈', name: '數據分析師', desc: '起手:數據導向', cost: 60, start: 'data_driven', trait: '預測', traitDesc: '活動成績起伏減半' },
  { id: 'support', icon: '🎧', name: '客服主管', desc: '起手:公關盾', cost: 60, start: 'shield', trait: '安撫', traitDesc: '客訴、輿情處理更順(成功率 +15%)' },
  { id: 'planner', icon: '🎪', name: '活動企劃', desc: '起手:活動專家', cost: 90, start: 'campaign_pro', trait: '老手', traitDesc: '每檔活動第一次打磨免費' },
  { id: 'secretary', icon: '🎩', name: '老闆秘書', desc: '起手:老闆親信', cost: 120, start: 'boss_pet', trait: '近水樓台', traitDesc: '開局摸清老闆性格;老闆好感的損失 -20%' },
];
export const roleById = (id: string): Role | undefined => ROLES.find((r) => r.id === id);

/** 一開始就解鎖的項目(策略、進化、職位的 id 通用) */
export const DEFAULT_UNLOCK: string[] = [
  ...STRATEGIES.filter((c) => c.cost === 0).map((c) => c.id),
  ...ROLES.filter((r) => r.cost === 0).map((r) => r.id),
];
/** 全部項目(測試與預設用) */
/** 永久強化:不是策略,是開局就帶著的好處 */
export const PERKS: { id: string; icon: string; name: string; desc: string; cost: number }[] = [
  { id: 'perk_pick', icon: '🧭', name: '人脈網', desc: '每次升級的候選多一張(四選一)', cost: 80 },
];
export const ALL_UNLOCK: string[] = [...STRATEGIES.map((c) => c.id), ...ROLES.map((r) => r.id), ...PERKS.map((x) => x.id)];

/** 檔案室的商品 */
export interface ShopItem { id: string; kind: 'role' | 'strategy' | 'evolve' | 'perk'; icon: string; name: string; desc: string; cost: number }
export const SHOP: ShopItem[] = [
  ...PERKS.map((x): ShopItem => ({ id: x.id, kind: 'perk', icon: x.icon, name: x.name, desc: x.desc, cost: x.cost })),
  ...ROLES.filter((r) => r.cost > 0).map((r): ShopItem => ({ id: r.id, kind: 'role', icon: r.icon, name: r.name, desc: `${r.desc} · ${r.trait}:${r.traitDesc}`, cost: r.cost })),
  ...STRATEGIES.filter((c) => c.cost > 0 && !c.evolve).map((c): ShopItem => ({ id: c.id, kind: 'strategy', icon: c.icon, name: c.name, desc: c.good(1), cost: c.cost })),
  ...STRATEGIES.filter((c) => c.evolve).map((c): ShopItem => ({ id: c.id, kind: 'evolve', icon: c.icon, name: c.name, desc: c.evolve!.from.map(([id, lv]) => `${strategyById(id)?.name ?? id} Lv${lv}`).join(' + '), cost: c.cost })),
];

/** 挑戰:開局可選的額外難度,換取更多資歷 */
export interface Curse { id: string; icon: string; name: string; desc: string; mult: number }
export const CURSES: Curse[] = [
  { id: 'tight', icon: '😮‍💨', name: '人手吃緊', desc: '每天行動點數 -1', mult: 1.8 },
  { id: 'strict', icon: '😠', name: '嚴苛老闆', desc: '老闆好感的損失 +50%', mult: 1.15 },
  { id: 'angry', icon: '🔥', name: '民怨沸騰', desc: '開局信任 -10', mult: 1.5 },
  { id: 'rush', icon: '⏩', name: '趕工季', desc: '每天多一件事', mult: 1.4 },
  { id: 'cheap', icon: '✂️', name: '預算縮減', desc: '活動營收 -20%', mult: 1.15 },
];
export const curseById = (id: string): Curse | undefined => CURSES.find((c) => c.id === id);
