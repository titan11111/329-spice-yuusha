import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chestsData, encounters, enemyById, equipById, itemById, mapsData, partyData, shopsData, spellById, enemyList,
} from '../src/core/data.ts';

test('パーティの習得呪文・初期装備がデータに存在する', () => {
  for (const m of partyData.members) {
    for (const l of m.learn) assert.ok(spellById.has(l.spell), `${m.id}: 呪文 ${l.spell}`);
    for (const slot of ['weapon', 'armor', 'shield'] as const) {
      const id = m.initialEquip[slot];
      if (id) assert.ok(equipById.has(id), `${m.id}: 装備 ${id}`);
    }
    if (m.skillNoSp) assert.ok(spellById.has(m.skillNoSp), `${m.id}: ${m.skillNoSp}`);
  }
  for (const id of Object.keys(partyData.startItems)) assert.ok(itemById.has(id), id);
});

test('エンカウント・シンボル配置の敵IDが存在する', () => {
  for (const z of encounters.zones) for (const g of z.groups) for (const e of g.enemies) assert.ok(enemyById.has(e), `zone ${z.id}: ${e}`);
  const sym = (encounters as unknown as { symbols: { placements: { map: string; groups: string[][] }[] } }).symbols;
  for (const p of sym.placements) for (const g of p.groups) for (const e of g) assert.ok(enemyById.has(e), `symbol ${p.map}: ${e}`);
});

test('お店の品物・装備売り先が存在する', () => {
  for (const s of shopsData.shops) for (const id of s.items) assert.ok(itemById.has(id) || equipById.has(id), `shop ${s.id}: ${id}`);
});

test('宝箱の中身・装備の入手元が存在する', () => {
  for (const c of chestsData.list) {
    const ct = c.content as { item?: string; equip?: string };
    if (ct.item) assert.ok(itemById.has(ct.item), `${c.id}: item ${ct.item}`);
    if (ct.equip) assert.ok(equipById.has(ct.equip), `${c.id}: equip ${ct.equip}`);
  }
  const ids = new Set(chestsData.list.map((c) => c.id));
  assert.equal(ids.size, chestsData.list.length, '宝箱IDの重複');
  for (const e of [...equipById.values()]) if (e.source) assert.ok(ids.has(e.source), `${e.id}: source ${e.source}`);
});

test('宿屋・マップのIDが整合している', () => {
  const mapIds = new Set(mapsData.list.map((m) => m.id as string));
  for (const inn of shopsData.inns) assert.ok(mapIds.has(inn.map), `inn ${inn.id}: map ${inn.map}`);
  for (const s of shopsData.shops) assert.ok(mapIds.has(s.map), `shop ${s.id}: map ${s.map}`);
  for (const c of chestsData.list) assert.ok(mapIds.has(c.map), `chest ${c.id}: map ${c.map}`);
});

test('敵データ: ボスのnextPhaseが存在し、通常敵20体＋ボス5エントリ', () => {
  assert.equal(enemyList.length, 25);
  for (const e of enemyList) if (e.nextPhase) assert.ok(enemyById.has(e.nextPhase));
});

test('使用する漢字は {漢字|よみ} 形式（ふりがななしの漢字がdescに無い）', () => {
  const kanji = /[一-鿿]/;
  const strip = (s: string) => s.replace(/\{[^|{}]+\|[^|{}]+\}/g, '');
  for (const s of spellById.values()) if (s.desc) assert.ok(!kanji.test(strip(s.desc)), `spell ${s.id}: ${s.desc}`);
  for (const i of itemById.values()) if (i.desc) assert.ok(!kanji.test(strip(i.desc)), `item ${i.id}: ${i.desc}`);
});
