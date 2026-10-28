import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFromHash, rememberTutorial, tutorialSeen, TUTORIAL_KEY } from '../src/core/onboarding.ts';
import { adopt, care, claimRewards, freshSave, gameProgress, validateSave } from '../src/core/engine.ts';
import { SAVE_KEY, serializeBackup, parseBackup } from '../src/core/storage.ts';
const T = Date.UTC(2026, 9, 27, 2);
function storage() {
  const values = new Map<string, string>();
  return { values, getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); } };
}

test('空地址和无效地址默认游戏乐园，明确的页面链接继续有效', () => {
  for (const hash of ['', '#', '#missing', '#play-watermelon', '#constructor']) assert.equal(pageFromHash(hash), 'games');
  for (const page of ['games', 'home', 'bag', 'album', 'adopt']) assert.equal(pageFromHash('#' + page), page);
});

test('教程完成或跳过后在当前浏览器记住，且不改写已有养成存档', () => {
  const disk = storage(), save = adopt(freshSave(T), 'dog', '可可', T).state;
  save.pet!.experience = 110;
  const original = JSON.stringify(save); disk.setItem(SAVE_KEY, original);
  assert.equal(tutorialSeen(disk), false); assert.equal(rememberTutorial(disk), true);
  assert.equal(tutorialSeen(disk), true); assert.equal(disk.getItem(TUTORIAL_KEY), 'seen');
  assert.equal(disk.getItem(SAVE_KEY), original);
  assert.deepEqual(validateSave(JSON.parse(disk.getItem(SAVE_KEY)!)), save);
  assert.deepEqual(parseBackup(serializeBackup(save)), save);
});

test('浏览器拒绝教程存储时安全返回，不影响继续浏览', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(tutorialSeen(blocked), false); assert.equal(rememberTutorial(blocked), false);
});

test('未领养可真实游玩并领取奖励，领养不会清空背包或重复发奖', () => {
  const first = gameProgress(freshSave(T), 'meadow', 'guest-round', { groups: 5 }, T);
  assert.equal(first.ok, true); assert.equal(first.state.pet, null); assert.equal(first.state.pending.length, 1);
  const claimed = claimRewards(first.state, 'all', T).state;
  assert.deepEqual(claimed.inventory, { snack: 4, feast: 1, water: 4 });
  assert.equal(care(claimed, 'snack', T).ok, false);
  const joined = adopt(claimed, 'cat', '团团', T).state;
  assert.deepEqual(joined.inventory, claimed.inventory); assert.equal(joined.gamesPlayed, 1); assert.equal(joined.daily.basic, 1);
  const repeated = gameProgress(joined, 'meadow', 'guest-round', { groups: 5 }, T);
  assert.equal(repeated.added!.length, 0); assert.equal(repeated.state.gamesPlayed, 1);
  assert.ok(validateSave(repeated.state));
});
