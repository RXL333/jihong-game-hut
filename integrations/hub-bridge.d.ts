export function newRoundId(prefix?: string): string;
export function createHubBridge(options: { gameId: string; onPause?: () => void; onResume?: () => void }): {
  active: boolean;
  startRound(id?: string): void;
  report(id: string, metrics: Record<string, number | boolean> | null): void;
  resend(): void;
};
