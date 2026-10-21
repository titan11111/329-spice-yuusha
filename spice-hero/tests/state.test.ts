import test from 'node:test';
import assert from 'node:assert/strict';
import { buy, equip, equipDiff, gainExp, joinMember, knownSpells, newGame, onWipeout, openChest, stayAtInn } from '../src/core/state.ts';
import { MemoryStore, SAVE_KEY, loadGame, saveGame, hasSave, loadPadBinding, savePadBinding } from '../src/core/save.ts';

test('新規ゲーム: Lv1・木の棒・50G・ホッパー2個', () => {
  const gs = newGame();
  assert.equal(gs.party.length, 1);
  assert.equal(gs.party[0].lv, 1);
  assert.equal(gs.party[0].equip.weapon, 'stick');
  assert.equal(gs.gold, 50);
  assert.equal(gs.items.hopper, 2);
});

test('経験値: 全員が同じだけもらい、Lvが上がると呪文を覚える', () => {
  const gs = newGame();
  const ups = gainExp(gs, 25);
  assert.equal(gs.party[0].lv, 3);
  assert.deepEqual(ups[0].learned, ['cinnamo']);
  assert.ok(knownSpells(gs, 'hero').includes('cinnamo'));
});

test('仲間は勇者と同じLvで加入し、加入フラグが立つ', () => {
  const gs = newGame();
  gainExp(gs, 50);
  joinMember(gs, 'mina');
  const mina = gs.party.find((m) => m.id === 'mina')!;
  assert.equal(mina.lv, gs.party[0].lv);
  assert.ok(gs.flags.f_mina);
  assert.deepEqual(knownSpells(gs, 'mina').sort(), ['carda', 'cinnamo', 'clove', 'pepari']);
});

test('イベント呪文: サフラオンは f_god_wind が立ってから', () => {
  const gs = newGame();
  gainExp(gs, 1150);
  assert.ok(!knownSpells(gs, 'hero').includes('safraon'));
  gs.flags.f_god_wind = true;
  assert.ok(knownSpells(gs, 'hero').includes('safraon'));
});

test('買い物と装備: お金が足りないと買えず、装備すると前の装備は持ち物へ', () => {
  const gs = newGame();
  assert.equal(buy(gs, 'copper_sword').ok, false);
  gs.gold = 200;
  assert.equal(buy(gs, 'copper_sword').ok, true);
  assert.equal(gs.gold, 140);
  assert.deepEqual(equipDiff(gs.party[0], 'copper_sword'), { stat: 'atk', from: 10, to: 16 });
  assert.equal(equip(gs, 'hero', 'copper_sword').ok, true);
  assert.equal(gs.party[0].equip.weapon, 'copper_sword');
  assert.equal(gs.gear.stick, 1);
  assert.equal(equip(gs, 'hero', 'cinnamon_staff').ok, false);
});

test('宿屋: 泊まると全回復・お金が減る・戻る宿屋が更新される', () => {
  const gs = newGame();
  gs.party[0].hp = 1;
  assert.equal(stayAtInn(gs, 'inn_beach').ok, true);
  assert.equal(gs.gold, 44);
  assert.equal(gs.party[0].hp, 22);
  gs.gold = 0;
  assert.equal(stayAtInn(gs, 'inn_capital').ok, false);
});

test('全滅: お金は減らず宿屋に戻る。同じボスで2回全滅するとヒント', () => {
  const gs = newGame();
  gs.gold = 123;
  gs.party[0].hp = 0;
  const r1 = onWipeout(gs, 'boss_croc');
  assert.equal(gs.gold, 123);
  assert.equal(gs.party[0].hp, 22);
  assert.equal(r1.hint, false);
  assert.equal(onWipeout(gs, 'boss_croc').hint, true);
});

test('赤い宝箱: さいごのカギが無いと開かず、あれば一度だけ開く', () => {
  const gs = newGame();
  assert.deepEqual(openChest(gs, 'chest_r03'), { ok: false, reason: 'locked' });
  gs.flags.f_last_key = true;
  const r = openChest(gs, 'chest_r03');
  assert.ok(r.ok);
  assert.equal(gs.items.panacea, 1);
  assert.ok(gs.keyItems.includes('mother_letter'));
  assert.deepEqual(openChest(gs, 'chest_r03'), { ok: false, reason: 'opened' });
});

test('通常の宝箱: お金とアイテムが入る', () => {
  const gs = newGame();
  assert.ok(openChest(gs, 'chest_beach_01').ok);
  assert.equal(gs.items.hopper, 4);
});

test('セーブ/ロード: 往復できる。壊れたセーブは null、古い項目は補われる', () => {
  const store = new MemoryStore();
  assert.equal(hasSave(store), false);
  const gs = newGame('タロウ');
  gs.gold = 999;
  assert.equal(saveGame(gs, store), true);
  const back = loadGame(store)!;
  assert.equal(back.gold, 999);
  assert.equal(back.party[0].name, 'タロウ');

  store.setItem(SAVE_KEY, '{こわれた');
  assert.equal(loadGame(store), null);

  store.setItem(SAVE_KEY, JSON.stringify({ version: 1, gold: 5 }));
  const old = loadGame(store)!;
  assert.equal(old.gold, 5);
  assert.equal(old.party.length, 1);
  assert.equal(old.settings.ruby, true);

  store.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
  assert.equal(loadGame(store), null);
});

test('パッドのボタン設定: パッドIDごとに保存できる', () => {
  const store = new MemoryStore();
  savePadBinding('Joy-Con (L)', { buttons: { confirm: [1] }, axes: { up: { index: 9, dir: -1 } } }, store);
  assert.deepEqual(loadPadBinding('Joy-Con (L)', store)?.buttons.confirm, [1]);
  assert.equal(loadPadBinding('other', store), null);
});
