import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adopt, advanceTime, beijingDay, care, claimRewards, cleanName, dailySupply, freshSave, gameProgress, levelInfo, MAX_XP, rename, validateSave } from '../src/core/engine.ts';
import { ACTIONS } from '../src/data/pets.ts';
import { loadSave, parseBackup, persistSave, SAVE_KEY, serializeBackup } from '../src/core/storage.ts';
import { CHANNEL, readGameMessage } from '../src/core/protocol.ts';
const T = Date.UTC(2026, 9, 26, 2);
const H = 3600000;
function adopted() { return adopt(freshSave(T), 'cat', '团团', T).state; }
function storage() { const values = new Map<string, string>(); return { values, getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); } }; }

test('领养只允许一次，猫狗可选且名字按字符长度整理', () => {
  const first = adopt(freshSave(T), 'dog', '  可可  ', T);
  assert.equal(first.ok, true); assert.equal(first.state.pet!.kind, 'dog'); assert.equal(first.state.pet!.name, '可可');
  assert.equal(adopt(first.state, 'cat', '橘子', T).ok, false);
  assert.equal(adopt(freshSave(T), 'cat', '  ', T).ok, false);
  assert.equal(Array.from(cleanName('🐱'.repeat(20))).length, 12);
});
test('改名不会重置宠物的经验、物资或领养日期', () => {
  const before = adopted(); before.pet!.experience = 110;
  const after = rename(before, ' 小橘 ', T + H).state;
  assert.equal(after.pet!.name, '小橘'); assert.equal(after.pet!.experience, 110); assert.equal(after.pet!.adoptedAt, T); assert.deepEqual(after.inventory, before.inventory);
});
test('饱腹与饮水随时间下降，离线一天归零但好感保留', () => {
  const before = adopted(); before.pet!.experience = 120;
  const one = advanceTime(before, T + H);
  assert.equal(one.pet!.satiety, 57); assert.equal(one.pet!.hydration, 56);
  const day = advanceTime(before, T + 24 * H);
  assert.equal(day.pet!.satiety, 0); assert.equal(day.pet!.hydration, 0); assert.equal(day.pet!.experience, 120);
  assert.equal(before.pet!.satiety, 60);
});
test('时钟回拨不会让宠物变饱，恢复时不会重复计算相同时间', () => {
  const before = adopted(), rollback = advanceTime(before, T - H);
  assert.equal(rollback.pet!.satiety, 60); assert.equal(rollback.updatedAt, T);
  const after = advanceTime(advanceTime(before, T + H), T + H);
  assert.equal(after.pet!.satiety, 57);
});
test('喂食和饮水方向正确，满值时不消耗物资', () => {
  const before = adopted();
  const food = care(before, 'snack', T); assert.equal(food.state.pet!.satiety, 85); assert.equal(food.state.inventory.snack, 2); assert.equal(food.experience, 10);
  const water = care(before, 'water', T); assert.equal(water.state.pet!.hydration, 90); assert.equal(water.state.inventory.water, 2); assert.equal(water.experience, 5);
  before.pet!.satiety = 100; const full = care(before, 'snack', T); assert.equal(full.ok, false); assert.equal(full.state.inventory.snack, 3);
});
test('没有物资不能喂养，连续点击被短冷却拦截', () => {
  const before = adopted(); before.inventory.snack = 0;
  assert.equal(care(before, 'snack', T).ok, false);
  const first = care(adopted(), 'water', T);
  const repeat = care(first.state, 'water', T + 100);
  assert.equal(repeat.ok, false); assert.equal(repeat.state.inventory.water, 2);
});
test('每日前五次摸摸有经验，之后仍可互动且不再加经验', () => {
  let state = adopted();
  for (let i = 0; i < 8; i++) state = care(state, 'pet', T + i * 2000).state;
  assert.equal(state.pet!.experience, 10); assert.equal(state.daily.experience, 10); assert.equal(state.daily.petting, 8);
});
test('每日好感上限60，达到上限仍正常恢复身体状态', () => {
  const before = adopted(); before.daily.experience = 58;
  const first = care(before, 'feast', T);
  assert.equal(first.experience, 2); assert.equal(first.state.daily.experience, 60); assert.equal(first.state.pet!.satiety, 85);
  const second = care(first.state, 'water', T);
  assert.equal(second.experience, 0); assert.equal(second.state.pet!.hydration, 90);
});
test('经验升级边界和最高等级准确，每升一级恰好增加一个可用动作', () => {
  assert.equal(levelInfo(49).level, 1); assert.equal(levelInfo(50).level, 2); assert.equal(levelInfo(109).level, 2); assert.equal(levelInfo(110).level, 3);
  assert.equal(levelInfo(MAX_XP - 1).level, 15); assert.equal(levelInfo(MAX_XP).level, 16); assert.equal(levelInfo(MAX_XP).progress, 100);
  for (let level = 1; level <= 16; level++) assert.equal(ACTIONS.filter(a => a.level <= level).length, 4 + level);
});
test('满级经验封顶，照顾继续消耗食物并恢复饱腹', () => {
  const before = adopted(); before.pet!.experience = MAX_XP;
  const after = care(before, 'snack', T); assert.equal(after.experience, 0); assert.equal(after.state.pet!.experience, MAX_XP); assert.equal(after.state.pet!.satiety, 85);
});
test('每日供给不可重复领，午夜按北京时间重置', () => {
  const justBefore = Date.UTC(2026, 9, 26, 15, 59, 59);
  const initial = adopt(freshSave(justBefore), 'cat', '橘子', justBefore).state;
  const first = dailySupply(initial, justBefore); assert.equal(first.ok, true); assert.equal(first.state.inventory.snack, 4);
  assert.equal(dailySupply(first.state, justBefore).ok, false);
  const next = dailySupply(first.state, justBefore + 2000); assert.equal(next.ok, true); assert.equal(next.state.inventory.snack, 5);
  assert.equal(beijingDay(justBefore), '2026-10-26'); assert.equal(beijingDay(justBefore + 2000), '2026-10-27');
});
test('三个目标可由真实成绩同时达成，重复成绩不产生第二份奖励', () => {
  const first = gameProgress(adopted(), 'watermelon', 'round-001', { score: 1800, watermelon: true }, T);
  assert.equal(first.added!.length, 3); assert.equal(first.state.pending.length, 3); assert.equal(first.state.gamesPlayed, 1);
  const repeated = gameProgress(first.state, 'watermelon', 'round-001', { score: 2000, watermelon: true }, T + 1);
  assert.equal(repeated.added!.length, 0); assert.equal(repeated.state.pending.length, 3); assert.equal(repeated.state.gamesPlayed, 1);
});
test('未达成成绩、未知游戏或非法对局编号不会发奖励', () => {
  assert.equal(gameProgress(adopted(), 'watermelon', 'r1', { score: 499 }, T).state.pending.length, 0);
  assert.equal(gameProgress(adopted(), 'unknown', 'r1', { score: 5000 }, T).ok, false);
  assert.equal(gameProgress(adopted(), 'watermelon', '<script>', { score: 5000 }, T).ok, false);
});
test('卡丁车的前三名任务只对已完赛的前3名生效', () => {
  assert.equal(gameProgress(adopted(), 'kart', 'r1', { rank: 1 }, T).state.pending.length, 0);
  assert.equal(gameProgress(adopted(), 'kart', 'r1', { completed: true, rank: 4 }, T).state.pending.length, 1);
  assert.equal(gameProgress(adopted(), 'kart', 'r1', { completed: true, rank: 3 }, T).state.pending.length, 2);
});
test('基础每日3份在待领奖时即计数，未领取也不能超额生成', () => {
  let state = adopted();
  for (let i = 0; i < 5; i++) state = gameProgress(state, 'meadow', 'r' + i, { groups: 5 }, T).state;
  assert.equal(state.pending.length, 3); assert.equal(state.daily.basic, 3);
  const next = gameProgress(state, 'meadow', 'new-day', { groups: 5 }, T + 24 * H);
  assert.equal(next.state.pending.length, 4); assert.equal(next.state.daily.basic, 1);
});
test('进阶每日每款一次，首次成就尚未领取也不可重复生成', () => {
  const first = gameProgress(adopted(), 'meadow', 'r1', { groups: 12, completed: true, dailyWin: true }, T);
  const second = gameProgress(first.state, 'meadow', 'r2', { groups: 12, completed: true, dailyWin: true }, T);
  assert.equal(second.added!.length, 1);
  const afterClaim = claimRewards(second.state, 'all', T);
  const third = gameProgress(afterClaim.state, 'meadow', 'r3', { groups: 12, completed: true, dailyWin: true }, T);
  assert.equal(third.added!.length, 1); assert.equal(third.state.badges.length, 1);
});
test('领奖只入账一次，刷新重新加载仍会保留去重记录', () => {
  const pending = gameProgress(adopted(), 'meadow', 'r1', { groups: 5 }, T).state;
  const claimed = claimRewards(pending, 'all', T).state; assert.equal(claimed.inventory.snack, 4); assert.equal(claimed.pending.length, 0);
  assert.equal(claimRewards(claimed, 'all', T).ok, false);
  const reloaded = validateSave(JSON.parse(JSON.stringify(claimed)))!;
  const after = gameProgress(reloaded, 'meadow', 'r1', { groups: 5 }, T + H).state;
  assert.equal(after.pending.length, 0); assert.equal(after.inventory.snack, 4);
});
test('备份可往返，错误结构、异常数值及原型属性宠物被拒绝', () => {
  const before = adopted(); assert.deepEqual(parseBackup(serializeBackup(before)), before);
  assert.equal(parseBackup('{bad json'), null);
  const bad = structuredClone(before); bad.pet!.satiety = -1; assert.equal(validateSave(bad), null);
  (bad.pet as unknown as { kind: string }).kind = 'toString'; bad.pet!.satiety = 60; assert.equal(validateSave(bad), null);
  const badReward = gameProgress(before, 'meadow', 'r1', { groups: 5 }, T).state; badReward.pending[0].items.snack = 1000; assert.equal(validateSave(badReward), null);
});
test('主存档损坏时从有效备份恢复，存储失败有明确状态', () => {
  const backend = storage(), first = adopted(); persistSave(backend, first);
  const second = care(first, 'snack', T).state; persistSave(backend, second);
  backend.values.set(SAVE_KEY, '{bad');
  const recovered = loadSave(backend, T); assert.equal(recovered.state.pet!.name, '团团'); assert.match(recovered.notice, /备份/);
  const fail = persistSave({ getItem: () => null, setItem() { throw new Error('quota'); } }, first);
  assert.equal(fail.ok, false); assert.match(fail.message, /导出备份/);
});
test('消息接入同时验证来源窗口、域名、游戏、会话和字段类型', () => {
  const source = {} as MessageEventSource, session = { source, origin: 'https://rxl333.github.io', gameId: 'meadow', sessionId: 'session-001' };
  const data = { channel: CHANNEL, version: 1, type: 'result', gameId: 'meadow', sessionId: 'session-001', roundId: 'round-001', metrics: { groups: 5, completed: false } };
  const event = { source, origin: session.origin, data }; assert.ok(readGameMessage(event, session));
  assert.equal(readGameMessage({ ...event, source: {} as MessageEventSource }, session), null);
  assert.equal(readGameMessage({ ...event, origin: 'https://evil.example' }, session), null);
  assert.equal(readGameMessage({ ...event, data: { ...data, sessionId: 'stale-session' } }, session), null);
  assert.equal(readGameMessage({ ...event, data: { ...data, gameId: 'kart' } }, session), null);
  assert.equal(readGameMessage({ ...event, data: { ...data, metrics: { groups: '5' } } }, session), null);
  assert.equal(readGameMessage({ ...event, data: { ...data, metrics: { rank: 0 } } }, session), null);
  assert.equal(readGameMessage({ ...event, data: { ...data, metrics: { score: NaN } } }, session), null);
});
