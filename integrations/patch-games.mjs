// Patches intentionally match pinned upstream statements exactly. A changed source
// revision must be reviewed, rather than silently losing the achievement hooks.
function replaceOnce(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error(`Cannot apply ${label}: upstream statement changed or is ambiguous.`);
  return source.replace(needle, replacement);
}

export function patchGame(id, source) {
  const patch = (needle, replacement, label) => { source = replaceOnce(source, needle, replacement, `${id}/${label}`); };
  source = `import { createHubBridge, newRoundId } from './hub-bridge.js';\nimport { ${id === 'kart' ? 'kartMetrics' : id === 'watermelon' ? 'watermelonMetrics' : 'meadowMetrics'} } from './hub-metrics.mjs';\n${source}`;
  if (id === 'kart') {
    patch("const keys=new Set(),audio=new AudioEngine();", `const keys=new Set(),audio=new AudioEngine();
let hubRoundId = newRoundId('kart');
const hubBridge = createHubBridge({ gameId: 'kart', onPause: () => { clearKeys(); if (online) mainMenu(); else pause(); audio.setMuted(true); }, onResume: () => { audio.setMuted(mute); } });`, 'bridge');
    patch("selection={...selection,...options};race=new Race(track,selection);", "selection={...selection,...options};race=new Race(track,selection);hubRoundId=newRoundId('kart');hubBridge.startRound(hubRoundId);", 'start-round');
    patch("started:(state,id)=>{cup=null;lesson=null;resetTrial();", "started:(state,id)=>{hubRoundId=newRoundId('kart');hubBridge.startRound(hubRoundId);cup=null;lesson=null;resetTrial();", 'online-round');
    patch("if(race.mode==='time-trial'){finishTrial();return;}const key=", "hubBridge.report(hubRoundId,kartMetrics(race));if(race.mode==='time-trial'){finishTrial();return;}const key=", 'completed-race');
  } else if (id === 'watermelon') {
    patch("const storage = new GardenStorage();", `const storage = new GardenStorage();
let hubRoundId = storage.activeRound?.id ?? newRoundId('watermelon');
const hubBridge = createHubBridge({ gameId: 'watermelon', onPause: () => { scene?.pause(); if (scene && storage.session) storage.save(storage.session); }, onResume: () => {} });`, 'bridge');
    patch("storage.beginRound(resume && !!snapshot);", "storage.beginRound(resume && !!snapshot);\n  hubRoundId = storage.activeRound?.id ?? newRoundId('watermelon');\n  hubBridge.startRound(hubRoundId);", 'persistent-round');
    patch("score(score, highest) {", "score(score, highest) {\n    hubBridge.report(hubRoundId, watermelonMetrics(score, highest));", 'score');
    patch("over(score, highest) {", "over(score, highest) {\n    hubBridge.report(hubRoundId, watermelonMetrics(score, highest, true));", 'round-over');
    patch("if (import.meta.env.PROD && 'serviceWorker' in navigator) {", "if (window.parent === window && import.meta.env.PROD && 'serviceWorker' in navigator) {", 'embed-service-worker');
  } else if (id === 'meadow') {
    patch("let game = new Game(currentLevel);", `let game = new Game(currentLevel);
let hubRoundId = newRoundId('meadow');
let hubPaused = false;
let hubSoundEnabled = audio.enabled;
const hubBridge = createHubBridge({ gameId: 'meadow', onPause: () => { if (hubPaused) return; hubPaused = true; hubSoundEnabled = audio.enabled; audio.enabled = false; }, onResume: () => { if (!hubPaused) return; hubPaused = false; audio.enabled = hubSoundEnabled; } });
function reportMeadow() { hubBridge.report(hubRoundId, meadowMetrics(game.state, mode)); }`, 'bridge');
    patch('if (busy || game.state.status !== "playing") return;', 'if (busy || hubPaused || game.state.status !== "playing") return;', 'pause-input');
    patch('const result = game.pick(id);\n  if (!result.accepted) return;', 'const result = game.pick(id);\n  if (!result.accepted) return;\n  reportMeadow();', 'committed-pick');
    patch('async function useTool(tool: "remove" | "undo" | "shuffle") {\n  if (busy) return;', 'async function useTool(tool: "remove" | "undo" | "shuffle") {\n  if (busy || hubPaused) return;', 'pause-tools');
    patch('function startLevel(level: number, nextMode: "journey" | "daily" = "journey") {\n  if (busy) return;', 'function startLevel(level: number, nextMode: "journey" | "daily" = "journey") {\n  if (busy || hubPaused) return;\n  hubRoundId = newRoundId("meadow");\n  hubBridge.startRound(hubRoundId);', 'start-round');
    patch('async function onWin() {\n  const finishedGame = game;', 'async function onWin() {\n  reportMeadow();\n  const finishedGame = game;', 'completed-level');
  } else throw new Error(`Unknown game: ${id}`);
  if (id === 'meadow') source = source.replaceAll('羊咩咩', '羊了个羊');
  if (id === 'watermelon') source = source.replaceAll('西瓜小院', '合成大西瓜');
  return source;
}
