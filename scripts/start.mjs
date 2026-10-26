import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!existsSync(new URL('../node_modules/vite', import.meta.url))) {
  const installed = spawnSync(npm, ['ci'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (installed.status) process.exit(installed.status);
}
if (!existsSync(new URL('../public/games/meadow/index.html', import.meta.url))) {
  const built = spawnSync(process.execPath, ['scripts/sync-games.mjs', '--ensure'], { cwd: root, stdio: 'inherit' });
  if (built.status) process.exit(built.status);
}
let port = 4173;
for (; port < 4190; port++) {
  const available = await new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
  if (available) break;
}
if (port >= 4190) throw new Error('4173—4189 端口都在使用中，请关闭旧的小屋预览后重试。');
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: 'inherit' });
const url = 'http://127.0.0.1:' + port + '/';
setTimeout(() => {
  if (process.platform === 'win32') spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', "Start-Process '" + url + "'"], { stdio: 'ignore', windowsHide: true });
  else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore' });
  else spawn('xdg-open', [url], { stdio: 'ignore' });
}, 1000);
process.on('SIGINT', () => child.kill());
child.on('exit', code => process.exit(code ?? 0));
