import test from 'node:test';
import assert from 'node:assert/strict';
// Logic tests can run in full Next/TS environment after npm install.
test('URL normalization: only public-shaped domains accepted', async () => {
  const { normalizedUrl } = await import('../lib/safety.ts');
  assert.equal(normalizedUrl('example.com'), 'https://example.com/');
  assert.throws(() => normalizedUrl('localhost:3000'));
  assert.throws(() => normalizedUrl('file:///etc/passwd'));
  assert.throws(() => normalizedUrl('https://user:pass@example.com'));
});
test('private IP ranges are blocked', async () => {
  const { isPublicIP } = await import('../lib/safety.ts');
  assert.equal(isPublicIP('127.0.0.1'), false);
  assert.equal(isPublicIP('169.254.169.254'), false);
  assert.equal(isPublicIP('10.1.2.3'), false);
  assert.equal(isPublicIP('8.8.8.8'), true);
  assert.equal(isPublicIP('::1'), false);
});
