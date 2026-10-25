import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { get } from 'node:http';
import { startContainerStack } from '../../cards/scripts/container-stack.mjs';
import { verifySplitStack } from '../../cards/scripts/verify-split-stack.mjs';
import { verifyGolfOnline } from './verify-online.mjs';

const [statusPath, ...recordPaths] = process.argv.slice(2);
if (!statusPath) throw new Error('Use status.json [published-component.json ...]');
const read = async path => JSON.parse(await readFile(resolve(path), 'utf8'));
const status = await read(statusPath);
const images = { ...status.images };
const roles = { 'cards-accounts': 'accounts', 'cards-gateway': 'gateway', 'golf-game': 'golf', 'golf-web': 'golf-web' };
for (const path of recordPaths) {
  const record = await read(path);
  assert(roles[record.component], 'Unsupported rehearsal component');
  images[roles[record.component]] = record.image;
}
let stack;
try {
  stack = await startContainerStack({
    pins: Object.fromEntries(['accounts', 'hearts', 'euchre', 'gateway'].map(key => [key, images[key]])),
    golf: { game: images.golf, web: images['golf-web'] }, echo: true,
  });
  const base = stack.base('gateway');
  for (const route of ['/golf/', '/golf/rules', '/golf/play']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert((await response.text()).includes('/golf/assets/'));
  }
  assert.equal((await fetch(base + '/golf/assets/missing.js')).status, 404);
  assert.equal((await fetch(base + '/golf', { redirect: 'manual' })).status, 308);
  const redirected = await new Promise((done, reject) => {
    get(base + '/rules?from=rehearsal', { headers: { Host: 'golf.shmem.dev' } }, response => {
      response.resume(); done({ status: response.statusCode, location: response.headers.location });
    }).on('error', reject);
  });
  assert.equal(redirected.status, 308);
  assert.equal(redirected.location, 'https://cards.shmem.dev/golf/rules?from=rehearsal');
  const health = Object.fromEntries(await Promise.all(['accounts', 'hearts', 'euchre', 'golf'].map(async role => [role, await stack.health(role)])));
  await verifySplitStack(stack);
  await verifyGolfOnline(stack);
  await stack.command(['exec', '-T', 'golf', 'python', '-c', "from golf_server.wsgi import app; from golf_server.extensions import db; from sqlalchemy import text; from sqlalchemy.exc import ProgrammingError\nwith app.app_context():\n try: db.session.execute(text('SELECT * FROM users LIMIT 0'))\n except ProgrammingError as error: assert error.orig.pgcode=='42501'\n else: raise AssertionError('Golf can read shared account tables')"]);
  const report = { healthy: true, images, health, golfTransports: true, sharedAccounts: true, deletion: true, restartRecovery: true, privateDatabaseRole: true };
  await writeFile(resolve(stack.directory, 'golf-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, report: resolve(stack.directory, 'golf-report.json') }));
} finally {
  await stack?.close();
}
