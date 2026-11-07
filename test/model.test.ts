import test from 'node:test';
import assert from 'node:assert/strict';
import { PackInputError } from '../src/contracts.js';
import { createModel } from '../src/model.js';

test('pack API input errors request replacement while service failures remain retryable', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'local-test-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  for (const [status, code, message] of [[400, 'invalid_image', 'Invalid image'], [422, 'invalid_image', 'Invalid image'], [400, 'invalid_value', 'Could not process image'], [400, 'invalid_model', 'Unknown model'], [500, 'server_error', 'Server failed']] as const) {
    await t.test(`HTTP ${status} ${code}`, async (subtest) => {
      subtest.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
        error: { message, type: 'invalid_request_error', code },
      }), { status, headers: { 'content-type': 'application/json' } }));
      await assert.rejects(createModel().readPack([{
        name: 'corrupt.png', mime: 'image/png', bytes: Buffer.from('not-an-image'),
      }]), error => {
        assert.equal(error instanceof PackInputError, status !== 500 && code !== 'invalid_model');
        if (error instanceof PackInputError) assert.match(error.message, /Pilih foto/);
        return true;
      });
    });
  }
});
