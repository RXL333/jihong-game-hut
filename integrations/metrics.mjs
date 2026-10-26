/** Read only committed engine state; launch time and time spent never grant rewards. */
export function kartMetrics(race, { practice = false } = {}) {
  if (!race || practice || race.options?.practice || race.phase !== 'finished' || !race.player?.finished || !['race', 'items', 'time-trial'].includes(race.mode)) return null;
  const player = race.player;
  const total = race.track?.length * race.laps;
  if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(race.laps) || race.laps < 1 || race.laps > 9 || !Number.isFinite(player.distance) || player.distance < total - 0.05 || !Number.isFinite(player.finishTime) || player.finishTime <= 0) return null;
  if (!Array.isArray(player.lapTimes) || player.lapTimes.length !== race.laps || player.lapTimes.some(time => !Number.isFinite(time) || time <= 0) || Math.abs(player.lapTimes.reduce((a, b) => a + b, 0) - player.finishTime) > 0.05) return null;
  const result = { completed: true };
  // A solo time trial has no competitive podium placement.
  if (race.mode !== 'time-trial' && Number.isInteger(player.position) && player.position >= 1 && player.position <= 8) result.rank = player.position;
  return result;
}

export function watermelonMetrics(score, highest, completed = false) {
  if (!Number.isSafeInteger(score) || score < 0 || score > 1e9 || !Number.isInteger(highest) || highest < 0 || highest > 10) return null;
  return { score, watermelon: highest === 10, completed: completed === true };
}

export function meadowMetrics(state, mode) {
  if (!state || !Number.isInteger(state.cleared) || state.cleared < 0 || state.cleared % 3 !== 0 || !Number.isInteger(state.moves) || state.moves < 1 || !['playing', 'won', 'lost'].includes(state.status)) return null;
  const completed = state.status === 'won';
  return { groups: state.cleared / 3, completed, dailyWin: completed && mode === 'daily' };
}
