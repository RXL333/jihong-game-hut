import { ACTIONS } from '../data/pets.ts';
import type { PetKind, ActionId } from '../data/pets.ts';
const images = new Map<string, Promise<HTMLImageElement>>();
type RowLayout = { top: number; bottom: number; baseline: number };
let layoutsPromise: Promise<Record<string, { rows: RowLayout[] }> | null> | undefined;
function loadLayouts() {
  layoutsPromise ??= fetch(asset('assets/pets/atlas-layout.json')).then(r => r.ok ? r.json() : null).catch(() => null);
  return layoutsPromise;
}
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
function loadImage(url: string): Promise<HTMLImageElement> {
  if (!images.has(url)) images.set(url, new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => { images.delete(url); reject(new Error('宠物素材加载失败')); }; img.src = url; }));
  return images.get(url)!;
}
export class PetRenderer {
  canvas: HTMLCanvasElement; kind: PetKind; action: ActionId; reduced: boolean;
  private image: HTMLImageElement | null = null; private row = 0; private fps = 3; private raf = 0; private start = 0; private token = 0; private lastFrame = -1;
  private observer: IntersectionObserver; private visible = true;
  private rowLayout: RowLayout | undefined;
  constructor(canvas: HTMLCanvasElement, kind: PetKind, action: ActionId = 'idle', reduced = false) {
    this.canvas = canvas; this.kind = kind; this.action = action; this.reduced = reduced;
    this.observer = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? true; }); this.observer.observe(canvas);
    canvas.width = 512; canvas.height = 512; this.setAction(action);
  }
  async setAction(id: ActionId) {
    const definition = ACTIONS.find(a => a.id === id) ?? ACTIONS[0], token = ++this.token;
    this.action = definition.id; this.row = definition.row; this.fps = definition.fps; this.start = performance.now(); this.lastFrame = -1;
    try {
      const image = await loadImage(asset(`assets/pets/${this.kind}-${String(definition.page).padStart(2, '0')}.png`));
      if (token !== this.token) return;
      const layouts = await loadLayouts();
      if (token !== this.token) return;
      this.rowLayout = layouts?.[this.kind + '-' + String(definition.page).padStart(2, '0')]?.rows[definition.row];
      this.image = image; this.canvas.dataset.loaded = 'true'; this.canvas.removeAttribute('data-error');
      cancelAnimationFrame(this.raf); this.draw(this.start);
    } catch { if (token === this.token) { this.canvas.dataset.error = 'true'; this.canvas.dispatchEvent(new CustomEvent('pet-image-error', { bubbles: true })); } }
  }
  private draw = (time: number) => {
    if (!this.canvas.isConnected) return;
    if (this.image && this.visible && !document.hidden) {
      const context = this.canvas.getContext('2d')!, frame = this.reduced ? 0 : Math.floor((time - this.start) / 1000 * this.fps) % 6;
      if (frame !== this.lastFrame) {
        const w = this.image.naturalWidth / 6, h = this.image.naturalHeight / 4;
        context.clearRect(0, 0, 512, 512); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        const layout = this.rowLayout ?? { top: this.row * h, bottom: (this.row + 1) * h, baseline: (this.row + 1) * h - 12 };
        const scale = Math.min(512 / w * .78, 475 / Math.max(1, layout.baseline - layout.top));
        context.drawImage(this.image, frame * w, layout.top, w, layout.bottom - layout.top, (512 - w * scale) / 2, 490 - (layout.baseline - layout.top) * scale, w * scale, (layout.bottom - layout.top) * scale);
        this.lastFrame = frame;
      }
    }
    this.raf = requestAnimationFrame(this.draw);
  };
  destroy() { ++this.token; cancelAnimationFrame(this.raf); this.observer.disconnect(); }
}
