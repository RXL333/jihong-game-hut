import type { Metrics } from '../data/games.ts';
export const CHANNEL = 'jihong-game-hub';
export type Session = { gameId: string; sessionId: string; origin: string; source: MessageEventSource | null };
export type GameMessage = { type: 'ready' | 'result'; gameId: string; sessionId: string; roundId: string; metrics: Metrics };
export function readGameMessage(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>, session: Session | null): GameMessage | null {
  if (!session || !session.source || event.source !== session.source || event.origin !== session.origin) return null;
  const d: unknown = event.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const data = d as Record<string, unknown>;
  if (data.channel !== CHANNEL || data.version !== 1 || data.gameId !== session.gameId || data.sessionId !== session.sessionId || !['ready', 'result'].includes(String(data.type))) return null;
  if (typeof data.roundId !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(data.roundId)) return null;
  if (!data.metrics || typeof data.metrics !== 'object' || Array.isArray(data.metrics)) return null;
  const metrics = data.metrics as Record<string, unknown>;
  if (Object.keys(metrics).length > 32 || Object.entries(metrics).some(([key, v]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) || (typeof v !== 'boolean' && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9)))) return null;
  if (metrics.rank !== undefined && (typeof metrics.rank !== 'number' || !Number.isInteger(metrics.rank) || metrics.rank < 1 || metrics.rank > 8)) return null;
  if (metrics.groups !== undefined && (typeof metrics.groups !== 'number' || !Number.isInteger(metrics.groups))) return null;
  if (metrics.score !== undefined && (typeof metrics.score !== 'number' || !Number.isInteger(metrics.score))) return null;
  for (const key of ['completed', 'watermelon', 'dailyWin']) if (metrics[key] !== undefined && typeof metrics[key] !== 'boolean') return null;
  return data as unknown as GameMessage;
}
