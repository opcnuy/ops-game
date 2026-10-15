export type SkillLine = 'data' | 'comm' | 'proj';

export interface Skill {
  id: string;
  line: SkillLine;
  name: string;
  icon: string;
  /** 在技能樹的第幾層(1 = 起點) */
  tier: 1 | 2 | 3;
  cost: number;
  desc: string;
  /** 前置技能:全部學會才能學 */
  requires?: string[];
  /** 前置技能:學會其中任一個就能學 */
  requiresAny?: string[];
}

export const LINES: Record<SkillLine, { icon: string; label: string; blurb: string }> = {
  data: { icon: '📊', label: '數據分析', blurb: '看懂數字,少走冤枉路' },
  comm: { icon: '🤝', label: '玩家溝通', blurb: '安撫玩家,化解輿情' },
  proj: { icon: '🧭', label: '專案管理', blurb: '省時間,控風險' },
};

export const SKILLS: Skill[] = [
  { id: 'quick_report', line: 'data', tier: 1, icon: '📈', name: '快速報表', cost: 1, desc: '「快速抓個大概」這類選項,出錯的機率降低。' },
  { id: 'data_unify', line: 'data', tier: 2, icon: '🧮', name: '口徑統一', cost: 2, requires: ['quick_report'], desc: '數據、報表類事件的選項,都少花 1 點。' },
  { id: 'template', line: 'data', tier: 2, icon: '🗂️', name: '報表範本庫', cost: 2, requires: ['quick_report'], desc: '數據、報表類事件多一個選項:用範本快速出表。' },
  { id: 'forecast', line: 'data', tier: 3, icon: '🔮', name: '預測模型', cost: 3, requiresAny: ['data_unify', 'template'], desc: '規劃活動時,會顯示預估的營收提升範圍。' },

  { id: 'soothe', line: 'comm', tier: 1, icon: '🕊️', name: '安撫話術', cost: 1, desc: '客訴、輿情事件裡,有風險的選項成功率提高。' },
  { id: 'advocate', line: 'comm', tier: 2, icon: '📣', name: '玩家代言人', cost: 2, requires: ['soothe'], desc: '客訴、輿情事件多一個選項:請核心玩家出面說明。' },
  { id: 'crisis_pr', line: 'comm', tier: 2, icon: '🚒', name: '危機公關', cost: 2, requires: ['soothe'], desc: '逾期後再次催辦的事,處理不用多花 1 點。' },
  { id: 'social_sense', line: 'comm', tier: 3, icon: '📡', name: '社群敏銳', cost: 3, requiresAny: ['advocate', 'crisis_pr'], desc: '「看輿情」一次就揭露兩項玩家情報。' },

  { id: 'auto_report', line: 'proj', tier: 1, icon: '🤖', name: '日報自動化', cost: 1, desc: '認真填日報不花點數。' },
  { id: 'risk_ctrl', line: 'proj', tier: 2, icon: '🛡️', name: '風險控管', cost: 2, requires: ['auto_report'], desc: '活動上線出問題的機率減半。' },
  { id: 'network', line: 'proj', tier: 2, icon: '📞', name: '跨部門人脈', cost: 2, requires: ['auto_report'], desc: '技術、原廠類事件多一個選項:找熟人幫忙。' },
  { id: 'time_mgmt', line: 'proj', tier: 3, icon: '⏳', name: '時間管理', cost: 3, requiresAny: ['risk_ctrl', 'network'], desc: '每天多 1 點行動點數。' },
];

export const skillById = (id: string): Skill | undefined => SKILLS.find((s) => s.id === id);

/** 這個技能的前置條件,目前有沒有滿足 */
export function prereqMet(k: Skill, owned: string[]): boolean {
  if (k.requires && !k.requires.every((id) => owned.includes(id))) return false;
  if (k.requiresAny && !k.requiresAny.some((id) => owned.includes(id))) return false;
  return true;
}

/** 前置條件說明文字,給玩家看 */
export function prereqText(k: Skill): string {
  if (k.requires) return `需先學會「${k.requires.map((id) => skillById(id)?.name ?? id).join('」「')}」`;
  if (k.requiresAny) return `需先學會「${k.requiresAny.map((id) => skillById(id)?.name ?? id).join('」或「')}」其中一個`;
  return '';
}

/** 移除前置條件已經不成立的技能(取消某個技能時,依賴它的會一併取消) */
export function sanitizeSkills(owned: string[]): string[] {
  let cur = owned.filter((id) => skillById(id));
  for (;;) {
    const next = cur.filter((id) => prereqMet(skillById(id) as Skill, cur));
    if (next.length === cur.length) return cur;
    cur = next;
  }
}

export interface Achievement { id: string; name: string; desc: string }

/** 每個成就第一次達成時,給 1 點技能點 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: '首次轉正', desc: '劇情模式成功轉正' },
  { id: 'perfect', name: '表現優秀', desc: '劇情模式以「正式轉正(表現優秀)」結束' },
  { id: 'hard_win', name: '困難通關', desc: '在困難難度成功轉正' },
  { id: 'campaign_hit', name: '活動達標', desc: '有一檔活動達到老闆的營收目標' },
  { id: 'endless20', name: '長期抗戰', desc: '無限模式撐過 20 天' },
];
