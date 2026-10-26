import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { GAMES } from '../src/data/games.ts';

test('三个游戏在本地预览返回各自页面，入口和资源兼容仓库子目录', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const base of ['/', '/test-repository/']) {
    const server = await createServer({ root, configFile: false, base, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    try {
    const address = server.httpServer!.address();
    assert.ok(address && typeof address === 'object');
    const origin = 'http://127.0.0.1:' + address.port;
    for (const game of GAMES) {
      assert.match(game.path, /^games\/[\w-]+\/index\.html$/, '入口必须明确到 HTML，避免目录回退成小屋首页');
      const response = await fetch(origin + base + game.path + '?hubSession=test-session&hubOrigin=' + encodeURIComponent(origin));
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes('<title>' + game.title), game.id + ' 应加载自己的标题');
      assert.ok(!html.includes('/src/main.ts'), game.id + ' 不能返回小屋首页');
      const resources = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)];
      assert.ok(resources.length >= 2, game.id + ' 应有相对路径的脚本和样式');
      for (const [, path] of resources) {
        const resource = new URL(path, origin + '/test-repository/' + game.path);
        assert.ok(resource.pathname.startsWith('/test-repository/games/' + game.id + '/'), '资源必须留在当前游戏目录');
        assert.ok(existsSync(new URL('../public/' + resource.pathname.slice('/test-repository/'.length), import.meta.url)), '游戏资源文件必须存在');
        const servedResource = await fetch(new URL(path, origin + base + game.path));
        assert.equal(servedResource.status, 200, '脚本、样式和预载图片应能从相同部署前缀访问');
        assert.doesNotMatch(servedResource.headers.get('content-type') ?? '', /text\/html/, '资源不能误返回首页 HTML');
      }
      assert.doesNotMatch(html, /(?:src|href)="\/assets\//, '不能使用网站根目录的游戏资源路径');
    }
    } finally { await server.close(); }
  }
});
