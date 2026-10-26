export type Metrics = Record<string, number | boolean>;
export type RewardItems = { snack: number; feast: number; water: number };
export type Mission = {
  id: string; title: string; detail: string; kind: 'basic' | 'advanced' | 'once';
  metric: string; operator: 'gte' | 'eq'; target: number | boolean;
  requires?: { metric: string; value: number | boolean }; reward: RewardItems;
};
export type GameDefinition = {
  id: string; title: string; subtitle: string; category: string; orientation: 'portrait' | 'landscape';
  color: string; icon: string; path: string; originalUrl: string; cover: string; missions: Mission[];
};
export const GAMES: GameDefinition[] = [
  {
    id: 'kart', title: '晴空卡丁车', subtitle: '沿着晴空出发，把烦恼留在身后', category: '轻快竞速', orientation: 'landscape',
    color: '#d4e7e4', icon: 'flag', path: 'games/kart/index.html', originalUrl: 'https://rxl333.github.io/sunny-kart/', cover: 'games/kart/cover.jpg',
    missions: [
      { id: 'finish', title: '兜风回来啦', detail: '完成一场正式比赛', kind: 'basic', metric: 'completed', operator: 'eq', target: true, reward: { snack: 1, feast: 0, water: 1 } },
      { id: 'podium', title: '站上领奖台', detail: '完赛并获得前三名', kind: 'advanced', metric: 'rank', operator: 'gte', target: 1, requires: { metric: 'completed', value: true }, reward: { snack: 0, feast: 1, water: 1 } },
      { id: 'champion', title: '第一枚小奖杯', detail: '首次获得第一名', kind: 'once', metric: 'rank', operator: 'eq', target: 1, requires: { metric: 'completed', value: true }, reward: { snack: 0, feast: 2, water: 2 } },
    ],
  },
  {
    id: 'watermelon', title: '合成大西瓜', subtitle: '小水果碰一碰，收获甜甜好心情', category: '水果合成', orientation: 'portrait',
    color: '#f5d9bb', icon: 'fruit', path: 'games/watermelon/index.html', originalUrl: 'https://rxl333.github.io/watermelon-garden/', cover: 'games/watermelon/cover.png',
    missions: [
      { id: 'harvest', title: '小院初收获', detail: '单局达到 500 分', kind: 'basic', metric: 'score', operator: 'gte', target: 500, reward: { snack: 1, feast: 0, water: 1 } },
      { id: 'plenty', title: '满满一篮甜', detail: '单局达到 1500 分', kind: 'advanced', metric: 'score', operator: 'gte', target: 1500, reward: { snack: 0, feast: 1, water: 1 } },
      { id: 'bigmelon', title: '大西瓜纪念日', detail: '首次合成一颗大西瓜', kind: 'once', metric: 'watermelon', operator: 'eq', target: true, reward: { snack: 0, feast: 2, water: 2 } },
    ],
  },
  {
    id: 'meadow', title: '羊了个羊', subtitle: '收集三份小美好，让心情轻一点', category: '叠层三消', orientation: 'portrait',
    color: '#dde4c7', icon: 'leaf', path: 'games/meadow/index.html', originalUrl: 'https://rxl333.github.io/meadow-match/', cover: 'games/meadow/cover.webp',
    missions: [
      { id: 'gather', title: '收集小美好', detail: '单局累计消除 5 组牌', kind: 'basic', metric: 'groups', operator: 'gte', target: 5, reward: { snack: 1, feast: 0, water: 1 } },
      { id: 'clear', title: '牧场散步家', detail: '通关任意一个关卡', kind: 'advanced', metric: 'completed', operator: 'eq', target: true, reward: { snack: 0, feast: 1, water: 1 } },
      { id: 'daily', title: '今天也很棒', detail: '首次完成每日挑战', kind: 'once', metric: 'dailyWin', operator: 'eq', target: true, reward: { snack: 0, feast: 2, water: 2 } },
    ],
  },
];

export function missionReached(mission: Mission, metrics: Metrics): boolean {
  if (mission.requires && metrics[mission.requires.metric] !== mission.requires.value) return false;
  const value = metrics[mission.metric];
  if (mission.id === 'podium' && (typeof value !== 'number' || value > 3)) return false;
  if (mission.operator === 'eq') return value === mission.target;
  return typeof value === 'number' && typeof mission.target === 'number' && value >= mission.target;
}
