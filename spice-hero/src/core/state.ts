/**
 * ゲーム全体の状態（パーティ・お金・道具・フラグ）と、その更新ルール。描画に依存しない。
 */
import {
  type PartyMemberState, levelForExp, statsWithEquip, spellsLearnedAt,
} from './battle.ts';
import {
  chestsData, equipById, itemById, memberById, must, partyData, shopsData, spellById,
} from './data.ts';

export interface GameState {
  version: 1;
  savedAt: string;
  innId: string;
  mapId: string;
  pos: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' };
  party: PartyMemberState[];
  gold: number;
  items: Record<string, number>;
  keyItems: string[];
  /** 持っている装備（装備していないもの）。装備品IDごとの個数 */
  gear: Record<string, number>;
  flags: Record<string, boolean>;
  defeatCount: Record<string, number>;
  playTimeSec: number;
  settings: Settings;
}

export interface Settings {
  textSpeed: 'normal' | 'fast';
  ruby: boolean;
  bgm: number;
  se: number;
  vibration: boolean;
}

export const defaultSettings = (): Settings => ({ textSpeed: 'normal', ruby: true, bgm: 0.7, se: 0.8, vibration: true });

export function newMember(id: string, lv: number, name?: string): PartyMemberState {
  const def = must(memberById.get(id), id);
  const m: PartyMemberState = {
    id, name: name ?? def.name, lv, exp: 0, hp: 0, sp: 0,
    equip: { ...def.initialEquip },
  };
  const s = statsWithEquip(m);
  m.hp = s.maxHp;
  m.sp = s.maxSp;
  return m;
}

export function newGame(heroName = 'ゆうしゃ'): GameState {
  return {
    version: 1,
    savedAt: new Date(0).toISOString(),
    innId: 'inn_beach',
    mapId: 'house_hero',
    pos: { x: 3, y: 4, dir: 'down' },
    party: [newMember('hero', 1, heroName)],
    gold: partyData.startGold,
    items: { ...partyData.startItems },
    keyItems: [],
    gear: {},
    flags: {},
    defeatCount: {},
    playTimeSec: 0,
    settings: defaultSettings(),
  };
}

// ───────── 仲間の加入 ─────────

/** 仲間はいつも勇者と同じLvで入る */
export function joinMember(gs: GameState, id: string): void {
  if (gs.party.some((m) => m.id === id)) return;
  const hero = gs.party[0];
  const m = newMember(id, hero.lv);
  m.exp = hero.exp;
  gs.party.push(m);
  const def = must(memberById.get(id), id);
  if (def.joinFlag) gs.flags[def.joinFlag] = true;
}

// ───────── 経験値・レベルアップ ─────────

export interface LevelUpInfo { id: string; name: string; from: number; to: number; learned: string[]; gains: { hp: number; sp: number; atk: number; def: number; agi: number } }

/** 経験値は戦闘に参加した全員が同じだけもらう（分けない） */
export function gainExp(gs: GameState, exp: number): LevelUpInfo[] {
  const ups: LevelUpInfo[] = [];
  for (const m of gs.party) {
    const before = statsWithEquip(m);
    const known = new Set(spellsLearnedAt(m.id, m.lv));
    m.exp += exp;
    const lv = levelForExp(m.exp);
    if (lv > m.lv) {
      const from = m.lv;
      m.lv = lv;
      const after = statsWithEquip(m);
      // レベルが上がったぶん、最大値の増加ぶんだけ現在値も増やす
      m.hp += after.maxHp - before.maxHp;
      m.sp += after.maxSp - before.maxSp;
      const learned = spellsLearnedAt(m.id, lv).filter((s) => !known.has(s));
      ups.push({
        id: m.id, name: m.name, from, to: lv, learned,
        gains: { hp: after.maxHp - before.maxHp, sp: after.maxSp - before.maxSp, atk: after.atk - before.atk, def: after.def - before.def, agi: after.agi - before.agi },
      });
    }
  }
  return ups;
}

/** 覚えている呪文（Lv習得＋イベント習得） */
export function knownSpells(gs: GameState, memberId: string): string[] {
  const m = must(gs.party.find((p) => p.id === memberId), memberId);
  const def = must(memberById.get(memberId), memberId);
  const out = spellsLearnedAt(memberId, m.lv);
  for (const l of def.learn) if (l.event && gs.flags[l.event] && spellById.has(l.spell)) out.push(l.spell);
  return [...new Set(out)];
}

// ───────── お金・道具・装備 ─────────

export function addItem(gs: GameState, id: string, n = 1): void {
  gs.items[id] = Math.min(99, (gs.items[id] ?? 0) + n);
}

export function addGear(gs: GameState, id: string): void {
  gs.gear[id] = (gs.gear[id] ?? 0) + 1;
}

export function buy(gs: GameState, id: string): { ok: boolean; reason?: 'gold' | 'full' | 'none' } {
  const it = itemById.get(id);
  const eq = equipById.get(id);
  const price = it?.price ?? eq?.price;
  if (price == null) return { ok: false, reason: 'none' };
  if (gs.gold < price) return { ok: false, reason: 'gold' };
  if (it && (gs.items[id] ?? 0) >= 99) return { ok: false, reason: 'full' };
  gs.gold -= price;
  if (it) addItem(gs, id);
  else addGear(gs, id);
  return { ok: true };
}

/** 装備する。外した装備は持ち物に戻る */
export function equip(gs: GameState, memberId: string, equipId: string): { ok: boolean; reason?: 'who' | 'none' } {
  const e = must(equipById.get(equipId), equipId);
  const m = must(gs.party.find((p) => p.id === memberId), memberId);
  if (!e.who.includes(memberId)) return { ok: false, reason: 'who' };
  if ((gs.gear[equipId] ?? 0) <= 0) return { ok: false, reason: 'none' };
  const old = m.equip[e.slot];
  gs.gear[equipId]--;
  if (old) addGear(gs, old);
  m.equip[e.slot] = equipId;
  clampVitals(m);
  return { ok: true };
}

export function clampVitals(m: PartyMemberState): void {
  const s = statsWithEquip(m);
  m.hp = Math.min(m.hp, s.maxHp);
  m.sp = Math.min(m.sp, s.maxSp);
}

/** 装備した場合の能力の変化（ショップ画面の「こうげき 18→24 ↑」用） */
export function equipDiff(m: PartyMemberState, equipId: string): { stat: 'atk' | 'def'; from: number; to: number } | null {
  const e = must(equipById.get(equipId), equipId);
  if (!e.who.includes(m.id)) return null;
  const before = statsWithEquip(m);
  const after = statsWithEquip({ ...m, equip: { ...m.equip, [e.slot]: equipId } });
  const stat = e.slot === 'weapon' ? 'atk' : 'def';
  return { stat, from: before[stat], to: after[stat] };
}

export function fullHeal(gs: GameState): void {
  for (const m of gs.party) {
    const s = statsWithEquip(m);
    m.hp = s.maxHp;
    m.sp = s.maxSp;
  }
}

// ───────── 宿屋・全滅 ─────────

export function innById(id: string) {
  return must(shopsData.inns.find((i) => i.id === id), id);
}

export function stayAtInn(gs: GameState, innId: string): { ok: boolean } {
  const inn = innById(innId);
  if (gs.gold < inn.price) return { ok: false };
  gs.gold -= inn.price;
  gs.innId = innId;
  fullHeal(gs);
  return { ok: true };
}

/** 全滅: 最後に泊まった宿屋へ。お金・経験値・アイテム・フラグは減らさない */
export function onWipeout(gs: GameState, bossId?: string): { innId: string; hint: boolean } {
  fullHeal(gs);
  gs.mapId = innById(gs.innId).map;
  if (!bossId) return { innId: gs.innId, hint: false };
  gs.defeatCount[bossId] = (gs.defeatCount[bossId] ?? 0) + 1;
  return { innId: gs.innId, hint: gs.defeatCount[bossId] >= 2 };
}

// ───────── 宝箱 ─────────

export type ChestResult =
  | { ok: false; reason: 'locked' | 'opened' }
  | { ok: true; text: string };

/** 赤い宝箱は f_last_key が立つまで開かない。開けたかどうかは宝箱IDと同名のフラグで管理 */
export function openChest(gs: GameState, chestId: string): ChestResult {
  const c = must(chestsData.list.find((x) => x.id === chestId), chestId);
  if (gs.flags[chestId]) return { ok: false, reason: 'opened' };
  if (c.requiresFlag && !gs.flags[c.requiresFlag]) return { ok: false, reason: 'locked' };
  const ct = c.content as { gold?: number; item?: string; count?: number; equip?: string; keyItem?: string };
  const parts: string[] = [];
  if (ct.gold) { gs.gold += ct.gold; parts.push(`${ct.gold}ゴールド`); }
  if (ct.item) {
    const n = ct.count ?? 1;
    addItem(gs, ct.item, n);
    parts.push(`${must(itemById.get(ct.item), ct.item).name}${n > 1 ? `を ${n}こ` : ''}`);
  }
  if (ct.equip) {
    addGear(gs, ct.equip);
    parts.push(must(equipById.get(ct.equip), ct.equip).name);
  }
  if (ct.keyItem && !gs.keyItems.includes(ct.keyItem)) {
    gs.keyItems.push(ct.keyItem);
    parts.push('かあさんの てがみ');
  }
  gs.flags[chestId] = true;
  return { ok: true, text: `${parts.join('と ')}を てにいれた！` };
}

export const hasLastKey = (gs: GameState): boolean => !!gs.flags.f_last_key;
