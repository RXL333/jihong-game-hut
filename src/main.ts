import './style.css';
import './glass-theme.css';
import { ACTIONS, PETS, actionName } from './data/pets.ts';
import type { ActionId, PetKind } from './data/pets.ts';
import { GAMES, missionReached } from './data/games.ts';
import type { GameDefinition, Metrics } from './data/games.ts';
import { adopt, advanceTime, care, claimRewards, dailySupply, gameProgress, levelInfo, rename, beijingDay } from './core/engine.ts';
import type { Care, Change, Save } from './core/engine.ts';
import { loadSave, parseBackup, persistSave, SAVE_KEY, serializeBackup } from './core/storage.ts';
import { CHANNEL, readGameMessage } from './core/protocol.ts';
import type { Session } from './core/protocol.ts';
import { icon } from './ui/icons.ts';
import { PetRenderer, asset } from './ui/pet-renderer.ts';
import { HutAudio } from './ui/audio.ts';
import { mountGlassMaterial } from './ui/glass.ts';
import { mountGameWaterfalls } from './ui/masonry.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const initial = loadSave(localStorage);
let state = initial.state;
let route = ['home', 'games', 'bag', 'album'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
let selectedPet: PetKind = 'cat', adoptName: string = PETS.cat.nickname, albumTab = 'actions', gameFilter = 'all';
let saveProblem = initial.notice, savingFailed = false;
let renderers: PetRenderer[] = [], roomRenderer: PetRenderer | undefined;
let idleTimer = 0, actionTimer = 0;
let disposeGlass = () => {}, disposeWaterfalls = () => {};
let active: { game: GameDefinition; session: Session; overlay: HTMLDivElement; frame: HTMLIFrameElement; metrics: Metrics; ready: boolean; closing: boolean; loadTimer: number; disposeGlass: () => void } | null = null;
const audio = new HutAudio();
document.documentElement.style.setProperty('--room-image', 'url("' + asset('assets/room-day.png') + '")');
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dateText = (time: number, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }) => new Date(time).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', ...options });
const petLevel = () => levelInfo(state.pet?.experience ?? 0);
const motionReduced = () => state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
const rewardText = (items: { snack: number; feast: number; water: number }) => [items.snack ? '小零食 ×' + items.snack : '', items.feast ? '丰盛零食 ×' + items.feast : '', items.water ? '清水 ×' + items.water : ''].filter(Boolean).join(' · ');
function toast(message: string, symbol = 'paw') {
  if (!message) return;
  const region = document.querySelector('#toast-region')!, node = document.createElement('div');
  node.className = 'toast'; node.innerHTML = icon(symbol) + '<span>' + esc(message) + '</span>';
  region.append(node);
  const dispose = mountGlassMaterial(node);
  while (region.children.length > 3) region.firstElementChild?.remove();
  setTimeout(() => { dispose(); node.remove(); }, 4500);
}
function commit(operation: (save: Save) => Change, paint = true): Change {
  if (!savingFailed) {
    try { const raw = localStorage.getItem(SAVE_KEY), latest = raw ? parseBackup(raw) : null; if (latest && latest.revision >= state.revision) state = latest; } catch { /* Keep the current in-memory progress. */ }
  }
  const changed = operation(state);
  state = changed.state; state.revision += 1;
  const saved = persistSave(localStorage, state); savingFailed = !saved.ok;
  if (!saved.ok) { saveProblem = saved.message; toast(saved.message, 'download'); }
  audio.configure(state.settings.music, state.settings.volume);
  if (paint) render();
  if (active) paintGameTasks();
  return changed;
}
function changeSetting(key: 'music' | 'reducedMotion' | 'volume', value: boolean | number, paint = true) {
  commit(input => { const next = advanceTime(input); next.settings = { ...next.settings, [key]: value }; return { state: next, ok: true, message: '' }; }, paint);
}
function badgePill(text: string, className = '') { return '<span class="pill ' + className + '">' + text + '</span>'; }
function petCanvas(kind: PetKind, action: ActionId = 'idle', className = '', attrs = '') {
  return '<canvas class="pet-canvas ' + className + '" data-pet="' + kind + '" data-animation="' + action + '" aria-label="' + esc(PETS[kind].name + '：' + actionName(action, kind)) + '" ' + attrs + '></canvas>';
}
function mountPets(root: ParentNode = app) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-pet]').forEach(canvas => {
    const renderer = new PetRenderer(canvas, canvas.dataset.pet as PetKind, canvas.dataset.animation as ActionId, motionReduced());
    renderers.push(renderer); if (canvas.classList.contains('room-pet')) roomRenderer = renderer;
  });
}
function navHtml() {
  return '<aside class="sidebar"><a class="brand" href="#home" aria-label="鸡泓的游戏小屋，回到小屋"><span class="brand-mark">' + icon('paw') + '</span><span>鸡泓的<br><strong>游戏小屋</strong><small>A LITTLE HAPPY PLACE</small></span></a><div class="nav-caption">把快乐，慢慢收藏</div><nav aria-label="主要导航">' +
    [['home', 'home', '我的小屋'], ['games', 'game', '游戏乐园'], ['bag', 'bag', '小小背包'], ['album', 'book', '成长图鉴']].map(([id, symbol, label]) => '<button class="nav-item ' + (route === id ? 'active' : '') + '" data-nav="' + id + '" aria-current="' + (route === id ? 'page' : 'false') + '">' + icon(symbol) + '<span>' + label + '</span>' + (id === 'bag' && state.pending.length ? '<b class="nav-dot">' + state.pending.length + '</b>' : '') + '</button>').join('') +
    '</nav><div class="sidebar-bottom"><div class="little-flower">' + icon('flower') + '</div><p>好好玩，也好好生活。</p><small>每一份陪伴，都有回响</small></div></aside>';
}
function header(title: string, subtitle: string) {
  return '<header class="page-header"><div><a class="mobile-brand" href="#home">' + icon('paw') + '<span>鸡泓的游戏小屋</span></a><div class="eyebrow">' + icon('sun') + ' ' + dateText(Date.now(), { month: 'long', day: 'numeric', weekday: 'long' }) + ' · 小日子，慢慢过</div><h1>' + title + '</h1><p>' + subtitle + '</p></div><div class="header-tools"><button class="music-toggle ' + (state.settings.music ? 'is-on' : '') + '" data-command="music" aria-label="' + (state.settings.music ? '关闭小屋音乐' : '开启小屋音乐') + '">' + icon('music') + '<span>' + (state.settings.music ? '音乐陪伴中' : '听点轻音乐') + '</span><i class="music-dot"></i></button><button class="icon-button" data-command="settings" aria-label="小屋设置">' + icon('settings') + '</button></div></header>';
}
function adoptionHtml() {
  return '<div class="adoption-page"><header class="adoption-header"><a class="adoption-brand" href="#">' + icon('paw') + '<span>鸡泓的游戏小屋</span></a><span class="soft-note">' + icon('leaf') + ' 一个可以慢慢快乐的地方</span></header><main class="adoption-main"><div class="adoption-intro"><span class="eyebrow">一段毛茸茸的故事，即将开始</span><h1>给小小的它，<br>一个<span>有你的家。</span></h1><p>玩你喜欢的小游戏，带回一点小零食。<br>把普普通通的每一天，过成一起长大的日子。</p></div><form id="adopt-form" class="adoption-card"><div class="adoption-steps"><span class="current">01 选择小伙伴</span><i></i><span class="current">02 取个名字</span><i></i><span>03 一起回家</span></div><div class="pet-choices">' +
    (['cat', 'dog'] as PetKind[]).map(kind => '<button type="button" class="pet-choice ' + (selectedPet === kind ? 'selected' : '') + '" data-choose="' + kind + '" aria-pressed="' + (selectedPet === kind) + '">' + (selectedPet === kind ? '<span class="choice-check">' + icon('check') + '</span>' : '') + petCanvas(kind) + '<strong>' + PETS[kind].name + '</strong><small>' + PETS[kind].trait + '</small></button>').join('') +
    '</div><label class="name-label" for="pet-name">以后，就这样叫它吧 <span>可随时改名</span></label><div class="name-field">' + icon('edit') + '<input id="pet-name" name="pet-name" type="text" autocomplete="off" maxlength="24" value="' + esc(adoptName) + '" placeholder="给它起一个喜欢的名字" required><span>最多12字</span></div><button class="primary-button adopt-button" type="submit">就接你回家 ' + icon('arrow') + '</button><p class="local-note">' + icon('heart') + ' 无需登录 · 进度保存在当前浏览器 · 随时可以导出备份</p></form></main><footer class="adoption-footer">晴空、甜西瓜、小牧场，还有一个等你回来的小伙伴。</footer></div>';
}
function metric(label: string, value: number, symbol: string, color: string) {
  const n = Math.round(value);
  return '<div class="metric"><div class="metric-label"><span>' + icon(symbol) + label + '</span><b>' + n + '<small> / 100</small></b></div><div class="meter ' + color + (n < 20 ? ' is-low' : '') + '" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + n + '"><i style="width:' + n + '%"></i></div></div>';
}
function careButtons() {
  return '<div class="care-buttons"><button class="care-button food" data-care="snack" ' + (!state.inventory.snack ? 'disabled' : '') + '>' + icon('snack') + '<strong>喂零食</strong><small>剩余 ' + state.inventory.snack + ' 份</small></button><button class="care-button drink" data-care="water" ' + (!state.inventory.water ? 'disabled' : '') + '>' + icon('water') + '<strong>添点水</strong><small>剩余 ' + state.inventory.water + ' 份</small></button><button class="care-button touch" data-care="pet">' + icon('heart') + '<strong>摸摸它</strong><small>给一点温柔</small></button></div>';
}
function homeHtml() {
  const pet = state.pet!, level = petLevel(), days = Math.floor(Math.max(0, Date.now() - pet.adoptedAt) / 86400000) + 1;
  const mood = Math.min(pet.satiety, pet.hydration) < 20 ? '想要你的照顾' : Math.min(pet.satiety, pet.hydration) > 75 ? '被爱包围，心情很好' : '有你在，就很安心';
  return header('有你在的小日子', '欢迎回家。去玩一会儿，也别忘了抱抱你的小伙伴。') +
    '<div class="home-grid"><section class="room-card" aria-label="宠物的小屋"><div class="room-background"></div><div class="room-top"><span class="room-label">' + icon('home') + ' 小屋时光</span><span class="room-day">一起的第 ' + days + ' 天</span></div><div class="room-light"></div><div class="pet-spot"><button class="pet-touch" data-care="pet" aria-label="摸摸' + esc(pet.name) + '">' + petCanvas(pet.kind, 'idle', 'room-pet') + '</button><span class="pet-shadow"></span><span id="pet-bubble" class="pet-bubble">' + esc(pet.name) + '在等你呢</span></div><div class="room-bottom"><span class="room-mood">' + icon('sun') + ' 阳光和你，都刚刚好</span><button class="text-button room-hint" data-care="pet">戳戳它 ' + icon('heart') + '</button></div></section><section class="pet-status"><div class="status-top"><span class="eyebrow">我的毛茸茸</span>' + badgePill('Lv.' + level.level, 'level-pill') + '</div><div class="pet-name"><h2>' + esc(pet.name) + '</h2><button class="icon-button tiny" data-command="rename" aria-label="修改宠物名字">' + icon('edit') + '</button></div><div class="pet-species">' + PETS[pet.kind].name + ' <i></i> ' + mood + '</div><div class="affection-row"><span>' + icon('heart') + ' 好感度</span><span>' + (level.level === 16 ? '最亲密的伙伴' : level.current + ' / ' + level.required) + '</span></div><div class="meter affection" role="progressbar" aria-label="好感度升级进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(level.progress) + '"><i style="width:' + level.progress + '%"></i></div><p class="next-unlock">' + icon('sparkle') + (level.level === 16 ? '20 个动作都学会啦，谢谢你一直陪伴。' : '再亲近一点，就会「' + actionName(ACTIONS.find(a => a.level === level.level + 1)?.id ?? 'heart', pet.kind) + '」啦') + '</p><div class="status-divider"></div>' +
    metric('饱腹度', pet.satiety, 'snack', 'satiety') + metric('饮水值', pet.hydration, 'water', 'hydration') + careButtons() +
    '<div class="status-foot">' + icon('leaf') + ' 慢慢照顾就好，好感会一直留着。</div></section></div>' +
    '<section class="supply-strip"><span class="supply-icon">' + icon('gift') + '</span><div><strong>今天的小补给</strong><p>一份零食，一份清水，一点日常的小确幸。</p></div><button class="secondary-button" data-command="supply" ' + (state.daily.supply ? 'disabled' : '') + '>' + (state.daily.supply ? icon('check') + ' 今日已收好' : '收下补给 ' + icon('arrow')) + '</button></section>' +
    (state.pending.length ? '<div class="pending-strip">' + icon('gift') + '<span>游戏里带回了 <strong>' + state.pending.length + ' 份</strong>小惊喜</span><button class="text-button" data-command="claim-all">一键收好 ' + icon('arrow') + '</button></div>' : '') +
    '<section class="home-games"><div class="section-heading"><div><span class="eyebrow">PLAY A LITTLE, SMILE A LITTLE</span><h2>去玩一会儿 <span class="heading-leaf">' + icon('leaf') + '</span></h2><p>每一场小快乐，都能变成它的小零食。</p></div><button class="text-button" data-nav="games">全部游戏 ' + icon('arrow') + '</button></div><div class="game-grid"><div class="game-sizer"></div><div class="gutter-sizer"></div>' + GAMES.map(gameCard).join('') + '</div></section><div class="home-note">' + icon('heart') + ' 不必很厉害，也能把小伙伴照顾得很好。</div>';
}
function gameCard(game: GameDefinition) {
  return '<article class="game-card" data-game-card="' + game.id + '"><button class="game-cover ' + game.id + '" data-play="' + game.id + '" aria-label="游玩' + game.title + '"><img src="' + asset(game.cover) + '" alt="' + game.title + '游戏画面" loading="lazy"><span class="cover-fallback">' + icon(game.icon) + '</span><span class="cover-tag">' + game.category + '</span><span class="play-circle">' + icon('arrow') + '</span></button><div class="game-info"><div class="game-title-row"><h3>' + game.title + '</h3><span class="orientation-tag">' + (game.orientation === 'landscape' ? '横屏' : '竖屏') + '</span></div><p>' + game.subtitle + '</p><div class="card-objective">' + icon('flag') + '<span>' + game.missions[0].detail + '</span></div><div class="game-card-bottom"><span class="game-reward">' + icon('snack') + ' 零食 ' + icon('water') + ' 清水</span><button class="text-button" data-play="' + game.id + '">去玩 ' + icon('chevron') + '</button></div></div></article>';
}
function gamesHtml() {
  const filtered = GAMES.filter(game => gameFilter === 'all' || game.id === gameFilter);
  return header('把快乐，玩成小收获', '选一款喜欢的小游戏。达成小目标，就能给它带点好吃的回来。') +
    '<div class="games-banner"><div>' + icon('game') + '<span><strong>快乐没有标准答案</strong><small>基础奖励每天任选 3 份，同一款游戏也可以。</small></span></div><span class="pill">' + state.daily.basic + ' / 3 份今日基础奖励</span></div><div class="filter-row" role="group" aria-label="筛选游戏">' + [['all', '全部游戏'], ['kart', '轻快竞速'], ['watermelon', '水果合成'], ['meadow', '叠层三消']].map(([id, name]) => '<button class="filter-chip ' + (gameFilter === id ? 'active' : '') + '" data-filter="' + id + '" aria-pressed="' + (gameFilter === id) + '">' + name + '</button>').join('') + '</div><div class="game-grid full-game-grid"><div class="game-sizer"></div><div class="gutter-sizer"></div>' + filtered.map(gameCard).join('') + '</div><section class="how-it-works"><h2>小零食，是这样带回家的</h2><div>' +
    [['game', '01', '玩一款小游戏', '选择喜欢的，就从一小局开始。'], ['flag', '02', '完成一个小目标', '分数、完赛或消除组数都会自动记录。'], ['gift', '03', '把奖励带回家', '收进背包，再喂给你的小伙伴。']].map(([symbol, number, title, text]) => '<article><span class="step-icon">' + icon(symbol) + '</span><small>' + number + '</small><h3>' + title + '</h3><p>' + text + '</p></article>').join('') + '</div></section>';
}
function rewardsHtml() {
  return '<section class="panel rewards-panel"><div class="section-heading compact"><div><h2>等你收好的小奖励</h2><p>每一份，都是游戏里的快乐回响。</p></div>' + (state.pending.length ? '<button class="secondary-button" data-command="claim-all">全部收好</button>' : '') + '</div>' +
    (state.pending.length ? '<div class="reward-list">' + state.pending.map(item => '<div class="reward-item"><span class="reward-icon">' + icon(item.kind === 'once' ? 'sparkle' : 'gift') + '</span><div><strong>' + esc(item.title) + '</strong><small>' + esc(rewardText(item.items)) + '</small></div><button class="secondary-button small" data-claim="' + esc(item.id) + '">收进背包</button></div>').join('') + '</div>' : '<div class="empty-state">' + icon('gift') + '<h3>下一份小惊喜，在游戏里等你</h3><p>去完成一个小目标，再带着奖励回来吧。</p><button class="text-button" data-nav="games">去游戏乐园 ' + icon('arrow') + '</button></div>') + '</section>';
}
function bagHtml() {
  return header('小小背包，装满关心', '把游戏里收获的快乐，留一份给最喜欢的小伙伴。') +
    '<div class="inventory-grid">' + [
      ['snack', 'snack', '小零食', '饱腹度 +25 · 好感 +10', '一口小满足，日子甜一点。'],
      ['feast', 'sparkle', '丰盛零食', '饱腹度 +25 · 好感 +15', '今天，给它多一点小惊喜。'],
      ['water', 'water', '一份清水', '饮水值 +30 · 好感 +5', '咕嘟一下，装满小小元气。'],
    ].map(([id, symbol, name, effect, desc]) => '<article class="inventory-card ' + id + '"><div class="inventory-symbol">' + icon(symbol) + '</div><span class="inventory-count">' + state.inventory[id as keyof Save['inventory']] + '<small>份</small></span><h2>' + name + '</h2><p>' + desc + '</p><small class="item-effect">' + effect + '</small><button class="secondary-button" data-care="' + id + '" ' + (!state.inventory[id as keyof Save['inventory']] ? 'disabled' : '') + '>' + (id === 'water' ? '给它添水' : '喂给它吃') + '</button></article>').join('') +
    '</div>' + rewardsHtml() + '<div class="soft-tip">' + icon('sun') + '<p>今天已获得 <strong>' + state.daily.experience + ' / 60</strong> 点好感经验。照顾它不必着急，每天都可以慢慢亲近。</p></div><section class="panel"><div class="section-heading compact"><div><h2>小小纪念贴纸</h2><p>值得记住的第一次，都收藏在这里。</p></div><span class="pill">' + state.badges.length + ' / ' + GAMES.length + '</span></div><div class="badge-grid">' +
    GAMES.map(game => { const mission = game.missions.find(m => m.kind === 'once')!, unlocked = state.badges.includes(game.id + ':' + mission.id); return '<article class="achievement ' + (unlocked ? 'earned' : '') + '"><span>' + icon(unlocked ? game.icon : 'lock') + '</span><h3>' + mission.title + '</h3><p>' + mission.detail + '</p><small>' + (unlocked ? '已经收藏' : '等你来发现') + '</small></article>'; }).join('') + '</div></section>';
}
function albumHtml() {
  const pet = state.pet!, level = petLevel(), unlocked = ACTIONS.filter(action => action.level <= level.level).length;
  return header('一起长大的小证据', '从第一次眨眼，到把肚皮交给你。每一点亲近，都有自己的模样。') +
    '<div class="album-summary"><div class="album-heart">' + icon('heart') + '</div><div><strong>' + esc(pet.name) + '的成长小册</strong><p>好感 Lv.' + level.level + ' · 已学会 ' + unlocked + ' / 20 个动作</p></div><span class="pill">' + (level.level === 16 ? '最亲密的伙伴' : '下一级，还有新的小惊喜') + '</span></div><div class="filter-row" role="tablist" aria-label="成长图鉴内容"><button class="filter-chip ' + (albumTab === 'actions' ? 'active' : '') + '" data-album="actions" role="tab" aria-selected="' + (albumTab === 'actions') + '">动作图鉴 <small>' + unlocked + '/20</small></button><button class="filter-chip ' + (albumTab === 'diary' ? 'active' : '') + '" data-album="diary" role="tab" aria-selected="' + (albumTab === 'diary') + '">成长手账</button></div>' +
    (albumTab === 'actions' ? '<div class="action-grid">' + ACTIONS.map(action => { const open = level.level >= action.level; return '<button class="action-card ' + (open ? 'unlocked' : 'locked') + '" data-pet-action="' + action.id + '" aria-label="' + actionName(action.id, pet.kind) + '，' + (open ? '已解锁，点击欣赏' : '好感' + action.level + '级解锁') + '"><div class="action-art">' + (open ? petCanvas(pet.kind, action.id) : '<span class="locked-paw">' + icon('paw') + '</span><span class="action-lock">' + icon('lock') + '</span>') + '</div><strong>' + actionName(action.id, pet.kind) + '</strong><small>' + (open ? (action.level === 1 ? '初见就会的小动作' : 'Lv.' + action.level + ' 的亲近') : '好感 Lv.' + action.level + ' 解锁') + '</small></button>'; }).join('') + '</div>' :
      '<section class="panel diary-panel"><div class="diary-heading">' + icon('book') + '<div><h2>和' + esc(pet.name) + '的小日子</h2><p>值得记住的片刻，我们帮你轻轻记下。</p></div></div><ol class="diary-list">' + state.diary.map(item => '<li><span class="diary-dot">' + icon(item.kind === 'badge' ? 'sparkle' : 'heart') + '</span><div><small>' + dateText(item.at) + '</small><p>' + esc(item.text) + '</p></div></li>').join('') + '</ol></section>');
}
function render() {
  disposeWaterfalls(); disposeGlass();
  clearTimeout(idleTimer); renderers.forEach(renderer => renderer.destroy()); renderers = []; roomRenderer = undefined;
  document.documentElement.classList.toggle('reduce-motion', motionReduced());
  if (!state.pet) app.innerHTML = adoptionHtml();
  else app.innerHTML = navHtml() + '<main class="main-content">' + (saveProblem ? '<div class="save-notice" role="alert">' + icon('download') + '<span>' + esc(saveProblem) + '</span><button class="text-button" data-command="export">导出备份</button></div>' : '') + (route === 'games' ? gamesHtml() : route === 'bag' ? bagHtml() : route === 'album' ? albumHtml() : homeHtml()) + '<footer class="page-footer"><span>' + icon('paw') + ' 鸡泓的游戏小屋</span><span>让快乐有处可去，让陪伴慢慢长大。</span></footer></main>';
  mountPets(); audio.configure(state.settings.music, state.settings.volume);
  disposeGlass = mountGlassMaterial(app); disposeWaterfalls = mountGameWaterfalls(app);
  app.querySelectorAll<HTMLImageElement>('.game-cover img').forEach(image => { image.onerror = () => image.classList.add('failed'); });
  if (roomRenderer && !active) scheduleIdle();
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!roomRenderer || active || document.hidden) return scheduleIdle();
    const available = ACTIONS.filter(a => a.level <= petLevel().level && !['eat', 'drink'].includes(a.id));
    const action = available[Math.floor(Math.random() * available.length)].id;
    roomRenderer.setAction(action); setTimeout(() => roomRenderer?.setAction('idle'), action === 'sleep' ? 12000 : 4500); scheduleIdle();
  }, 16000 + Math.random() * 10000);
}
function petAction(id: ActionId, text?: string) {
  clearTimeout(actionTimer); clearTimeout(idleTimer);
  roomRenderer?.setAction(id);
  const bubble = document.querySelector('#pet-bubble');
  if (bubble && text) { bubble.textContent = text; bubble.classList.add('show'); setTimeout(() => bubble.classList.remove('show'), 4000); }
  actionTimer = window.setTimeout(() => { roomRenderer?.setAction('idle'); scheduleIdle(); }, id === 'eat' || id === 'drink' ? 7000 : 4500);
}
function performCare(action: Care) {
  audio.unlock(); const result = commit(save => care(save, action));
  toast(result.message + (result.experience ? ' 好感 +' + result.experience : ''), action === 'water' ? 'water' : 'heart');
  if (result.ok) petAction(action === 'water' ? 'drink' : action === 'pet' ? (petLevel().level >= 10 ? 'nuzzle' : 'idle') : 'eat', action === 'water' ? '喝足水啦，谢谢你。' : action === 'pet' ? '最喜欢被你摸摸了。' : '啊呜，好好吃！');
  if (result.levels) setTimeout(() => showLevelUp(), 700);
}
function openDialog(content: string, className = '') {
  document.querySelector<HTMLDialogElement>('dialog')?.close();
  const dialog = document.createElement('dialog'); dialog.className = 'dialog ' + className; dialog.innerHTML = content;
  document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  const localRenderers: PetRenderer[] = [];
  dialog.querySelectorAll<HTMLCanvasElement>('canvas[data-pet]').forEach(canvas => localRenderers.push(new PetRenderer(canvas, canvas.dataset.pet as PetKind, canvas.dataset.animation as ActionId, motionReduced())));
  dialog.addEventListener('close', () => { localRenderers.forEach(r => r.destroy()); dialog.remove(); });
  dialog.showModal();
  const dispose = mountGlassMaterial(dialog);
  dialog.addEventListener('close', dispose, { once: true });
  return dialog;
}
function dialogHead(title: string, subtitle = '') {
  return '<div class="dialog-head"><div><h2>' + title + '</h2>' + (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div><button class="icon-button" data-command="close-dialog" aria-label="关闭弹窗">' + icon('close') + '</button></div>';
}
function showLevelUp() {
  const action = ACTIONS.find(a => a.level === petLevel().level), pet = state.pet!;
  if (!action) return;
  openDialog(dialogHead('又亲近一点了！', '和' + esc(pet.name) + '的好感升到 Lv.' + petLevel().level) + '<div class="level-celebration">' + petCanvas(pet.kind, action.id) + '<span class="pill">新动作解锁</span><h3>' + actionName(action.id, pet.kind) + '</h3><p>' + action.note + '</p><button class="primary-button" data-command="close-dialog">把这份亲近收好 ' + icon('heart') + '</button></div>', 'celebration-dialog');
}
function openSettings() {
  const dialog = openDialog(dialogHead('小屋设置', '把这里，调成你喜欢的样子。') + '<div class="settings-content"><section><h3>' + icon('music') + ' 声音与画面</h3><label class="setting-row"><span>小屋背景音乐<small>进入游戏和切到后台时暂停</small></span><input type="checkbox" id="music-setting" ' + (state.settings.music ? 'checked' : '') + '></label><label class="setting-row volume-setting"><span>音乐音量</span><input type="range" id="volume-setting" min="0" max="100" value="' + Math.round(state.settings.volume * 100) + '" aria-label="音乐音量"></label><label class="setting-row"><span>轻柔动态<small>减少动画，宠物保留静态动作画面</small></span><input type="checkbox" id="motion-setting" ' + (state.settings.reducedMotion ? 'checked' : '') + '></label></section><section><h3>' + icon('bag') + ' 好好保管小日子</h3><p class="settings-description">进度保存在当前浏览器。导出一份备份，换设备时也能把小伙伴一起带走。</p><div class="backup-actions"><button class="secondary-button" data-command="export">' + icon('download') + ' 导出备份</button><button class="secondary-button" data-command="import">' + icon('upload') + ' 导入备份</button></div><input id="backup-file" type="file" accept=".json,application/json" hidden><small class="backup-foot">清理站点数据前，记得先保存备份。</small></section><section class="music-credit"><h3>' + icon('leaf') + ' 关于小屋</h3><p>原创小游戏与毛茸茸的陪伴，来自鸡泓的游戏小屋。</p><p>音乐：<a href="https://www.scottbuckley.com.au/library/childhood/" target="_blank" rel="noopener">Childhood — Scott Buckley</a><br>Released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · 原曲未经修改<br><a href="https://www.scottbuckley.com.au" target="_blank" rel="noopener">www.scottbuckley.com.au</a></p></section></div>');
  dialog.querySelector('#music-setting')?.addEventListener('change', event => { audio.unlock(); changeSetting('music', (event.target as HTMLInputElement).checked); });
  dialog.querySelector('#motion-setting')?.addEventListener('change', event => changeSetting('reducedMotion', (event.target as HTMLInputElement).checked));
  dialog.querySelector('#volume-setting')?.addEventListener('input', event => { audio.unlock(); changeSetting('volume', Number((event.target as HTMLInputElement).value) / 100, false); });
  dialog.querySelector('#backup-file')?.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    if (file.size > 4_000_000) return toast('备份文件太大，请选择小屋导出的 JSON 文件。');
    const imported = parseBackup(await file.text());
    if (!imported) return toast('这份备份无法读取，当前进度没有改变。');
    const preview = openDialog(dialogHead('把小伙伴接回来', '导入会替换当前浏览器的小屋进度。') + '<div class="import-preview">' + icon('home') + '<h3>' + esc(imported.pet?.name ?? '还未领养的小屋') + '</h3><p>好感 Lv.' + levelInfo(imported.pet?.experience ?? 0).level + ' · ' + imported.gamesPlayed + ' 次游戏小记录</p><p>建议先导出当前进度，再把这份备份接回家。</p><div class="backup-actions"><button class="secondary-button" data-command="export">先备份当前小屋</button><button class="primary-button" id="confirm-import">确认导入</button></div></div>');
    preview.querySelector('#confirm-import')?.addEventListener('click', () => {
      commit(() => ({ state: { ...advanceTime(imported), revision: state.revision + 1 }, ok: true, message: '' }));
      preview.close(); toast('小日子已经接着往下过啦。', 'check');
    });
  });
}
function exportBackup() {
  const blob = new Blob([serializeBackup(advanceTime(state))], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = '鸡泓的小屋-' + beijingDay(Date.now()) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('备份已准备好，请保管浏览器下载的文件。', 'download');
}
function sendGame(type: 'pause' | 'resume' | 'resend') {
  if (active) active.frame.contentWindow?.postMessage({ channel: CHANNEL, version: 1, gameId: active.game.id, sessionId: active.session.sessionId, type }, active.session.origin);
}
function paintGameTasks() {
  if (!active) return;
  const game = active.game, metrics = active.metrics, target = active.overlay.querySelector('.game-tasks-content');
  if (!target) return;
  active.disposeGlass();
  target.innerHTML = '<span class="eyebrow">带点小收获回家</span><h2>这一局的小目标</h2><p>真实游玩进度会自动记录，达成后收进背包就好。</p><div class="mission-list">' + game.missions.map(mission => {
    const pending = state.pending.find(p => p.gameId === game.id && p.missionId === mission.id);
    const earned = mission.kind === 'once' && state.badges.includes(game.id + ':' + mission.id);
    const reached = missionReached(mission, metrics);
    return '<article class="mission ' + (pending || earned ? 'mission-done' : '') + '"><div><span class="mission-kind">' + (mission.kind === 'basic' ? '日常小目标' : mission.kind === 'advanced' ? '进阶小挑战' : '第一次的纪念') + '</span>' + (pending || earned ? icon('check') : icon('flag')) + '</div><h3>' + mission.title + '</h3><p>' + mission.detail + '</p><small>' + rewardText(mission.reward) + '</small>' + (pending ? '<button class="secondary-button small" data-claim="' + esc(pending.id) + '">收进背包</button>' : '<span class="mission-status">' + (earned ? '纪念贴纸已收藏' : reached ? '目标已完成 · 已领或达到今日次数' : mission.metric === 'score' ? (metrics.score ?? 0) + ' / ' + mission.target + ' 分' : mission.metric === 'groups' ? (metrics.groups ?? 0) + ' / ' + mission.target + ' 组' : '慢慢来，一起加油') + '</span>') + '</article>';
  }).join('') + '</div><div class="game-task-tip">' + icon('snack') + '<p>今日基础奖励 ' + state.daily.basic + '/3 份。进阶目标每款每日一份，纪念成就首次达成可领。</p></div>';
  active.disposeGlass = mountGlassMaterial(active.overlay);
}
function gameLoadFailed(current: NonNullable<typeof active>) {
  if (active !== current || current.ready || current.closing) return;
  clearTimeout(current.loadTimer);
  const loading = current.overlay.querySelector<HTMLElement>('.game-loading')!;
  loading.classList.add('load-failed');
  loading.innerHTML = icon('game') + '<strong>游戏还没有打开</strong><p>加载未完成，可以重试，或先返回小屋。</p><button class="secondary-button" data-command="reload-game">重新加载游戏</button><button class="text-button" data-command="exit-game">返回小屋</button>';
}
function loadActiveGame() {
  const current = active; if (!current) return;
  clearTimeout(current.loadTimer); current.ready = false;
  const loading = current.overlay.querySelector<HTMLElement>('.game-loading')!;
  loading.classList.remove('hidden', 'load-failed');
  loading.innerHTML = '<span class="loading-paw">' + icon('paw') + '</span><strong>正在打开' + current.game.title + '</strong><p>小小的快乐，马上就好。</p>';
  const url = new URL(asset(current.game.path), location.href);
  url.searchParams.set('hubSession', current.session.sessionId); url.searchParams.set('hubOrigin', location.origin);
  current.frame.src = url.href;
  current.loadTimer = window.setTimeout(() => gameLoadFailed(current), 15000);
}
function openGame(id: string) {
  const game = GAMES.find(g => g.id === id); if (!game || !state.pet || active) return;
  audio.unlock(); audio.setGameOpen(true); clearTimeout(idleTimer);
  const overlay = document.createElement('div'); overlay.className = 'game-overlay ' + game.orientation; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', game.title);
  overlay.innerHTML = '<header class="game-topbar"><button class="back-to-hut" data-command="exit-game">' + icon('back') + '<span>返回小屋</span></button><strong>' + game.title + '</strong><div><button class="game-tasks-toggle secondary-button small" data-command="toggle-tasks">' + icon('gift') + ' 小目标 <b class="pending-count">' + state.pending.length + '</b></button><button class="icon-button" data-command="fullscreen" aria-label="全屏游戏">' + icon('full') + '</button></div></header><div class="game-play-area"><div class="frame-wrap"><iframe title="' + game.title + '" allow="fullscreen; autoplay; gamepad" allowfullscreen></iframe><div class="game-loading"><span class="loading-paw">' + icon('paw') + '</span><strong>正在打开' + game.title + '</strong><p>小小的快乐，马上就好。</p><button class="text-button" data-command="reload-game">加载较久？点这里重新打开</button></div>' + (game.orientation === 'landscape' ? '<div class="rotate-hint">' + icon('full') + '<h2>横过来，看见更大的晴空</h2><p>这款游戏更适合手机横屏游玩。</p><button class="primary-button" data-command="dismiss-rotate">继续进入游戏</button></div>' : '') + '</div><aside class="game-tasks"><button class="icon-button close-tasks" data-command="toggle-tasks" aria-label="收起小目标">' + icon('close') + '</button><div class="game-tasks-content"></div></aside></div>';
  document.body.append(overlay); document.body.classList.add('playing');
  const frame = overlay.querySelector('iframe')!, url = new URL(asset(game.path), location.href), sessionId = crypto.randomUUID();
  url.searchParams.set('hubSession', sessionId); url.searchParams.set('hubOrigin', location.origin);
  active = { game, overlay, frame, session: { gameId: game.id, sessionId, origin: url.origin, source: frame.contentWindow }, metrics: {}, ready: false, closing: false, loadTimer: 0, disposeGlass: () => {} };
  frame.addEventListener('load', () => { if (active?.frame === frame) sendGame('resend'); });
  frame.addEventListener('error', () => { if (active?.frame === frame) gameLoadFailed(active); });
  overlay.querySelector('.game-loading')?.setAttribute('role', 'status');
  loadActiveGame(); paintGameTasks(); history.pushState({ hutGame: true }, '', '#play-' + game.id);
  overlay.querySelector<HTMLButtonElement>('.back-to-hut')?.focus();
}
function closeGame(fromHistory = false) {
  if (!active || active.closing) return;
  active.closing = true; clearTimeout(active.loadTimer); sendGame('pause');
  const old = active;
  setTimeout(() => {
    if (active !== old) return;
    old.disposeGlass(); old.overlay.remove(); active = null; document.body.classList.remove('playing'); audio.setGameOpen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!fromHistory && location.hash.startsWith('#play-')) history.back();
    render(); document.querySelector<HTMLButtonElement>('[data-play="' + old.game.id + '"]')?.focus();
  }, 150);
}
window.addEventListener('message', event => {
  const data = readGameMessage(event, active?.session ?? null); if (!data || !active) return;
  if (data.type === 'ready') { active.ready = true; clearTimeout(active.loadTimer); active.overlay.querySelector('.game-loading')?.classList.add('hidden'); return; }
  active.metrics = data.metrics;
  const previousRounds = state.gamesPlayed;
  const result = commit(save => gameProgress(save, data.gameId, data.roundId, data.metrics), false);
  if (result.added?.length) { toast(result.message, 'gift'); active.overlay.querySelector('.pending-count')!.textContent = String(state.pending.length); }
  if (result.added?.length || previousRounds !== state.gamesPlayed) render();
  paintGameTasks();
});
document.addEventListener('visibilitychange', () => { if (active) sendGame(document.hidden ? 'pause' : 'resume'); });
document.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLElement>('button, a[data-nav]'); if (!target) return;
  audio.unlock();
  if (target.dataset.nav) { route = target.dataset.nav; location.hash = route; if (location.hash.slice(1) === route) render(); window.scrollTo({ top: 0 }); return; }
  if (target.dataset.choose) { const kind = target.dataset.choose as PetKind; if (adoptName === PETS[selectedPet].nickname) adoptName = PETS[kind].nickname; selectedPet = kind; render(); return; }
  if (target.dataset.care) { performCare(target.dataset.care as Care); return; }
  if (target.dataset.play) { openGame(target.dataset.play); return; }
  if (target.dataset.filter) { gameFilter = target.dataset.filter; render(); return; }
  if (target.dataset.album) { albumTab = target.dataset.album; render(); return; }
  if (target.dataset.claim) { const r = commit(save => claimRewards(save, [target.dataset.claim!])); toast(r.message, 'gift'); return; }
  if (target.dataset.petAction) {
    const definition = ACTIONS.find(a => a.id === target.dataset.petAction)!;
    if (definition.level > petLevel().level) return toast('和它亲近到 Lv.' + definition.level + '，就会学会这个小动作。', 'lock');
    openDialog(dialogHead(actionName(definition.id, state.pet!.kind), definition.note) + '<div class="action-preview">' + petCanvas(state.pet!.kind, definition.id) + '<p>好感 Lv.' + definition.level + ' · ' + (definition.level === 1 ? '初见就会的小动作' : '亲近之后的小惊喜') + '</p></div>');
    return;
  }
  const command = target.dataset.command;
  if (command === 'music') { changeSetting('music', !state.settings.music); toast(state.settings.music ? '让音乐，轻轻陪着你。' : '安安静静的，也很好。', 'music'); }
  if (command === 'settings') openSettings();
  if (command === 'close-dialog') document.querySelector<HTMLDialogElement>('dialog')?.close();
  if (command === 'supply') { const r = commit(save => dailySupply(save)); toast(r.message, 'gift'); }
  if (command === 'claim-all') { const r = commit(save => claimRewards(save, 'all')); toast(r.message, 'gift'); }
  if (command === 'rename') {
    const dialog = openDialog(dialogHead('换一个喜欢的名字', '名字可以变，陪伴一直都在。') + '<form id="rename-form"><label class="name-label" for="rename-input">小伙伴的名字</label><div class="name-field">' + icon('edit') + '<input id="rename-input" maxlength="24" value="' + esc(state.pet!.name) + '" required></div><button type="submit" class="primary-button full-width">就叫这个名字</button></form>');
    dialog.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); const r = commit(save => rename(save, dialog.querySelector<HTMLInputElement>('#rename-input')!.value)); if (r.ok) dialog.close(); toast(r.message); });
  }
  if (command === 'export') exportBackup();
  if (command === 'import') document.querySelector<HTMLInputElement>('#backup-file')?.click();
  if (command === 'exit-game') closeGame();
  if (command === 'fullscreen') active?.overlay.requestFullscreen?.().catch(() => toast('可以使用浏览器的全屏功能继续游玩。'));
  if (command === 'reload-game') loadActiveGame();
  if (command === 'dismiss-rotate') active?.overlay.querySelector('.rotate-hint')?.classList.add('dismissed');
  if (command === 'toggle-tasks' && active) { const open = active.overlay.classList.toggle('tasks-open'); sendGame(open ? 'pause' : 'resume'); }
});
document.addEventListener('input', event => { if ((event.target as HTMLElement).id === 'pet-name') adoptName = (event.target as HTMLInputElement).value; });
document.addEventListener('submit', event => {
  if ((event.target as HTMLElement).id !== 'adopt-form') return;
  event.preventDefault(); audio.unlock();
  const r = commit(save => adopt(save, selectedPet, adoptName)); toast(r.message, 'heart'); if (r.ok) { route = 'home'; location.hash = 'home'; }
});
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#play-') && active) return;
  if (active) closeGame(true);
  const next = location.hash.slice(1); route = ['home', 'games', 'bag', 'album'].includes(next) ? next : 'home'; render();
});
window.addEventListener('storage', event => { if (event.key === SAVE_KEY && event.newValue) { const incoming = parseBackup(event.newValue); if (incoming) { state = advanceTime(incoming); render(); paintGameTasks(); } } });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && active && !document.querySelector('dialog[open]')) closeGame(); });
window.addEventListener('pagehide', () => { state = advanceTime(state); persistSave(localStorage, state); });
setInterval(() => {
  if (document.hidden || !state.pet) return;
  commit(save => ({ state: advanceTime(save), ok: true, message: '' }), !active);
}, 60000);
document.addEventListener('pet-image-error', () => { if (!document.querySelector('.asset-error')) { const node = document.createElement('div'); node.className = 'asset-error'; node.setAttribute('role', 'status'); node.textContent = '宠物图片暂未加载成功，请检查网络后刷新。养成进度仍会保存。'; app.prepend(node); } });
if (location.hash.startsWith('#play-')) history.replaceState(null, '', '#games');
render(); if (initial.notice) toast(initial.notice, 'download');
