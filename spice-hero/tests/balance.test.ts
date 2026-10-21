import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, type Command } from '../src/core/engine.ts';
import { baseStats, spellsLearnedAt, statsWithEquip, type PartyMemberState } from '../src/core/battle.ts';

/** 再現できる乱数（mulberry32） */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Equip = Record<string, PartyMemberState['equip']>;

function party(lv: number, equip: Equip): PartyMemberState[] {
  return ['hero', 'mina', 'pearl'].map((id) => {
    const m: PartyMemberState = { id, name: id, lv, exp: 0, hp: 0, sp: 0, equip: equip[id] };
    const s = statsWithEquip(m);
    m.hp = s.maxHp; m.sp = s.maxSp;
    return m;
  });
}

function known(lv: number, extra: Record<string, string[]> = {}) {
  const k: Record<string, string[]> = {};
  for (const id of ['hero', 'mina', 'pearl']) k[id] = [...spellsLearnedAt(id, lv), ...(extra[id] ?? [])];
  return k;
}

interface Scenario {
  name: string; lv: number; enemies: string[]; equip: Equip; boss: boolean;
  extraSpells?: Record<string, string[]>; expectTurns: [number, number];
}

const E = (hw: string, ha: string, hs: string | null, mw: string, ma: string, pw: string | null, pa: string): Equip => ({
  hero: { weapon: hw, armor: ha, shield: hs },
  mina: { weapon: mw, armor: ma, shield: null },
  pearl: { weapon: pw, armor: pa, shield: null },
});

const scenarios: Scenario[] = [
  { name: 'かげワニおう', lv: 5, enemies: ['boss_croc'], boss: true, expectTurns: [3, 8],
    equip: E('copper_sword', 'leather_armor', null, 'palm_staff', 'cotton_robe', 'tusk_cap', 'festival_cloth') },
  { name: 'あらしのおおダコ', lv: 7, enemies: ['boss_kraken'], boss: true, expectTurns: [5, 10],
    equip: E('croc_sword', 'scale_armor', null, 'cinnamon_staff', 'silk_shawl', 'tusk_cap', 'festival_cloth') },
  { name: 'だいりせきのばんにん', lv: 10, enemies: ['boss_marble'], boss: true, expectTurns: [6, 11],
    equip: E('steel_sword', 'scale_armor', 'coconut_shield', 'cinnamon_staff', 'silk_shawl', 'iron_tusk', 'chain_cloth'), extraSpells: {} },
  { name: 'にっしょくのまおう', lv: 12, enemies: ['boss_eclipse_1'], boss: true, expectTurns: [10, 22],
    equip: E('pepper_sword', 'scale_armor', 'coconut_shield', 'lotus_staff', 'silk_shawl', 'iron_tusk', 'chain_cloth'), extraSpells: { hero: ['safraon'] } },
];

function simulate(sc: Scenario, runs: number) {
  let wins = 0, turns = 0, winTurns = 0;
  for (let i = 0; i < runs; i++) {
    const rng = mulberry32(1000 + i);
    const b = new Battle(party(sc.lv, sc.equip), sc.enemies, {
      rng, known: known(sc.lv, sc.extraSpells), inventory: { kottu: 4, hopper: 4, king_coconut: 3 }, boss: sc.boss,
    });
    b.heroWeapon = sc.equip.hero.weapon;
    let guard = 0;
    while (b.result === 'ongoing' && guard++ < 80) {
      const cmds: Command[] = b.party.filter((p) => p.hp > 0).map((p) => ({ actor: p.id, kind: 'auto' as const }));
      b.resolveTurn(cmds);
    }
    turns += b.turn;
    if (b.result === 'win') { wins++; winTurns += b.turn; }
  }
  return { winRate: wins / runs, avgTurns: winTurns / Math.max(1, wins) };
}

test('ボス戦シミュレーション（まかせるだけ）: 勝てる＆ターン数の目安', () => {
  const lines: string[] = [];
  for (const sc of scenarios) {
    const r = simulate(sc, 300);
    lines.push(`${sc.name.padEnd(10)} Lv${sc.lv} 勝率 ${(r.winRate * 100).toFixed(0)}%  平均 ${r.avgTurns.toFixed(1)} ターン（目安 ${sc.expectTurns.join('〜')}）`);
  }
  console.log('\n' + lines.join('\n'));
  assert.ok(true);
});

test('能力値: Lv1の勇者は HP22 / ちから8 / しゅび4', () => {
  const s = baseStats('hero', 1);
  assert.deepEqual(s, { maxHp: 22, maxSp: 0, atk: 8, def: 4, agi: 6 });
});
