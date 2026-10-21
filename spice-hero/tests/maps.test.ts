import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, LEGEND, tileAt, INN_ARRIVAL } from '../src/game/maps.ts';
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

test('到着タイルが別の出入口と重なっていない（出入口ループを防ぐ）', () => {
  for (const m of Object.values(MAPS)) {
    for (const e of m.exits) {
      const dest = MAPS[e.to];
      const onTop = dest.exits.find((d) => d.x === e.tx && d.y === e.ty);
      assert.ok(!onTop, `${m.id}→${e.to}: 到着先(${e.tx},${e.ty})が ${e.to} の出入口と重なっている`);
    }
  }
});

test('はまむらから すべてのマップへ 歩いて たどりつける', () => {
  const seen = new Set<string>(['town_beach']);
  const queue = ['town_beach'];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of MAPS[id].exits) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  const missing = Object.keys(MAPS).filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], `たどりつけないマップ: ${missing.join(', ')}`);
});

test('出入口は行き来できる（行った先から 元のマップへ もどれる）', () => {
  for (const m of Object.values(MAPS)) {
    for (const e of m.exits) {
      const back = MAPS[e.to].exits.some((d) => d.to === m.id);
      assert.ok(back, `${m.id}→${e.to}: ${e.to} から ${m.id} へ もどる出入口がない`);
    }
  }
});

test('宿屋データの map が 実装済みなら INN_ARRIVAL に もどり先がある', () => {
  for (const m of Object.values(MAPS)) {
    for (const n of m.npcs) {
      const t = n.talk;
      if (typeof t === 'object' && !Array.isArray(t) && 'inn' in t) {
        assert.ok(INN_ARRIVAL[t.inn], `${m.id}: 宿屋 ${t.inn} の もどり先がない`);
      }
    }
  }
});
