import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReviewMarkup } from '../dist/lib/run-review.js';

test('run review shows frozen-input consequences and escapes server text', () => {
  const html = runReviewMarkup({ position: '<script>alert(1)</script>', mode: 'rescore', criteriaRevision: 3, policyVersion: 'policy-v1', cvCount: 42, sourceRun: 'Run 8 · round 2' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Inputs are frozen/);
  assert.match(html, /entire source set succeeds/);
  assert.match(html, /do not carry forward/);
  assert.match(html, /42/);
});
