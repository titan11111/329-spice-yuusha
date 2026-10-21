import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager, applyLearn, detectLearn, emptyBinding, padActions, type PadSnapshot } from '../src/core/input.ts';
import { MemoryStore } from '../src/core/save.ts';

const snap = (over: Partial<PadSnapshot> = {}): PadSnapshot => ({
  id: 'Test Pad', mapping: 'standard', buttons: Array(17).fill(false), axes: [0, 0, 0, 0], ...over,
});
const withButtons = (...idx: number[]) => { const b = Array(17).fill(false); idx.forEach((i) => (b[i] = true)); return b; };

test('standardパッド: 十字キー・A・B・メニュー', () => {
  assert.deepEqual([...padActions(snap({ buttons: withButtons(12) }), null)], ['up']);
  assert.ok(padActions(snap({ buttons: withButtons(0) }), null).has('confirm'));
  assert.ok(padActions(snap({ buttons: withButtons(1) }), null).has('cancel'));
  assert.ok(padActions(snap({ buttons: withButtons(9) }), null).has('menu'));
});

test('スティック: デッドゾーン0.5。斜めは強いほうだけ（4方向）', () => {
  assert.equal(padActions(snap({ axes: [0.3, 0.3, 0, 0] }), null).size, 0);
  assert.deepEqual([...padActions(snap({ axes: [0.9, 0.6, 0, 0] }), null)], ['right']);
  assert.deepEqual([...padActions(snap({ axes: [-0.6, -0.9, 0, 0] }), null)], ['up']);
});

test('Joy-Con1本（mappingが空）: 設定がなければ何も反応せず、設定すると動く', () => {
  const p = snap({ id: 'Joy-Con (L)', mapping: '', buttons: withButtons(3), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1] });
  assert.equal(padActions(p, null).size, 0);
  const b = emptyBinding();
  applyLearn(b, 'confirm', { button: 3 });
  applyLearn(b, 'up', { axis: { index: 9, dir: -1 } });
  assert.deepEqual([...padActions(p, b)].sort(), ['confirm', 'up']);
});

test('ボタン設定の検出: 新しく押したボタン、倒れた軸を見つける', () => {
  const a = snap({ mapping: '' });
  assert.equal(detectLearn(a, a), null);
  assert.deepEqual(detectLearn(a, snap({ mapping: '', buttons: withButtons(5) })), { button: 5 });
  assert.deepEqual(detectLearn(a, snap({ mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] })), { axis: { index: 9, dir: 1 } });
  // 押しっぱなしでは二重に検出しない
  const held = snap({ mapping: '', buttons: withButtons(5) });
  assert.equal(detectLearn(held, held), null);
});

test('InputManager: タッチの押下・長押しリピート（0.25秒待って0.12秒ごと）', () => {
  const im = new InputManager({ target: undefined, store: new MemoryStore(), getPads: () => [] });
  im.update(0);
  im.setTouch('down', true);
  im.update(16);
  assert.ok(im.pressed('down'));
  assert.ok(im.repeat('down'));
  im.update(100);
  assert.ok(!im.repeat('down'));
  im.update(280);
  assert.ok(im.repeat('down'), '0.25秒たったら1回くり返す');
  im.update(300);
  assert.ok(!im.repeat('down'));
  im.update(420);
  assert.ok(im.repeat('down'), 'そのあと0.12秒ごと');
  im.setTouch('down', false);
  im.update(440);
  assert.ok(!im.isDown('down'));
  assert.equal(im.lastKind, 'touch');
});

test('InputManager: 向きは最後に押したものを優先', () => {
  const im = new InputManager({ target: undefined, store: new MemoryStore(), getPads: () => [] });
  im.update(0);
  im.setTouch('left', true);
  im.update(16);
  im.setTouch('up', true);
  im.update(32);
  assert.equal(im.direction(), 'up');
});

test('InputManager: Joy-Con1本をつなぐと設定画面が必要になる', () => {
  const fake = { id: 'Joy-Con (R)', mapping: '', connected: true, axes: [0, 0], buttons: [{ pressed: false, value: 0 }] } as unknown as Gamepad;
  const im = new InputManager({ target: undefined, store: new MemoryStore(), getPads: () => [fake] });
  im.update(0);
  assert.equal(im.needsSetup, 'Joy-Con (R)');
  im.saveBinding('Joy-Con (R)', { buttons: { confirm: [0] }, axes: {} });
  assert.equal(im.needsSetup, null);
  (fake.buttons[0] as { pressed: boolean }).pressed = true;
  im.update(16);
  assert.ok(im.pressed('confirm'));
});
