/** 每個成就第一次達成時,給資歷 */
export interface Achievement { id: string; name: string; desc: string }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: '首次轉正', desc: '劇情模式成功轉正' },
  { id: 'perfect', name: '表現優秀', desc: '劇情模式以「正式轉正(表現優秀)」結束' },
  { id: 'hard_win', name: '困難通關', desc: '在困難難度成功轉正' },
  { id: 'campaign_hit', name: '活動達標', desc: '有一檔活動達到老闆的營收目標' },
  { id: 'endless20', name: '長期抗戰', desc: '無限模式撐過 20 天' },
  { id: 'endless40', name: '持久戰', desc: '無限模式撐過 40 天' },
  { id: 'review3', name: '考核達人', desc: '無限模式單局通過 3 次季度考核' },
  { id: 'rapport', name: '心有靈犀', desc: '連續三次選中對方胃口,進入默契' },
  { id: 'combo', name: '天作之合', desc: '用了搭配加成,而且活動達到老闆的營收目標' },
  { id: 'clean_desk', name: '桌面乾淨', desc: '成功轉正時,日報一份都沒積壓' },
  { id: 'mate_win', name: '並肩作戰', desc: '帶著同事卡成功轉正' },
  { id: 'report_ace', name: '日報達人', desc: '單局日報問答答對 5 次' },
];
