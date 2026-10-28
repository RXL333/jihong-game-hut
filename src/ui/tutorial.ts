import type { Page } from '../core/onboarding.ts';
import { icon } from './icons.ts';
import { mountGlassMaterial } from './glass.ts';

type Step = { page: Page; target: string; icon: string; title: string; text: string; note: string };
const STEPS: Step[] = [
  { page: 'games', target: '.full-game-grid .game-cover', icon: 'game', title: '快乐，从游戏乐园开始', text: '这里是小屋的入口。上下滑动挑一款小游戏，点击封面或“去玩”就能开始；也可以用上方分类筛选。', note: '可以先玩游戏，随时再去“我的小屋”领养小伙伴。' },
  { page: 'games', target: '.full-game-grid .card-objective', icon: 'flag', title: '小目标，把快乐变成零食', text: '卡丁车正式完赛、西瓜单局达到 500 分、羊了个羊消除 5 组，都会带回零食和清水。在游戏右上角的“小目标”里查看进度和领奖。', note: '基础奖励每天共 3 份；进阶奖励每款每天 1 份，首次成就只领一次。' },
  { page: 'home', target: '.care-buttons,.guest-pet-panel .guest-actions', icon: 'heart', title: '我的小屋，留一点关心给它', text: '橘猫和腊肠狗二选一，还能起名字。回家后可以喂零食、添水、摸摸它，增加好感。这里也能领取每天的保底补给。', note: '饱腹度和饮水值都是 0—100：0 表示不足，100 表示充足。离线不会扣好感。' },
  { page: 'bag', target: '.inventory-card', icon: 'bag', title: '小小背包，收好每份奖励', text: '零食、丰盛零食和清水都放在这里。游戏达标后的奖励会出现在“等你收好的小奖励”，点击“收进背包”后就能喂给宠物。', note: '还没领养也可以先收集奖励，领养后继续使用；首次成就还会留下纪念贴纸。' },
  { page: 'album', target: '.album-summary', icon: 'book', title: '成长图鉴，收藏亲近的小证据', text: '每只宠物都有 20 个动作：初见就会 5 个，好感每升一级，再学会 1 个。已解锁的动作可以点开欣赏。', note: '切换到“成长手账”，还能回看领养、升级和获得成就的日子。' },
  { page: 'games', target: '[data-command="settings"]', icon: 'settings', title: '设置，让小日子安心保存', text: '这里可以调音乐、音量和动态效果。进度自动保存在当前浏览器；换设备或清理浏览器前，记得先导出备份。', note: '想再看一遍？点击页头的书本按钮，或在设置中选择“重新查看新手指引”。' },
];

export class HutTutorial {
  private overlay: HTMLDialogElement | null = null;
  private step = 0;
  private frame = 0;
  private disposeGlass = () => {};
  constructor(private hooks: { navigate: (page: Page) => void; finish: () => void }) {}
  get isOpen() { return this.overlay?.open ?? false; }
  start() {
    if (this.isOpen) return;
    const overlay = document.createElement('dialog');
    overlay.className = 'tutorial-overlay';
    overlay.setAttribute('aria-label', '小屋新手指引');
    overlay.setAttribute('aria-labelledby', 'tutorial-title');
    overlay.setAttribute('aria-describedby', 'tutorial-text');
    overlay.innerHTML = '<div class="tutorial-spotlight" aria-hidden="true"></div><section class="tutorial-card"></section>';
    this.overlay = overlay;
    overlay.addEventListener('cancel', event => { event.preventDefault(); this.finish(); });
    overlay.addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-tour]')?.dataset.tour;
      if (action === 'next') this.step === STEPS.length - 1 ? this.finish() : this.showStep(this.step + 1);
      if (action === 'back' && this.step > 0) this.showStep(this.step - 1);
      if (action === 'skip') this.finish();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' && this.step < STEPS.length - 1) { event.preventDefault(); this.showStep(this.step + 1); }
      if (event.key === 'ArrowLeft' && this.step > 0) { event.preventDefault(); this.showStep(this.step - 1); }
    });
    document.body.append(overlay);
    document.body.classList.add('tutorial-open');
    overlay.showModal();
    window.addEventListener('resize', this.refresh);
    window.addEventListener('scroll', this.refresh, true);
    window.visualViewport?.addEventListener('resize', this.refresh);
    this.showStep(0);
  }
  finish() {
    if (!this.overlay) return;
    cancelAnimationFrame(this.frame); this.frame = 0;
    window.removeEventListener('resize', this.refresh);
    window.removeEventListener('scroll', this.refresh, true);
    window.visualViewport?.removeEventListener('resize', this.refresh);
    this.disposeGlass();
    this.overlay.close(); this.overlay.remove(); this.overlay = null;
    document.body.classList.remove('tutorial-open');
    this.hooks.finish();
  }
  refresh = () => {
    if (!this.isOpen || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.position(); });
  };
  private showStep(index: number) {
    this.step = index;
    this.disposeGlass();
    const step = STEPS[index], card = this.overlay!.querySelector<HTMLElement>('.tutorial-card')!;
    this.hooks.navigate(step.page);
    card.innerHTML = '<div class="tutorial-top"><span>小屋新手指引 <b>' + (index + 1) + ' / ' + STEPS.length + '</b></span><button class="text-button" data-tour="skip">跳过指引</button></div><div class="tutorial-dots" aria-hidden="true">' + STEPS.map((_, i) => '<i class="' + (i <= index ? 'visited' : '') + '"></i>').join('') + '</div><div class="tutorial-heading"><span>' + icon(step.icon) + '</span><h2 id="tutorial-title">' + step.title + '</h2></div><p id="tutorial-text" aria-live="polite">' + step.text + '</p><p class="tutorial-note">' + icon('leaf') + '<span>' + step.note + '</span></p><div class="tutorial-actions"><button class="secondary-button" data-tour="back" ' + (index === 0 ? 'disabled' : '') + '>上一步</button><button class="primary-button" data-tour="next">' + (index === STEPS.length - 1 ? '去玩一会儿' : '下一步') + icon('arrow') + '</button></div>';
    this.disposeGlass = mountGlassMaterial(card);
    const target = document.querySelector<HTMLElement>(step.target);
    target?.scrollIntoView({ behavior: 'instant', block: 'center' });
    this.position(); this.refresh();
    card.querySelector<HTMLButtonElement>('[data-tour="next"]')?.focus({ preventScroll: true });
  }
  private position() {
    if (!this.isOpen) return;
    const card = this.overlay!.querySelector<HTMLElement>('.tutorial-card')!, spotlight = this.overlay!.querySelector<HTMLElement>('.tutorial-spotlight')!;
    const width = document.documentElement.clientWidth, height = window.visualViewport?.height ?? window.innerHeight;
    const rect = document.querySelector(STEPS[this.step].target)?.getBoundingClientRect();
    const gap = 16, pad = 12, cardWidth = Math.min(390, width - 2 * pad);
    card.style.width = cardWidth + 'px'; card.style.maxHeight = (height - 2 * pad) + 'px';
    const cardHeight = card.getBoundingClientRect().height;
    const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));
    let left = (width - cardWidth) / 2, top = (height - cardHeight) / 2;
    if (rect && rect.width > 0 && rect.height > 0) {
      const x = clamp(rect.left - 5, 5, width - 5), y = clamp(rect.top - 5, 5, height - 5);
      Object.assign(spotlight.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.max(0, Math.min(rect.right + 5, width - 5) - x) + 'px', height: Math.max(0, Math.min(rect.bottom + 5, height - 5) - y) + 'px' });
      if (rect.right + gap + cardWidth < width - pad) { left = rect.right + gap; top = rect.top; }
      else if (rect.left - gap - cardWidth > pad) { left = rect.left - gap - cardWidth; top = rect.top; }
      else if (rect.bottom + gap + cardHeight <= height - pad) { left = rect.left; top = rect.bottom + gap; }
      else if (rect.top - gap - cardHeight >= pad) { left = rect.left; top = rect.top - gap - cardHeight; }
      else top = height - pad - cardHeight;
    } else spotlight.style.display = 'none';
    card.style.left = clamp(left, pad, width - cardWidth - pad) + 'px';
    card.style.top = clamp(top, pad, height - cardHeight - pad) + 'px';
  }
}
