import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { kartMetrics, watermelonMetrics, meadowMetrics } from '../integrations/metrics.mjs';
import { patchGame } from '../integrations/patch-games.mjs';
import { createHubBridge } from '../integrations/hub-bridge.js';

test('卡丁车只接受有完整分圈与实际完成距离的正式完赛', () => {
  const race = { mode: 'race', phase: 'finished', track: { length: 1000 }, laps: 3, player: { finished: true, distance: 3000, finishTime: 120, lapTimes: [40, 40, 40], position: 2 } };
  assert.deepEqual(kartMetrics(race), { completed: true, rank: 2 });
  assert.equal(kartMetrics({ ...race, phase: 'racing' }), null);
  assert.equal(kartMetrics(race, { practice: true }), null);
  assert.equal(kartMetrics({ ...race, player: { ...race.player, distance: 100 } }), null);
  assert.equal(kartMetrics({ ...race, player: { ...race.player, lapTimes: [40] } }), null);
  assert.deepEqual(kartMetrics({ ...race, mode: 'time-trial' }), { completed: true });
});
test('西瓜真实最高水果10才算西瓜，分数和水果索引需合法', () => {
  assert.deepEqual(watermelonMetrics(500, 7), { score: 500, watermelon: false, completed: false });
  assert.deepEqual(watermelonMetrics(2000, 10, true), { score: 2000, watermelon: true, completed: true });
  assert.equal(watermelonMetrics(-1, 0), null); assert.equal(watermelonMetrics(1, 11), null); assert.equal(watermelonMetrics(.5, 1), null);
});
test('三消按已消除牌数计算组数，每日挑战获胜才给dailyWin', () => {
  assert.deepEqual(meadowMetrics({ cleared: 15, moves: 15, status: 'playing' }, 'journey'), { groups: 5, completed: false, dailyWin: false });
  assert.deepEqual(meadowMetrics({ cleared: 36, moves: 36, status: 'won' }, 'daily'), { groups: 12, completed: true, dailyWin: true });
  assert.equal(meadowMetrics({ cleared: 14, moves: 15, status: 'playing' }, 'journey'), null);
});
test('适配器补丁绑定固定源语句，源码改变时明确失败', () => {
  assert.throws(() => patchGame('meadow', 'unrecognized upstream'), /Cannot apply/);
  assert.throws(() => patchGame('missing', ''), /Unknown game/);
  const lock = JSON.parse(readFileSync(new URL('../integrations/games.lock.json', import.meta.url)));
  for (const game of lock.games) assert.match(game.revision, /^[a-f0-9]{40}$/);
});
test('桥接必须同源且有合法会话，重复上报去重并支持显式重发', async () => {
  const messages = [], listeners = new Map(), origin = 'https://rxl333.github.io';
  const parent = { postMessage(data, target) { messages.push({ data, target }); } };
  globalThis.window = { location: { search: '?hubSession=session-001&hubOrigin=' + encodeURIComponent(origin), origin }, parent, addEventListener(type, fn) { listeners.set(type, fn); } };
  try {
    let paused = 0;
    const bridge = createHubBridge({ gameId: 'meadow', onPause: () => paused++ });
    await Promise.resolve(); assert.equal(bridge.active, true); assert.equal(messages[0].data.type, 'ready');
    bridge.startRound('stable-round'); bridge.report('stable-round', { groups: 5 }); bridge.report('stable-round', { groups: 5 });
    assert.equal(messages.filter(m => m.data.type === 'result').length, 1);
    const command = { channel: 'jihong-game-hub', version: 1, gameId: 'meadow', sessionId: 'session-001', type: 'pause' };
    listeners.get('message')({ source: {}, origin, data: command }); assert.equal(paused, 0);
    listeners.get('message')({ source: parent, origin, data: command }); assert.equal(paused, 1);
    bridge.resend(); assert.equal(messages.at(-1).data.roundId, 'stable-round'); assert.equal(messages.every(m => m.target === origin), true);
    window.location.search = '?hubSession=session-001&hubOrigin=https%3A%2F%2Fevil.example'; assert.equal(createHubBridge({ gameId: 'meadow' }).active, false);
  } finally { delete globalThis.window; }
});
