import { asset } from './pet-renderer.ts';
export class HutAudio {
  private audio = new Audio(); private unlocked = false; private gameOpen = false;
  enabled = false; volume = .25;
  constructor() {
    this.audio.src = asset('audio/childhood.mp3'); this.audio.loop = true; this.audio.preload = 'none';
    document.addEventListener('visibilitychange', () => this.sync());
  }
  unlock() { this.unlocked = true; this.sync(); }
  configure(enabled: boolean, volume: number) { this.enabled = enabled; this.volume = volume; this.sync(); }
  setGameOpen(value: boolean) { this.gameOpen = value; this.sync(); }
  private sync() {
    this.audio.volume = this.volume;
    if (!this.enabled || !this.unlocked || this.gameOpen || document.hidden) { this.audio.pause(); return; }
    this.audio.play().catch(() => { /* A later user gesture may release browser autoplay blocking. */ });
  }
}
