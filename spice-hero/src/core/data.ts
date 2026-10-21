// data/*.json を型付きで読み込む。値の変更は data/ 側だけで行う（docs/03_BALANCE.md の調整ログに記録）。
import uiThemeJson from '../../data/ui_theme.json' with { type: 'json' };
import inputJson from '../../data/input.json' with { type: 'json' };
import expJson from '../../data/exp_table.json' with { type: 'json' };
import partyJson from '../../data/party.json' with { type: 'json' };
import spellsJson from '../../data/spells.json' with { type: 'json' };
import itemsJson from '../../data/items.json' with { type: 'json' };
import equipmentJson from '../../data/equipment.json' with { type: 'json' };
import shopsJson from '../../data/shops.json' with { type: 'json' };
import enemiesJson from '../../data/enemies.json' with { type: 'json' };
import encountersJson from '../../data/encounters.json' with { type: 'json' };
import mapsJson from '../../data/maps.json' with { type: 'json' };
import chestsJson from '../../data/chests.json' with { type: 'json' };

export type Element = 'fire' | 'thunder' | 'water' | 'light' | 'none';
export type StatusKind = 'poison' | 'sleep' | 'sneeze' | 'flinch';

export interface GrowthDef { base: number; growth: number }
export interface MemberDef {
  id: string;
  name: string;
  nameEditable?: boolean;
  role: string;
  joinFlag?: string;
  commandName?: string;
  fieldAbility?: string;
  skillNoSp?: string;
  growth: { hp: GrowthDef; sp: GrowthDef; str: GrowthDef; def: GrowthDef; agi: GrowthDef };
  initialEquip: { weapon: string | null; armor: string | null; shield: string | null };
  learn: { lv?: number; event?: string; spell: string }[];
}

export interface SpellDef {
  id: string;
  name: string;
  spice?: string;
  sp: number;
  type: string;
  target: string;
  element?: Element;
  power?: [number, number];
  rate?: number;
  stat?: string;
  turns?: number;
  status?: string;
  accuracy?: number;
  bonusTag?: string;
  bonusRate?: number;
  color?: string;
  field?: boolean;
  battle?: boolean;
  desc?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  price: number | null;
  type: string;
  target?: string;
  power?: number;
  status?: string;
  steps?: number;
  rate?: number;
  field?: boolean;
  battle?: boolean;
  desc?: string;
}

export interface EquipDef {
  id: string;
  name: string;
  slot: 'weapon' | 'armor' | 'shield';
  atk?: number;
  def?: number;
  who: string[];
  price: number | null;
  source?: string;
  note?: string;
}

export interface EnemyAction {
  act: string;
  w: number;
  rate?: number;
  status?: string;
  target?: string;
  spell?: string;
  stat?: string;
  turns?: number;
  power?: [number, number];
  debuff?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  area?: string;
  map?: string;
  hp: number;
  atk: number;
  def: number;
  agi: number;
  exp: number;
  gold: number;
  size: number;
  tag?: string;
  weak?: Element[];
  resist?: Element[];
  evasive?: boolean;
  group?: boolean;
  actionsPerTurn?: number;
  nextPhase?: string;
  flags?: string[];
  afterDefeat?: string;
  actions: EnemyAction[];
}

export interface EncounterGroup { w: number; enemies: string[] }
export interface EncounterZone { id: string; expectedLv: number; groups: EncounterGroup[] }

export const uiTheme = uiThemeJson;
export const inputConfig = inputJson;
export const expTable = expJson as { maxLevel: number; totalExp: number[] };
export const partyData = partyJson as unknown as {
  startGold: number;
  startItems: Record<string, number>;
  members: MemberDef[];
};
export const spells = (spellsJson as unknown as { list: SpellDef[] }).list;
export const items = (itemsJson as unknown as { list: ItemDef[]; keyItems: { id: string; name: string; flag?: string; desc?: string }[] });
export const equipment = (equipmentJson as unknown as { list: EquipDef[] }).list;
export const shopsData = shopsJson as unknown as {
  inns: { id: string; map: string; price: number; keeper: string; openFlag?: string }[];
  shops: { id: string; map: string; items: string[]; openFlag?: string }[];
};
const enemiesAll = enemiesJson as unknown as { list: EnemyDef[]; bosses: EnemyDef[] };
export const enemyList: EnemyDef[] = [...enemiesAll.list, ...enemiesAll.bosses];
export const encounters = encountersJson as unknown as {
  safeStepsAfterBattle: number;
  overLevelMargin: number;
  overLevelRateMultiplier: number;
  terrainRate: Record<string, number>;
  zones: EncounterZone[];
};
export const mapsData = mapsJson as unknown as { tileSize: number; list: Record<string, unknown>[] };
export const chestsData = chestsJson as unknown as {
  list: { id: string; map: string; color: string; requiresFlag?: string; content: Record<string, unknown> }[];
  flags: string[];
  onGetLastKey: { speaker: string; text: string };
  redChestMessageLocked: string;
};

const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
export const spellById = byId(spells);
export const itemById = byId(items.list);
export const equipById = byId(equipment);
export const enemyById = byId(enemyList);
export const memberById = byId(partyData.members);

export function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`データがありません: ${what}`);
  return v;
}
