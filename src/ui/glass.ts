import { attach, configure } from '@surdeddd/liquidglass';
import type { LiquidGlassHandle, LiquidGlassOptions } from '@surdeddd/liquidglass';

// Material rendering belongs to LiquidGlassJS. This adapter only selects surfaces,
// applies the project's tint, and owns mount/unmount lifetimes.
configure({ mapSide: 64, caPasses: 1, maxDpr: 1.5 });
const surfaces = [
  '.sidebar', '.pet-status', '.supply-strip', '.pending-strip', '.game-card',
  '.games-banner', '.how-it-works article', '.inventory-card', '.panel',
  '.soft-tip', '.achievement', '.album-summary', '.action-card',
  '.adoption-card', '.pet-choice', '.name-field', '.dialog', '.toast',
  '.game-topbar', '.game-tasks', '.mission', '.room-label', '.room-day',
  '.room-mood', '.room-hint', '.pet-bubble',
  '.primary-button', '.secondary-button', '.icon-button', '.music-toggle',
  '.care-button', '.filter-chip', '.nav-item.active', '.pill',
].join(',');
const material: LiquidGlassOptions = {
  preset: 'frosted', backend: 'css-fallback',
  tint: '#ffffff', tintOpacity: 0, blur: 22, saturation: 1,
  brightness: 1.02, specular: .7, shadow: .1, frost: 0,
  radius: 'auto', physics: false, adaptive: false, motionLight: false,
};
export function mountGlassMaterial(root: ParentNode): () => void {
  const elements = [...root.querySelectorAll<HTMLElement>(surfaces)];
  if (root instanceof HTMLElement && root.matches(surfaces)) elements.unshift(root);
  const handles: LiquidGlassHandle[] = [];
  for (const element of elements) {
    const options = { ...material };
    if (element.matches('.primary-button,.nav-item.active,.filter-chip.active')) {
      Object.assign(options, { blur: 16, shadow: .13, specular: 1 });
    } else if (element.matches('.dialog,.adoption-card')) {
      Object.assign(options, { blur: 34, shadow: .2 });
    } else if (element.matches('.sidebar,.game-topbar,.game-tasks')) {
      Object.assign(options, { blur: 26, shadow: .13 });
    } else if (element.matches('.room-label,.room-day,.room-mood,.room-hint,.pet-bubble,.pill')) {
      Object.assign(options, { blur: 14, shadow: .05, specular: .5 });
    } else if (element.matches('.action-card.locked,.achievement:not(.earned)')) {
      Object.assign(options, { blur: 16, shadow: .04 });
    }
    try { handles.push(attach(element, options)); } catch (error) {
      // Existing authored backgrounds remain readable if an old engine cannot mount.
      console.warn('Glass surface could not mount', error);
    }
  }
  return () => handles.forEach(handle => handle.destroy());
}
