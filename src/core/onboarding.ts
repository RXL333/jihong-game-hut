import type { StorageLike } from './storage.ts';

export type Page = 'games' | 'home' | 'bag' | 'album' | 'adopt';
const PAGES: Page[] = ['games', 'home', 'bag', 'album', 'adopt'];
export const TUTORIAL_KEY = 'jihong-game-hut:tutorial:v1';

export function pageFromHash(hash: string): Page {
  const page = hash.replace(/^#/, '');
  return PAGES.includes(page as Page) ? page as Page : 'games';
}
export function tutorialSeen(storage: StorageLike): boolean {
  try { return storage.getItem(TUTORIAL_KEY) === 'seen'; } catch { return false; }
}
export function rememberTutorial(storage: StorageLike): boolean {
  try { storage.setItem(TUTORIAL_KEY, 'seen'); return true; } catch { return false; }
}
