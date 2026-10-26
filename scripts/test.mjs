import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests').filter(name => /\.test\.(?:ts|mjs)$/.test(name)).map(name => `tests/${name}`);
const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
