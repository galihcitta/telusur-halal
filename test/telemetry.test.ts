import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateModelCost } from '../src/telemetry.js';

test('estimates published token rates and leaves unknown prices unavailable', () => {
  const usage = { input_tokens: 1000, output_tokens: 500, total_tokens: 1500, cached_input_tokens: 500 };
  assert.equal(estimateModelCost('gpt-4.1-mini-2025-04-14', usage), 0.00105);
  assert.equal(estimateModelCost('gpt-4o-mini-transcribe', usage), 0.00375);
  assert.equal(estimateModelCost('gpt-4o-mini-transcribe', { audio_seconds: 60 }), 0.003);
  assert.equal(estimateModelCost('gpt-6.1-terra', usage), 0.003025);
  assert.equal(estimateModelCost('unpriced-model', usage), null);
  assert.equal(estimateModelCost('gpt-4.1-mini', null), null);
});
