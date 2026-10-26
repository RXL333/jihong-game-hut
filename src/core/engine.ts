import { GAMES, missionReached } from '../data/games.ts';
import type { Metrics, RewardItems } from '../data/games.ts';
import { PETS } from '../data/pets.ts';
import type { PetKind } from '../data/pets.ts';

export const MAX_XP = 1800;
export const DAILY_XP = 60;
export type Care = 'snack' | 'feast' | 'water' | 'pet';
export type PendingReward = { id: string; gameId: string; missionId: string; title: string; kind: 'basic' | 'advanced' | 'once'; items: RewardItems; earnedAt: number };
export type Diary = { at: number; text: string; kind: 'adopt' | 'level' | 'badge' | 'care' };
export type Save = {
  schema: 1; id: string; revision: number; createdAt: number; updatedAt: number;
  pet: null | { kind: PetKind; name: string; adoptedAt: number; experience: number; satiety: number; hydration: number; totalCare: number };
  inventory: RewardItems;
  daily: { date: string; experience: number; petting: number; supply: boolean; basic: number; advanced: string[] };
  lastCare: Record<Care, number>;
  pending: PendingReward[]; seenGoals: string[]; badges: string[];
  diary: Diary[]; playedRounds: string[]; gamesPlayed: number;
  settings: { music: boolean; volume: number; reducedMotion: boolean };
};
export type Change = { state: Save; ok: boolean; message: string; experience?: number; levels?: number; added?: PendingReward[] };
const HOUR = 3_600_000;
export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const beijingDay = (now: number) => new Date(now + 8 * HOUR).toISOString().slice(0, 10);
export const cleanName = (value: string) => Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, 12).join('');
export function levelInfo(experience: number) {
  let remainder = clamp(experience, 0, MAX_XP), level = 1, required = 50;
  while (level < 16 && remainder >= required) { remainder -= required; level += 1; required += 10; }
  return { level, current: level === 16 ? 0 : remainder, required: level === 16 ? 0 : required, progress: level === 16 ? 100 : remainder / required * 100 };
}
export function freshSave(now = Date.now(), id = crypto.randomUUID()): Save {
  return { schema: 1, id, revision: 0, createdAt: now, updatedAt: now, pet: null,
    inventory: { snack: 3, feast: 1, water: 3 }, daily: { date: beijingDay(now), experience: 0, petting: 0, supply: false, basic: 0, advanced: [] },
    lastCare: { snack: 0, feast: 0, water: 0, pet: 0 }, pending: [], seenGoals: [], badges: [], diary: [], playedRounds: [], gamesPlayed: 0,
    settings: { music: false, volume: .25, reducedMotion: false } };
}
export function advanceTime(input: Save, now = Date.now()): Save {
  const state = structuredClone(input);
  const elapsed = Math.max(0, now - state.updatedAt) / HOUR;
  if (state.pet) { state.pet.satiety = clamp(state.pet.satiety - elapsed * 3); state.pet.hydration = clamp(state.pet.hydration - elapsed * 4); }
  state.updatedAt = Math.max(now, state.updatedAt);
  if (beijingDay(now) > state.daily.date) state.daily = { date: beijingDay(now), experience: 0, petting: 0, supply: false, basic: 0, advanced: [] };
  return state;
}
function result(state: Save, ok: boolean, message: string, extra: Partial<Change> = {}): Change { return { state, ok, message, ...extra }; }
function diary(state: Save, now: number, text: string, kind: Diary['kind']) { state.diary.unshift({ at: now, text, kind }); state.diary = state.diary.slice(0, 40); }
export function adopt(input: Save, kind: PetKind, name: string, now = Date.now()): Change {
  const state = advanceTime(input, now);
  if (state.pet) return result(state, false, '你的小伙伴已经在家里啦。');
  if (!Object.hasOwn(PETS, kind)) return result(state, false, '请选择一只小伙伴。');
  const normalized = cleanName(name);
  if (!normalized) return result(state, false, '给小伙伴起个名字吧。');
  state.pet = { kind, name: normalized, adoptedAt: now, experience: 0, satiety: 60, hydration: 60, totalCare: 0 };
  diary(state, now, `${normalized}来到小屋，我们的故事开始了。`, 'adopt');
  return result(state, true, `欢迎回家，${normalized}！`);
}
export function rename(input: Save, name: string, now = Date.now()): Change {
  const state = advanceTime(input, now), normalized = cleanName(name);
  if (!state.pet || !normalized) return result(state, false, '名字可以是 1—12 个字。');
  state.pet.name = normalized;
  return result(state, true, '新的名字，也一样喜欢。');
}
export function dailySupply(input: Save, now = Date.now()): Change {
  const state = advanceTime(input, now);
  if (!state.pet) return result(state, false, '先接一只小伙伴回家吧。');
  if (state.daily.supply) return result(state, false, '今天的小补给已经收好啦。');
  state.inventory.snack += 1; state.inventory.water += 1; state.daily.supply = true;
  return result(state, true, '收好啦：小零食 ×1、清水 ×1。');
}
export function care(input: Save, action: Care, now = Date.now()): Change {
  const state = advanceTime(input, now), pet = state.pet;
  if (!pet) return result(state, false, '先接一只小伙伴回家吧。');
  if (!['snack', 'feast', 'water', 'pet'].includes(action)) return result(state, false, '这个照顾方式还没有准备好。');
  if (now - state.lastCare[action] < 1500) return result(state, false, '慢慢来，它正在享受这一刻。');
  if (action !== 'pet' && state.inventory[action] <= 0) return result(state, false, '背包里暂时没有了，去游戏里带一点回来吧。');
  if ((action === 'snack' || action === 'feast') && pet.satiety >= 99.9) return result(state, false, '肚子已经饱饱的，留给下次吧。');
  if (action === 'water' && pet.hydration >= 99.9) return result(state, false, '已经喝足水啦，先陪它玩一会儿吧。');
  const previous = levelInfo(pet.experience).level;
  let expected = 0, message = '';
  if (action === 'pet') { expected = state.daily.petting < 5 ? 2 : 0; state.daily.petting += 1; message = '软软的摸摸，它记住了你的温柔。'; }
  else {
    state.inventory[action] -= 1;
    if (action === 'water') { pet.hydration = clamp(pet.hydration + 30); expected = 5; message = '咕嘟咕嘟，喝得好满足。'; }
    else { pet.satiety = clamp(pet.satiety + 25); expected = action === 'feast' ? 15 : 10; message = action === 'feast' ? '丰盛的小点心，今天也被好好爱着。' : '啊呜，好吃的小零食！'; }
  }
  const earned = Math.min(expected, DAILY_XP - state.daily.experience, MAX_XP - pet.experience);
  state.daily.experience += earned; pet.experience += earned; pet.totalCare += 1; state.lastCare[action] = now;
  const levels = levelInfo(pet.experience).level - previous;
  if (levels > 0) diary(state, now, `和${pet.name}的好感升到 Lv.${previous + levels}，解锁了新动作。`, 'level');
  if (pet.totalCare === 1) diary(state, now, `第一次照顾${pet.name}，小小的信任开始发芽。`, 'care');
  return result(state, true, message, { experience: earned, levels });
}
export function gameProgress(input: Save, gameId: string, roundId: string, metrics: Metrics, now = Date.now()): Change {
  const state = advanceTime(input, now), game = GAMES.find(value => value.id === gameId);
  if (!state.pet || !game || !/^[a-zA-Z0-9._:-]{1,120}$/.test(roundId)) return result(state, false, '无效的游戏记录。');
  const roundKey = `${gameId}:${roundId}`;
  if (!state.playedRounds.includes(roundKey)) { state.playedRounds.push(roundKey); state.gamesPlayed += 1; }
  const added: PendingReward[] = [];
  for (const mission of game.missions) {
    const key = `${roundKey}:${mission.id}`;
    if (state.seenGoals.includes(key) || !missionReached(mission, metrics)) continue;
    if (mission.kind === 'basic' && state.daily.basic >= 3) continue;
    if (mission.kind === 'advanced' && state.daily.advanced.includes(gameId)) continue;
    if (mission.kind === 'once' && (state.badges.includes(`${gameId}:${mission.id}`) || state.pending.some(item => item.gameId === gameId && item.missionId === mission.id))) continue;
    if (state.pending.length >= 500) continue;
    const reward = { id: key, gameId, missionId: mission.id, title: mission.title, kind: mission.kind, items: { ...mission.reward }, earnedAt: now };
    state.pending.push(reward); state.seenGoals.push(key); added.push(reward);
    if (mission.kind === 'basic') state.daily.basic += 1;
    if (mission.kind === 'advanced') state.daily.advanced.push(gameId);
  }
  return result(state, true, added.length ? `有 ${added.length} 份小奖励等你领取！` : '', { added });
}
export function claimRewards(input: Save, ids: string[] | 'all', now = Date.now()): Change {
  const state = advanceTime(input, now), claimed = state.pending.filter(item => ids === 'all' || ids.includes(item.id));
  if (!claimed.length) return result(state, false, '这份奖励已经收好啦。');
  for (const item of claimed) {
    state.inventory.snack += item.items.snack; state.inventory.feast += item.items.feast; state.inventory.water += item.items.water;
    if (item.kind === 'once') { state.badges.push(`${item.gameId}:${item.missionId}`); diary(state, now, `获得纪念贴纸「${item.title}」。`, 'badge'); }
  }
  const keys = new Set(claimed.map(item => item.id)); state.pending = state.pending.filter(item => !keys.has(item.id));
  return result(state, true, `${claimed.length} 份奖励已经放进背包。`);
}

function finite(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function strings(value: unknown, max: number): value is string[] { return Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= 240); }
function items(value: unknown): value is RewardItems {
  if (!value || typeof value !== 'object') return false;
  const v = value as RewardItems;
  return ['snack', 'feast', 'water'].every(key => finite(v[key as keyof RewardItems], 0, 100000) && Number.isInteger(v[key as keyof RewardItems]));
}
export function validateSave(value: unknown): Save | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const s = structuredClone(value) as Save;
    if (s.schema !== 1 || typeof s.id !== 'string' || s.id.length > 120 || !finite(s.revision, 0, 1e12) || !finite(s.createdAt, 0, 1e14) || !finite(s.updatedAt, s.createdAt, 1e14)) return null;
    if (s.pet !== null && (!s.pet || !Object.hasOwn(PETS, s.pet.kind) || typeof s.pet.name !== 'string' || !cleanName(s.pet.name) || !finite(s.pet.experience, 0, MAX_XP) || !finite(s.pet.satiety, 0, 100) || !finite(s.pet.hydration, 0, 100) || !finite(s.pet.adoptedAt, 0, 1e14) || !finite(s.pet.totalCare, 0, 1e9))) return null;
    if (s.pet) s.pet.name = cleanName(s.pet.name);
    if (!items(s.inventory) || !s.daily || !/^\d{4}-\d{2}-\d{2}$/.test(s.daily.date) || !finite(s.daily.experience, 0, 60) || !finite(s.daily.petting, 0, 1e9) || typeof s.daily.supply !== 'boolean' || !finite(s.daily.basic, 0, 3) || !strings(s.daily.advanced, 100)) return null;
    if (!s.lastCare || !['snack', 'feast', 'water', 'pet'].every(key => finite(s.lastCare[key as Care], 0, 1e14))) return null;
    if (!strings(s.seenGoals, 20000) || !strings(s.badges, 5000) || !strings(s.playedRounds, 20000) || !finite(s.gamesPlayed, 0, 1e9)) return null;
    if (!Array.isArray(s.pending) || s.pending.length > 500 || !s.pending.every(r => r && typeof r.id === 'string' && r.id.length <= 240 && GAMES.some(g => g.id === r.gameId && g.missions.some(m => m.id === r.missionId && m.kind === r.kind && JSON.stringify(m.reward) === JSON.stringify(r.items))) && typeof r.title === 'string' && r.title.length <= 120 && items(r.items) && finite(r.earnedAt, 0, 1e14))) return null;
    if (new Set(s.pending.map(r => r.id)).size !== s.pending.length) return null;
    if (!Array.isArray(s.diary) || s.diary.length > 40 || !s.diary.every(d => d && finite(d.at, 0, 1e14) && typeof d.text === 'string' && d.text.length <= 240 && ['adopt', 'level', 'badge', 'care'].includes(d.kind))) return null;
    if (!s.settings || typeof s.settings.music !== 'boolean' || typeof s.settings.reducedMotion !== 'boolean' || !finite(s.settings.volume, 0, 1)) return null;
    return s;
  } catch { return null; }
}
