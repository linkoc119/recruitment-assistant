import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReviewMarkup } from '../dist/lib/run-review.js';

test('run review shows frozen-input consequences and escapes server text', () => {
  const html = runReviewMarkup({ positionId: '7', position: '<script>alert(1)</script>', mode: 'rescore', criteriaRevision: 3, policyVersion: 'policy-v1', cvCount: 42, sourceRunId: '8', sourceRun: 'Run 8 · round 2' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Inputs are frozen/);
  assert.match(html, /entire source set succeeds/);
  assert.match(html, /do not carry forward/);
  assert.match(html, /42/);
  assert.match(html, /href="#\/positions\/7\/criteria\/3"/);
  assert.match(html, /href="#\/positions\/7\/screening-runs\/8"/);
  assert.equal((html.match(/<dd><a /g) ?? []).length, 6);
});

test('initial review links every fact back to its position workspace', () => {
  const html = runReviewMarkup({ positionId: '7', position: 'Engineer', mode: 'initial', criteriaRevision: 2, policyVersion: 'policy-v1', cvCount: 3, failedExcluded: 1, duplicateExcluded: 2 });
  assert.match(html, /href="#\/positions\/7\/edit"/);
  assert.match(html, /href="#\/positions\/7\/cv-workspace"/);
  assert.equal((html.match(/<dd><a /g) ?? []).length, 7);
  assert.doesNotMatch(html, /screening-runs\/undefined/);
});
