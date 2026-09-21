import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraftSync } from '../dist/lib/draft-sync.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// save() chains through a resolved promise before calling send(), so the
// first send() lands one microtask after save() returns. Tests that need to
// inspect or mutate state around that call flush the microtask queue first.
const flush = () => Promise.resolve();

test('edits made while a save is in flight are not swallowed', async () => {
  let criteria = [{ id: 1 }];
  const dirtyLog = [];
  const sends = [];
  const pending = [];
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: v => dirtyLog.push(v),
    send: payload => { sends.push(payload); const d = deferred(); pending.push(d); return d.promise; },
  });
  sync.setBaseline(null);

  const firstSave = sync.save();
  await flush();
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0], [{ id: 1 }]);

  // Editor changes while the first request is still in flight.
  criteria = [{ id: 1 }, { id: 2 }];

  pending[0].resolve('draft-v1');
  await firstSave;

  // The response for the stale payload must not clear dirty against the new content.
  assert.equal(dirtyLog[dirtyLog.length - 1], true);
  assert.equal(sync.isDirty(), true);

  const secondSave = sync.save();
  await flush();
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[1], [{ id: 1 }, { id: 2 }]);
  pending[1].resolve('draft-v2');
  await secondSave;
  assert.equal(sync.isDirty(), false);
});

test('payload sent is a snapshot, not a live reference', async () => {
  let criteria = [{ id: 1 }];
  const sends = [];
  const pending = [];
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: () => {},
    send: payload => { sends.push(payload); const d = deferred(); pending.push(d); return d.promise; },
  });
  sync.setBaseline(null);

  const savePromise = sync.save();
  await flush();
  // Mutate the array element after send() has already been called.
  criteria[0].id = 999;
  pending[0].resolve('ok');
  await savePromise;

  assert.equal(sends[0][0].id, 1, 'send() must have received the value as it was at call time');
});

test('an unchanged editor does not send a second request', async () => {
  const criteria = [{ id: 1 }];
  let calls = 0;
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: () => {},
    send: async () => { calls++; return 'saved'; },
  });
  sync.setBaseline(null);

  const first = await sync.save();
  assert.equal(calls, 1);
  assert.equal(first, 'saved');

  const second = await sync.save();
  assert.equal(calls, 1, 'no edits since baseline was set, so save() should not send again');
  assert.equal(second, null);
});

test('concurrent save() calls are queued, never overlapping', async () => {
  const criteria = [{ id: 1 }];
  let inFlight = 0;
  let maxInFlight = 0;
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: () => {},
    send: async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return 'saved';
    },
  });
  sync.setBaseline(null);

  const a = sync.save();
  const b = sync.save();
  await Promise.all([a, b]);
  assert.equal(maxInFlight, 1);
});

test('a failed save keeps dirty state and allows retry', async () => {
  const criteria = [{ id: 1 }];
  let attempt = 0;
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: () => {},
    send: async () => {
      attempt++;
      if (attempt === 1) throw new Error('network_error');
      return 'saved';
    },
  });
  sync.setBaseline(null);

  await assert.rejects(sync.save(), /network_error/);
  assert.equal(sync.isDirty(), true, 'baseline must not have advanced on a failed send');

  const retried = await sync.save();
  assert.equal(retried, 'saved');
  assert.equal(attempt, 2);
  assert.equal(sync.isDirty(), false);
});

test('setBaseline(null) forces a resend even of identical content', async () => {
  const criteria = [{ id: 1 }];
  let calls = 0;
  const sync = createDraftSync({
    read: () => criteria,
    onDirty: () => {},
    send: async () => { calls++; return 'saved-again'; },
  });
  sync.setBaseline(criteria);
  assert.equal(sync.isDirty(), false);

  // Simulate an approve that clears the draft server-side; the same editor
  // content must be treated as new relative to the fresh (null) baseline.
  sync.setBaseline(null);
  assert.equal(sync.isDirty(), true);

  const result = await sync.save();
  assert.equal(calls, 1);
  assert.equal(result, 'saved-again');
});
