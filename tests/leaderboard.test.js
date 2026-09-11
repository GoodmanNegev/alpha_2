import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchProgress } from '../src/leaderboard.js';

test('leaderboard timeout also aborts a stalled response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let reading = false;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    signal = init.signal;
    return { status: 200, ok: true, json: () => {
      reading = true;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    } };
  });
  const request = fetchProgress();
  const rejected = assert.rejects(request, /请求超时/);
  await Promise.resolve();
  assert.equal(reading, true);
  t.mock.timers.tick(4000);
  await rejected;
  assert.equal(signal.aborted, true);
});

test('leaderboard reports server and malformed-response errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ status: 429, ok: false, json: async () => ({ success: false, error: '请求过于频繁' }) }));
  await assert.rejects(fetchProgress(), /请求过于频繁/);
  t.mock.method(globalThis, 'fetch', async () => ({ status: 502, json: async () => { throw new Error('html'); } }));
  await assert.rejects(fetchProgress(), /无效的响应（502）/);
});
