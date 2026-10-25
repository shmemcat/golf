import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from '../web/node_modules/socket.io-client/build/esm-debug/index.js';
async function until(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(80); }
  throw new Error(label);
}

export async function verifyGolfOnline(stack) {
  const sockets = [];
  try {
    const base = stack.base('gateway');
    const origin = base.replace('127.0.0.1', 'localhost');
    const web = stack.webBase?.('golf') || base;
    const password = 'golf-integration-test-password';
    function browser(target = base, sameOriginPolling = false) {
      const cookies = new Map();
      let csrf = '', golfCsrf = '';
      return {
        cookie: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        async request(path, data) {
          const response = await fetch(target + path, { method: data === undefined ? 'GET' : 'POST', headers: {
            Origin: origin, Cookie: this.cookie(), 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-Golf-CSRF': golfCsrf,
          }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
          for (const entry of response.headers.getSetCookie()) {
            const [name, ...value] = entry.split(';')[0].split('='); cookies.set(name, value.join('='));
          }
          const value = await response.json();
          assert(response.ok, `${path}: ${response.status} ${value.error || ''}`);
          if (value.csrf_token) { if (path.startsWith('/api/golf')) golfCsrf = value.csrf_token; else csrf = value.csrf_token; }
          return value;
        },
        async connect() {
          await this.request('/api/golf/session');
          const socket = io(target + '/golf', { path: '/golf/socket.io', auth: { csrf_token: golfCsrf },
            transports: ['polling', 'websocket'], reconnection: false, forceNew: true, extraHeaders: { ...(!sameOriginPolling ? { Origin: origin } : {}), Cookie: this.cookie() }, timeout: 5000 });
          sockets.push(socket);
          const view = { socket, latest: null };
          socket.on('golf:state', next => { view.latest = next; });
          await new Promise((done, reject) => { socket.once('connect', done); socket.once('connect_error', reject); });
          view.emit = (event, value) => new Promise((done, reject) => socket.timeout(5000).emit(event, value, (error, reply) => error ? reject(error) : done(reply)));
          return view;
        },
      };
    }
    const people = [browser(), browser(web, true)];
    const names = [];
    for (const person of people) {
      const username = 'golf_' + randomUUID().slice(0, 8); names.push(username);
      await person.request('/api/account/session');
      await person.request('/api/account/register', { username, email: username + '@example.test', password });
      const mail = await until(async () => (await stack.mail()).find(m => m.to === username + '@example.test'), 'No local verification email');
      await person.request('/api/account/verify-email', { token: new URL(mail.url).searchParams.get('token') });
      await person.request('/api/account/login', { username, password });
      assert.equal((await person.request('/api/golf/session')).user.name, username);
    }
    const a = await people[0].connect(), b = await people[1].connect();
    const created = (await people[0].request('/api/golf/lobbies', { players: 3, requestId: randomUUID() })).state;
    const code = created.code;
    await people[1].request('/api/golf/lobbies/join', { code });
    for (const view of [a, b]) assert((await view.emit('golf:subscribe', { code })).ok);
    assert.equal(b.latest.mySeat, 1);
    assert.equal(b.latest.seats[0].name, names[0]);
    const reply = await a.emit('golf:action', { code, revision: a.latest.revision, actionId: randomUUID(), action: 'start', fillBots: true });
    assert(reply.ok);
    await until(() => a.latest?.stage === 'opening' && b.latest?.stage === 'opening', 'Starting cards did not arrive');
    for (const view of [a, b]) {
      for (const index of [0, 1]) {
        const answer = await view.emit('golf:action', { code, revision: view.latest.revision, actionId: randomUUID(), action: 'reveal', index });
        assert(answer.ok, JSON.stringify(answer));
        await delay(600);
      }
    }
    await until(() => a.latest?.stage === 'playing' && b.latest?.stage === 'playing', 'Multiplayer did not start');
    assert(a.latest.game.players.every(p => p.cards.filter(c => c.faceUp).length === 2));
    assert(a.latest.game.players.flatMap(p => p.cards).filter(c => !c.faceUp).every(c => Object.keys(c.card).join(',') === 'id'));
    await until(() => a.socket.io.engine.transport.name === 'websocket' && b.socket.io.engine.transport.name === 'websocket', 'Golf did not upgrade to WebSockets');
    const before = Object.fromEntries(await Promise.all(['accounts', 'hearts', 'euchre'].map(async role => [role, await stack.identity(role)])));
    a.socket.disconnect(); b.socket.disconnect();
    const id = a.latest.game.id;
    await stack.restart('golf');
    for (const [role, pid] of Object.entries(before)) assert.equal(await stack.identity(role), pid, `Golf restarted ${role}`);
    assert.equal((await people[0].request('/api/golf/rooms/' + code)).state.game.id, id);
    const returned = await people[0].connect();
    assert((await returned.emit('golf:subscribe', { code })).ok);
    assert.equal(returned.latest.game.id, id);
    assert.equal((await people[0].request('/api/golf/stats')).statistics.multiplayer.games_started, 1);
    assert.equal((await people[0].request('/api/golf/stats')).statistics.bot.games_started, 0);
    for (const mode of ['bot', 'multiplayer']) assert.deepEqual(await people[0].request('/api/golf/leaderboard?mode=' + mode), { monthly: [], all_time: [] });
    const failed = io(base + '/euchre', { path: '/golf/socket.io', forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: { Origin: origin, Cookie: people[0].cookie() }, timeout: 3000 });
    sockets.push(failed);
    await new Promise((done, reject) => { failed.once('connect_error', done); failed.once('connect', () => reject(new Error('Golf accepted the Euchre namespace'))); });
    await people[0].request('/api/account/session');
    await people[0].request('/api/account/delete', { password });
    assert.equal((await people[0].request('/api/account/session')).user, null);
    await until(async () => !(await people[1].request('/api/golf/rooms/' + code)).state.seats.some(p => p.name === names[0]), 'Golf account cleanup did not run');
    assert.equal((await people[1].request('/api/golf/stats')).statistics.multiplayer.games_started, 1);
    await people[1].request('/api/account/session');
    await people[1].request('/api/account/delete', { password });
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
}
