import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema, defaults, calculate, QuoteError, whatsapp } from '../lib/domain.ts';

const withPhone = (phone) => settingsSchema.safeParse({ ...defaults, phone });

test('whatsapp number must be an Egyptian mobile starting with 20 (12 digits)', () => {
  assert.equal(withPhone('201551943676').success, true);
  assert.equal(withPhone('01551943676').data?.phone, '201551943676');
  assert.equal(withPhone('010012345678').success, false);
  assert.equal(withPhone('12345678').success, false);
  assert.equal(withPhone('2015519436761').success, false);
  assert.throws(() => whatsapp('010012345678', 'x'));
});

test('calculator shows the 1 million limit message for huge amounts', () => {
  const id = defaults.services.find((s) => s.enabled).id;
  for (const amount of ['1000001', '10000000', '123456789012']) {
    assert.throws(() => calculate(defaults, id, amount), (e) => e instanceof QuoteError && /مليون/.test(e.message));
  }
  assert.throws(() => calculate(defaults, id, '0'), (e) => /أكبر من صفر/.test(e.message));
});
