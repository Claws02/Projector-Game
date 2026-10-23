import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSlots } from '../src/players.js';

test('first detection becomes P1, second becomes P2', () => {
  const slots = new PlayerSlots();
  slots.update([{ x: 0.3, y: 0.5 }], 0);
  slots.update([{ x: 0.3, y: 0.5 }, { x: 0.8, y: 0.5 }], 0.1);
  assert.equal(slots.slots[0].x, 0.3);
  assert.equal(slots.slots[1].x, 0.8);
  assert.equal(slots.activeCount, 2);
});

test('identity survives detection order swapping', () => {
  const slots = new PlayerSlots();
  slots.update([{ x: 0.2, y: 0.5, tag: 'a' }, { x: 0.8, y: 0.5, tag: 'b' }], 0);
  slots.update([{ x: 0.82, y: 0.5, tag: 'b' }, { x: 0.22, y: 0.5, tag: 'a' }], 0.03);
  assert.equal(slots.slots[0].det.tag, 'a');
  assert.equal(slots.slots[1].det.tag, 'b');
});

test('a briefly missed player keeps their slot; a long absence frees it', () => {
  const slots = new PlayerSlots({ dropAfter: 0.8 });
  slots.update([{ x: 0.2, y: 0.5 }], 0);
  slots.update([], 0.5);
  assert.equal(slots.activeCount, 1, 'still active inside grace period');
  assert.equal(slots.slots[0].det, null, 'but no shadow to collide with');
  slots.update([], 1.0);
  assert.equal(slots.activeCount, 0);
});

test('a third person is ignored when both slots are taken', () => {
  const slots = new PlayerSlots();
  slots.update([{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }], 0);
  assert.equal(slots.activeCount, 2);
});
