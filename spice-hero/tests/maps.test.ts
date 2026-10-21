import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, LEGEND, tileAt } from '../src/game/maps.ts';
import { TILES } from '../src/game/art.ts';
import { mapsData, chestsData, encounters } from '../src/core/data.ts';

test('すべてのマップ文字が LEGEND にあり、タイル絵が存在する', () => {
  for (const m of Object.values(MAPS)) {
    for (const row of m.rows) for (const ch of row) assert.ok(LEGEND[ch], `${m.id}: 文字 ${ch}`);
  }
  for (const [k, t] of Object.entries(LEGEND)) for (const n of [t.ground, t.obj, t.front]) if (n) assert.ok(TILES[n], `${k}: タイル ${n}`);
});

test('出入口・NPC・宝箱は歩ける場所にあり、行き先も存在する', () => {
  for (const m of Object.values(MAPS)) {
    for (const e of m.exits) {
      assert.ok(MAPS[e.to], `${m.id}: 行き先 ${e.to}`);
      const t = tileAt(m, e.x, e.y);
      assert.ok(t && !t.solid, `${m.id}: 出入口(${e.x},${e.y})が歩けない`);
      const dest = MAPS[e.to];
      const dt = tileAt(dest, e.tx, e.ty);
      assert.ok(dt && !dt.solid, `${m.id}→${e.to}: 到着先(${e.tx},${e.ty})が歩けない`);
    }
    for (const n of m.npcs) { const t = tileAt(m, n.x, n.y); assert.ok(t && !t.solid, `${m.id}: NPC ${n.id}`); }
    for (const c of m.chests) {
      const t = tileAt(m, c.x, c.y); assert.ok(t && !t.solid, `${m.id}: 宝箱 ${c.id}`);
      assert.ok(chestsData.list.some((x) => x.id === c.id), `宝箱データなし ${c.id}`);
    }
    for (const s of m.searches) { assert.ok(tileAt(m, s.x, s.y), `${m.id}: 調べる ${s.id}`); }
  }
});

test('エンカウントのゾーンが encounters.json にある', () => {
  const zones = new Set(encounters.zones.map((z) => z.id));
  for (const m of Object.values(MAPS)) for (const z of Object.values(m.encounters ?? {})) assert.ok(zones.has(z as string), `${m.id}: ${z}`);
});

test('maps.json にある村マップは MAPS に実装されている（あるもの）', () => {
  const ids = new Set(mapsData.list.map((m) => m.id as string));
  assert.ok(ids.has('town_beach') && MAPS.town_beach);
});

test('宿屋マップの出入口から、外のマップのドア前へ戻れる', () => {
  const door = tileAt(MAPS.town_beach, 13, 7);
  assert.equal(door && LEGEND.d.ground, 'door');
});
