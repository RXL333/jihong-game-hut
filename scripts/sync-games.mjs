import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { patchGame } from '../integrations/patch-games.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'integrations/games.lock.json'), 'utf8'));
const cache = join(root, '.cache/game-sources');
const adapterFiles = ['patch-games.mjs', 'hub-bridge.js', 'hub-bridge.d.ts', 'metrics.mjs', 'metrics.d.mts'];
const adapterHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).update(adapterFiles.map(name => readFileSync(join(root, 'integrations', name))).join('\n')).digest('hex');
const localSources = { kart: '../卡通卡丁车', watermelon: '../合成西瓜', meadow: '../羊了个羊' };
const npmCli = process.env.npm_execpath || null;
function copyTree(source, destination) {
  if (statSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) copyTree(join(source, entry), join(destination, entry));
  } else {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
  }
}
function run(command, args, cwd, encoding = 'utf8') {
  const p = spawnSync(command, args, { cwd, encoding, stdio: encoding === 'buffer' ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false });
  if (p.error || p.status !== 0) throw new Error('Command failed: ' + command + ' ' + args.join(' ') + (p.error ? '\n' + p.error.message : ''));
  return p.stdout;
}
function npm(args, cwd) {
  if (npmCli) return run(process.execPath, [npmCli, ...args], cwd);
  if (process.platform === 'win32') return run('cmd.exe', ['/d', '/s', '/c', 'npm ' + args.join(' ')], cwd);
  return run('npm', args, cwd);
}
mkdirSync(cache, { recursive: true });
for (const game of lock.games) {
  const output = join(root, 'public/games', game.id);
  const stampFile = join(output, 'hub-build.json');
  if (process.argv.includes('--ensure') && existsSync(stampFile) && existsSync(join(output, 'index.html'))) {
    const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
    if (stamp.revision === game.revision && stamp.adapterHash === adapterHash) { console.log('[games] ' + game.name + ' — 集成副本已就绪'); continue; }
  }
  const checkout = join(cache, game.id);
  if (!existsSync(join(checkout, '.git'))) {
    const local = resolve(root, localSources[game.id] || '.invalid');
    const localCommit = existsSync(join(local, '.git')) ? spawnSync('git', ['cat-file', '-e', game.revision + '^{commit}'], { cwd: local, stdio: 'ignore' }).status === 0 : false;
    run('git', ['clone', '--no-hardlinks', '--no-checkout', localCommit ? local : game.repository, checkout], root);
    run('git', ['remote', 'set-url', 'origin', game.repository], checkout);
  }
  if (spawnSync('git', ['cat-file', '-e', game.revision + '^{commit}'], { cwd: checkout, stdio: 'ignore' }).status !== 0) run('git', ['fetch', '--depth', '1', 'origin', game.revision], checkout);
  // Only this disposable, known cache checkout is changed. Original game folders are read-only.
  const isPinned = existsSync(join(checkout, '.hub-pinned')) && readFileSync(join(checkout, '.hub-pinned'), 'utf8') === game.revision;
  if (!isPinned) run('git', ['checkout', '--detach', game.revision], checkout);
  const original = run('git', ['show', game.revision + ':' + game.entry], checkout, 'buffer').toString('utf8');
  writeFileSync(join(checkout, game.entry), patchGame(game.id, original));
  if (game.id === 'meadow' || game.id === 'watermelon') {
    const html = run('git', ['show', game.revision + ':index.html'], checkout, 'buffer').toString('utf8');
    writeFileSync(join(checkout, 'index.html'), html.replaceAll('羊咩咩', '羊了个羊').replaceAll('西瓜小院', '合成大西瓜'));
  }
  const sourceDir = dirname(join(checkout, game.entry));
  for (const [source, dest] of [['hub-bridge.js', 'hub-bridge.js'], ['hub-bridge.d.ts', 'hub-bridge.d.ts'], ['metrics.mjs', 'hub-metrics.mjs'], ['metrics.d.mts', 'hub-metrics.d.mts']]) copyTree(join(root, 'integrations', source), join(sourceDir, dest));
  writeFileSync(join(checkout, '.hub-pinned'), game.revision);
  if (!existsSync(join(checkout, 'node_modules/.package-lock.json'))) npm(['ci', '--no-audit', '--no-fund'], checkout);
  npm(['run', 'build', '--', '--base=./'], checkout);
  mkdirSync(output, { recursive: true });
  copyTree(join(checkout, 'dist'), output);
  const extension = game.cover.split('.').pop();
  if (existsSync(join(checkout, game.cover))) copyTree(join(checkout, game.cover), join(output, 'cover.' + extension));
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find(name => existsSync(join(checkout, name)));
  if (license) copyTree(join(checkout, license), join(output, 'SOURCE-LICENSE.txt'));
  writeFileSync(join(output, 'SOURCE.txt'), game.name + '\n' + game.repository + '\nRevision: ' + game.revision + '\n小屋集成副本：只加入成绩回传与暂停适配。\n');
  writeFileSync(stampFile, JSON.stringify({ gameId: game.id, revision: game.revision, adapterHash, generatedAt: new Date().toISOString(), cover: 'cover.' + extension }, null, 2));
  console.log('[games] ' + game.name + ' — 构建完成 (' + Math.round(statSync(join(output, 'index.html')).size / 1024) + ' KB entry)');
}
