/**
 * 戦闘ロジック（描画に依存しない純粋な計算）。仕様: docs/03_BALANCE.md
 * rng は 0以上1未満の乱数関数。テストでは固定値を渡す。
 */
import {
  type Element, type EnemyDef, type SpellDef, type StatusKind,
  enemyById, equipById, expTable, memberById, must, spellById,
} from './data.ts';

export type Rng = () => number;
export const randRange = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
export const randInt = (rng: Rng, min: number, max: number): number => Math.floor(randRange(rng, min, max + 1));

export interface Stats { maxHp: number; maxSp: number; atk: number; def: number; agi: number }

export interface Combatant {
  id: string;
  name: string;
  side: 'party' | 'enemy';
  hp: number;
  sp: number;
  stats: Stats;
  tag?: string;
  weak: Element[];
  resist: Element[];
  evasive: boolean;
  status: Partial<Record<StatusKind, number>>;
  buffs: { stat: 'def' | 'agi' | 'str' | 'accuracy'; rate: number; turns: number }[];
  guarding: boolean;
  /** 「かばう」中。このターン、仲間への攻撃を代わりに受ける */
  covering?: boolean;
  enemyDef?: EnemyDef;
}

export interface PartyMemberState {
  id: string;
  name: string;
  lv: number;
  exp: number;
  hp: number;
  sp: number;
  equip: { weapon: string | null; armor: string | null; shield: string | null };
}

// ───────── 能力値 ─────────

/** 能力値 = floor(base + growth × (Lv-1))。装備ぶんは別に足す */
export function baseStats(memberId: string, lv: number): Stats {
  const g = must(memberById.get(memberId), memberId).growth;
  const at = (d: { base: number; growth: number }) => Math.floor(d.base + d.growth * (lv - 1));
  return { maxHp: at(g.hp), maxSp: at(g.sp), atk: at(g.str), def: at(g.def), agi: at(g.agi) };
}

export function statsWithEquip(m: PartyMemberState): Stats {
  const s = baseStats(m.id, m.lv);
  for (const slot of ['weapon', 'armor', 'shield'] as const) {
    const id = m.equip[slot];
    if (!id) continue;
    const e = must(equipById.get(id), id);
    s.atk += e.atk ?? 0;
    s.def += e.def ?? 0;
  }
  return s;
}

export function levelForExp(totalExp: number): number {
  let lv = 1;
  for (let i = 0; i < expTable.totalExp.length; i++) if (totalExp >= expTable.totalExp[i]) lv = i + 1;
  return Math.min(lv, expTable.maxLevel);
}

export function makePartyCombatant(m: PartyMemberState): Combatant {
  const stats = statsWithEquip(m);
  return {
    id: m.id, name: m.name, side: 'party',
    hp: Math.min(m.hp, stats.maxHp), sp: Math.min(m.sp, stats.maxSp), stats,
    weak: [], resist: [], evasive: false, status: {}, buffs: [], guarding: false,
  };
}

export function makeEnemyCombatant(enemyId: string, index = 0): Combatant {
  const e = must(enemyById.get(enemyId), enemyId);
  return {
    id: `${e.id}#${index}`, name: e.name, side: 'enemy',
    hp: e.hp, sp: 99,
    stats: { maxHp: e.hp, maxSp: 99, atk: e.atk, def: e.def, agi: e.agi },
    tag: e.tag, weak: e.weak ?? [], resist: e.resist ?? [], evasive: !!e.evasive,
    status: {}, buffs: [], guarding: false, enemyDef: e,
  };
}

export const isAlive = (c: Combatant): boolean => c.hp > 0;

function buffRate(c: Combatant, stat: 'def' | 'agi' | 'str' | 'accuracy'): number {
  return c.buffs.filter((b) => b.stat === stat).reduce((r, b) => r * b.rate, 1);
}
export const effAtk = (c: Combatant) => c.stats.atk * buffRate(c, 'str');
export const effDef = (c: Combatant) => c.stats.def * buffRate(c, 'def') * (c.guarding ? 2 : 1);
export const effAgi = (c: Combatant) => c.stats.agi * buffRate(c, 'agi');

// ───────── ダメージ ─────────

export interface DamageResult { damage: number; miss: boolean; critical: boolean }

/** 物理ダメージ。基本 = こうげき÷2 − しゅび÷4。会心 1/32 はしゅびを無視して ×1.5 */
export function physicalDamage(att: Combatant, def: Combatant, rng: Rng, rate = 1, accuracy?: number): DamageResult {
  const acc = (accuracy ?? (def.evasive ? 0.85 : 0.95)) * buffRate(att, 'accuracy');
  if (rng() >= acc) return { damage: 0, miss: true, critical: false };
  const critical = rng() < 1 / 32;
  const A = effAtk(att);
  let base = critical ? (A / 2) * 1.5 : A / 2 - effDef(def) / 4;
  base *= rate;
  let damage: number;
  if (base < 1) damage = rng() < 0.5 ? 0 : 1;
  else damage = Math.floor(base * randRange(rng, 0.875, 1.125));
  return { damage, miss: false, critical };
}

export interface SpellDamageResult { damage: number; weak: boolean; resisted: boolean }

/** 呪文ダメージ。しゅび無関係。弱点×2、耐性×0.5、shadowタグに光×1.5 */
export function spellDamage(spell: SpellDef, target: Combatant, rng: Rng): SpellDamageResult {
  const [min, max] = spell.power ?? [0, 0];
  let dmg = randRange(rng, min, max + 1);
  const el = spell.element ?? 'none';
  const weak = el !== 'none' && target.weak.includes(el);
  const resisted = el !== 'none' && target.resist.includes(el);
  // 弱点(×2)と属性ボーナス(影に光×1.5)は重ねない。大きいほうだけ使う（重ねると魔王戦が一瞬で終わるため）
  const bonus = spell.bonusTag && target.tag === spell.bonusTag ? spell.bonusRate ?? 1 : 1;
  dmg *= Math.max(weak ? 2 : 1, bonus);
  if (resisted) dmg *= 0.5;
  return { damage: Math.max(1, Math.floor(dmg)), weak, resisted };
}

export function healAmount(spell: SpellDef, rng: Rng, healBonus = 1): number {
  const [min, max] = spell.power ?? [0, 0];
  return Math.floor(randRange(rng, min, max + 1) * healBonus);
}

// ───────── 順番・にげる ─────────

/** すばやさ × 乱数(0.8〜1.2) が大きい順 */
export function turnOrder(all: Combatant[], rng: Rng): Combatant[] {
  return all
    .filter(isAlive)
    .map((c) => ({ c, v: effAgi(c) * randRange(rng, 0.8, 1.2) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.c);
}

/** 成功率 = 75% ＋（勇者のすばやさ − 敵の最大すばやさ）× 2%、最低30%、最大95% */
export function runChance(heroAgi: number, enemies: Combatant[]): number {
  const maxAgi = Math.max(...enemies.filter(isAlive).map((e) => e.stats.agi), 0);
  return Math.min(0.95, Math.max(0.3, 0.75 + (heroAgi - maxAgi) * 0.02));
}

export function tryRun(heroAgi: number, enemies: Combatant[], isBoss: boolean, rng: Rng): boolean {
  if (isBoss) return false;
  return rng() < runChance(heroAgi, enemies);
}

// ───────── 状態異常 ─────────

/** ターン終わりの毒: 最大HPの1/16（最低1）。HPが1より下にはならない（子ども向け） */
export function applyPoisonTick(c: Combatant): number {
  if (!c.status.poison || !isAlive(c)) return 0;
  const dmg = Math.max(1, Math.floor(c.stats.maxHp / 16));
  const before = c.hp;
  c.hp = Math.max(1, c.hp - dmg);
  return before - c.hp;
}

/** 行動できるか。ねむりは毎ターン50%で起きる。くしゃみ/ひるみは1回休んで治る */
export function canAct(c: Combatant, rng: Rng): { act: boolean; woke?: boolean; reason?: StatusKind } {
  if (c.status.sleep) {
    if (rng() < 0.5) { delete c.status.sleep; return { act: true, woke: true }; }
    return { act: false, reason: 'sleep' };
  }
  for (const k of ['sneeze', 'flinch'] as const) {
    if (c.status[k]) { delete c.status[k]; return { act: false, reason: k }; }
  }
  return { act: true };
}

export function wakeOnHit(c: Combatant): void {
  if (c.status.sleep) delete c.status.sleep;
}

export function tickBuffs(c: Combatant): void {
  c.buffs.forEach((b) => b.turns--);
  c.buffs = c.buffs.filter((b) => b.turns > 0);
}

// ───────── 敵の行動 ─────────

export function pickWeighted<T extends { w: number }>(list: T[], rng: Rng): T {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const x of list) { r -= x.w; if (r < 0) return x; }
  return list[list.length - 1];
}

export function pickEnemyAction(e: Combatant, rng: Rng) {
  return pickWeighted(must(e.enemyDef, e.id).actions, rng);
}

/** 敵の狙い先: 生きている味方からランダム。かばう中の味方がいればそちらへ */
export function pickTarget(party: Combatant[], rng: Rng): Combatant {
  const alive = party.filter(isAlive);
  const attacked = alive[Math.floor(rng() * alive.length)];
  const cover = alive.find((p) => p.covering);
  return cover ?? attacked;
}

// ───────── 報酬・全滅 ─────────

export function battleRewards(enemies: Combatant[]): { exp: number; gold: number } {
  let exp = 0, gold = 0;
  for (const e of enemies) {
    exp += e.enemyDef?.exp ?? 0;
    gold += e.enemyDef?.gold ?? 0;
  }
  return { exp, gold };
}

export const isWiped = (side: Combatant[]): boolean => side.every((c) => !isAlive(c));

/** 習得する呪文（Lv到達時）。event 付きは含まない */
export function spellsLearnedAt(memberId: string, lv: number): string[] {
  const m = must(memberById.get(memberId), memberId);
  return m.learn.filter((l) => l.lv !== undefined && l.lv <= lv).map((l) => l.spell).filter((id) => spellById.has(id));
}

// ───────── エンカウント ─────────

export function encounterRate(terrain: string, partyLv: number, expectedLv: number, margin: number, mult: number, table: Record<string, number>): number {
  const base = 1 / (table[terrain] ?? 20);
  return partyLv >= expectedLv + margin ? base * mult : base;
}
