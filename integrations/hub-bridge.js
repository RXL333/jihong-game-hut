/** Same-origin transport. This module is bundled into each game, never exposed on window. */
export function newRoundId(prefix = 'round') {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${token}`;
}

export function createHubBridge({ gameId, onPause, onResume }) {
  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get('hubSession');
  const origin = query.get('hubOrigin');
  const active = window.parent !== window && origin === window.location.origin && /^[a-zA-Z0-9_-]{8,160}$/.test(sessionId ?? '');
  let roundId = newRoundId(gameId);
  let latest = null;
  const send = (type, metrics = {}) => {
    if (active) window.parent.postMessage({ channel: 'jihong-game-hub', version: 1, type, gameId, sessionId, roundId, metrics }, origin);
  };
  const ready = () => send('ready');
  const resend = () => { ready(); if (latest) send('result', latest); };
  if (active) {
    window.addEventListener('message', event => {
      const data = event.data;
      if (event.source !== window.parent || event.origin !== origin || !data || data.channel !== 'jihong-game-hub' || data.version !== 1 || data.gameId !== gameId || data.sessionId !== sessionId) return;
      if (data.type === 'pause') { if (latest) send('result', latest); onPause?.(); }
      else if (data.type === 'resume') { onResume?.(); resend(); }
      else if (data.type === 'resend') resend();
    });
    queueMicrotask(ready);
  }
  return {
    active,
    startRound(id) { roundId = id || newRoundId(gameId); latest = null; ready(); },
    report(id, metrics) {
      if (!id || !metrics) return;
      roundId = id;
      // Avoid duplicate messages during UI-only rerenders, but allow explicit resend.
      if (latest && JSON.stringify(latest) === JSON.stringify(metrics)) return;
      latest = { ...metrics };
      send('result', latest);
    },
    resend,
  };
}
