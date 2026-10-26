export function kartMetrics(race: any, options?: { practice?: boolean }): Record<string, number | boolean> | null;
export function watermelonMetrics(score: number, highest: number, completed?: boolean): Record<string, number | boolean> | null;
export function meadowMetrics(state: { cleared: number; moves: number; status: string }, mode: string): Record<string, number | boolean> | null;
