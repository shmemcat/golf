import { test } from 'node:test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, startNativeStack, freePort } from '../../cards/scripts/split-stack.mjs';
import { verifyGolfOnline } from './verify-online.mjs';

test('Golf has independent HTTP and WebSocket transports, shared account identities, durable rooms and account cleanup', { timeout: 120000 }, async () => {
  await mkdir(resolve(root, '.local'), { recursive: true });
  const directory = await mkdtemp(resolve(root, '.local/split-golf-test-'));
  let stack;
  try {
    stack = await startNativeStack({ directory, golf: true, web: true, webPorts: { hearts: await freePort(), euchre: await freePort(), golf: await freePort() } });
    await verifyGolfOnline(stack);
  } catch (error) {
    error.message += '\n' + (stack?.logs() || 'Stack did not start');
    throw error;
  } finally {
    await stack?.close();
  }
});
