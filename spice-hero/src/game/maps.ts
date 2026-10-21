/**
 * マップ定義（文字で描く）。Tiled に移行するときは、この形（rows/entities）を JSON で読み込むだけ。
 * 文字の意味は LEGEND。座標は「タイル」単位（16×16ドット）。
 */
import type { GameState } from '../core/state.ts';
import { mulberry32 } from './art.ts';

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Terrain = 'beach' | 'grass' | 'road' | 'shallow' | 'indoor' | 'jungle';

export interface TileInfo {
  ground: string;          // 下に敷くタイル名
  obj?: string;            // その上の物（キャラと一緒に前後が決まる）
  front?: string;          // キャラの手前に描く（屋根の端・ヤシの葉）
  solid?: boolean;
  terrain: Terrain;
}

export const LEGEND: Record<string, TileInfo> = {
  D: { ground: 'deep', solid: true, terrain: 'shallow' },
  w: { ground: 'water', solid: true, terrain: 'shallow' },
  h: { ground: 'shallow', terrain: 'shallow' },
  T: { ground: 'shallow', obj: 'stilt', solid: true, terrain: 'shallow' },
  s: { ground: 'sand_shore', terrain: 'beach' },
  '.': { ground: 'sand', terrain: 'beach' },
  g: { ground: 'grass', terrain: 'grass' },
  f: { ground: 'flower', terrain: 'grass' },
  r: { ground: 'road', terrain: 'road' },
  P: { ground: 'sand', obj: 'palm', solid: true, front: 'palm_top', terrain: 'beach' },
  b: { ground: 'grass', obj: 'bush', solid: true, terrain: 'grass' },
  R: { ground: 'sand', obj: 'rock', solid: true, terrain: 'beach' },
  F: { ground: 'sand', obj: 'fence', solid: true, terrain: 'beach' },
  B: { ground: 'sand', obj: 'boat', solid: true, terrain: 'beach' },
  N: { ground: 'sand', obj: 'net', solid: true, terrain: 'beach' },
  J: { ground: 'jungle', solid: true, terrain: 'jungle' },
  // 建物
  k: { ground: 'roof', solid: true, terrain: 'beach' },
  e: { ground: 'roof_edge', solid: true, terrain: 'beach' },
  y: { ground: 'thatch', solid: true, terrain: 'beach' },
  z: { ground: 'thatch_edge', solid: true, terrain: 'beach' },
  x: { ground: 'wall', solid: true, terrain: 'beach' },
  o: { ground: 'window', solid: true, terrain: 'beach' },
  d: { ground: 'door', terrain: 'beach' },
  // 屋内
  W: { ground: 'wall_in', solid: true, terrain: 'indoor' },
  _: { ground: 'wood', terrain: 'indoor' },
  u: { ground: 'rug', terrain: 'indoor' },
  E: { ground: 'bed', solid: true, terrain: 'indoor' },
  v: { ground: 'shelf', solid: true, terrain: 'indoor' },
  t: { ground: 'table', solid: true, terrain: 'indoor' },
  c: { ground: 'counter', solid: true, terrain: 'indoor' },
  p: { ground: 'pot', solid: true, terrain: 'indoor' },
  M: { ground: 'exit_mat', terrain: 'indoor' },
};

export type Script = string | string[] | ((gs: GameState) => string | string[]);

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  look: string;
  dir: Dir;
  wander?: boolean;
  talk: Script | { inn: string };
}

export interface ChestDef { id: string; x: number; y: number }
export interface SearchDef { id: string; x: number; y: number; once?: string; text: Script; give?: { item: string; count?: number } }
export interface ExitDef { x: number; y: number; to: string; tx: number; ty: number; dir?: Dir; blocked?: (gs: GameState) => string | null }

export interface MapDef {
  id: string;
  name: string;
  bgm: 'village' | 'field' | 'inn' | 'cave' | 'castle';
  rows: string[];
  /** ランダムエンカウント: 地形 → ゾーンID */
  encounters?: Partial<Record<Terrain, string>>;
  npcs: NpcDef[];
  chests: ChestDef[];
  searches: SearchDef[];
  exits: ExitDef[];
  /** この画面の戦闘背景 */
  battleBg?: 'beach' | 'jungle' | 'cave' | 'sea' | 'highland' | 'palace' | 'castle';
  area?: string;
  /** 初めて入ったとき場所の名前を出す */
  showName?: boolean;
}

const FIX = (rows: string[], w: number, id: string) => {
  rows.forEach((r, i) => { if (r.length !== w) throw new Error(`マップ ${id} の ${i} 行目の長さが ${r.length}（${w} のはず）`); });
  return rows;
};

// ───────── ココナッツの浜村 24×18 ─────────

const townBeachRows = FIX([
  'DDDDDDDDDDDDDDDDDDDDDDDD',
  'wwwwwwwwwwwwwwwwwwwwwwww',
  'wwwhhhhhwwwwwwwwhhhhhwww',
  'sssshTshsssssssshTshssss',
  '...N.......B.......R....',
  '..kkkkkkk.kkkkkkk.yyyyy.',
  '..eeeeeee.eeeeeee.zzzzz.',
  '..xoxdxox.xoxdxox.xxdxx.',
  '........................',
  'rrrrrrrrrrrrrrrrrrrrrrrr',
  '..f..P.....gg.....P..f..',
  '.P......FFFF.......g....',
  '....bb.................P',
  '.gg.....f..........bb...',
  '..........P.........f...',
  'g..f........gg.....g....',
  'bbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbb',
], 24, 'town_beach');

// ───────── 浜辺の道（フィールド）32×20 ─────────

function buildWorld(): string[] {
  const W = 32, H = 20;
  const rng = mulberry32(2026);
  const rows: string[][] = [];
  for (let y = 0; y < H; y++) {
    rows[y] = [];
    for (let x = 0; x < W; x++) {
      let ch = 'g';
      if (y === 0) ch = 'D';
      else if (y === 1) ch = 'w';
      else if (y === 2) ch = 's';
      else if (y >= H - 2) ch = 'D';
      else if (x < 3) ch = 'D';
      else if (x < 5) ch = '.';
      else if (x < 11) ch = rng() < 0.08 ? 'P' : rng() < 0.15 ? 'g' : '.';
      else ch = rng() < 0.07 ? 'b' : rng() < 0.08 ? 'f' : 'g';
      if (y === H - 3 && x >= 3) ch = rng() < 0.5 ? 'w' : 'h';
      rows[y][x] = ch;
    }
  }
  // 村の入口（左）から、まっすぐな道を東へ
  for (let x = 4; x < W - 4; x++) rows[9][x] = 'r';
  for (let x = 4; x < 8; x++) { rows[8][x] = '.'; rows[10][x] = '.'; }
  // 東は岩でふさぐ（つづきは今後の更新で）
  for (let y = 3; y < H - 2; y++) { rows[y][W - 3] = 'R'; rows[y][W - 2] = 'R'; rows[y][W - 1] = 'R'; }
  for (let x = W - 6; x < W - 3; x++) rows[9][x] = 'r';
  rows[9][W - 3] = 'r'; // 立て札のところ
  rows[8][W - 4] = 'f'; rows[10][W - 4] = 'f';
  return rows.map((r) => r.join(''));
}

const worldRows = FIX(buildWorld(), 32, 'world');

// ───────── 屋内 ─────────

const houseHeroRows = FIX([
  'WWWWWWWW',
  'WvvW_EEW',
  'W______W',
  'W_tt___W',
  'W_uu___W',
  'W______W',
  'WWWMWWWW',
], 8, 'house_hero');

const innRows = FIX([
  'WWWWWWWW',
  'WvvWpWvW',
  'W______W',
  'W_cccc_W',
  'W__uu__W',
  'W______W',
  'WWWMWWWW',
], 8, 'inn_beach_in');

const hutRows = FIX([
  'WWWWWWW',
  'WvvW_pW',
  'W_____W',
  'W__t__W',
  'W_____W',
  'WWWMWWW',
], 7, 'hut_fisher');

// ───────── 台本（ふりがな: {漢字|よみ}） ─────────

const L = {
  mother: (gs: GameState): string[] =>
    gs.flags.f_departed
      ? ['きをつけて いくのよ。\nつらくなったら いつでも かえっておいで。']
      : [
          'おはよう、ゆうしゃ。\n{空|そら}が まっくらで、\n{朝|あさ}なのに よるみたいね…',
          '{海|うみ}の かみさまが たすけを\nもとめているって、{村|むら}の みんなが\nうわさしているわ。',
          'ゆうしゃ。{王|おう}さまが {王都|おうと}で\nあなたを まっているそうよ。\n{気|き}を つけて いってらっしゃい。',
        ],
  okami: ['あら、ゆうしゃ！\nうちの {宿|やど}で ゆっくり やすんでいきな。\nひとばん {6|ろく}ゴールドだよ。'],
  fisher: (gs: GameState): string[] =>
    gs.flags.f_departed
      ? ['この {海|うみ}は、かみさまが まもって くれていたんだ。\nきっと みんなで とりもどせる。']
      : [
          'おう、ゆうしゃ！ このあたりの {海|うみ}は\nタケうまで あるいて さかなを とるのさ。',
          'ちかごろ、{空|そら}が くらい。\nまものも でるように なった。\n{村|むら}を でたら、きをつけろよ！',
          'まものとの たたかいは かんたんだ。\n「たたかう」を えらべば、けんで こうげき！\n「まかせる」なら、みんなが かってに たたかうぞ。',
        ],
  boy: ['ココナッツ、いくつ みつけた？\nヤシの きを しらべると おちてくるよ！'],
  girl: ['あっちの すなはまで カニを みたの。\nちかづくと はさまれちゃうかも！'],
  old: ['むかし むかし、この しまには\nさんにんの かみさまが いたそうな。\nたいよう、うみ、そして かぜの かみさまじゃ。'],
};

// ───────── マップ一覧 ─────────

export const MAPS: Record<string, MapDef> = {
  town_beach: {
    id: 'town_beach', name: 'ココナッツの はまむら', bgm: 'village', rows: townBeachRows, area: 'beach', battleBg: 'beach', showName: true,
    npcs: [
      { id: 'n_fisher', x: 6, y: 3, look: 'fisher', dir: 'down', talk: L.fisher },
      { id: 'n_boy', x: 9, y: 8, look: 'boy', dir: 'left', wander: true, talk: L.boy },
      { id: 'n_girl', x: 15, y: 11, look: 'girl', dir: 'down', wander: true, talk: L.girl },
    ],
    chests: [{ id: 'chest_beach_01', x: 22, y: 13 }],
    searches: [
      { id: 'coconut_1', x: 5, y: 10, once: 'coconut_1', give: { item: 'king_coconut' }, text: 'ヤシの きを ゆらしてみた。\nコトン！ ココナッツが おちてきた！' },
      { id: 'coconut_2', x: 1, y: 11, once: 'coconut_2', give: { item: 'king_coconut' }, text: 'ヤシの きを ゆらしてみた。\nコトン！ ココナッツが おちてきた！' },
      { id: 'coconut_3', x: 18, y: 10, once: 'coconut_3', give: { item: 'king_coconut' }, text: 'ヤシの きを ゆらしてみた。\nコトン！ ココナッツが おちてきた！' },
      { id: 'sign_village', x: 22, y: 8, text: ['{立|た}て{札|ふだ}：\nココナッツの はまむら\n{東|ひがし}へ いくと、{王都|おうと}へ つづく {道|みち}。'] },
      { id: 'boat_note', x: 11, y: 4, text: 'ふるい ふねだ。\nいまは もう うごかないようだ。' },
    ],
    exits: [
      { x: 5, y: 7, to: 'house_hero', tx: 3, ty: 5, dir: 'up' },
      { x: 13, y: 7, to: 'inn_beach_in', tx: 3, ty: 5, dir: 'up' },
      { x: 20, y: 7, to: 'hut_fisher', tx: 3, ty: 4, dir: 'up' },
      { x: 23, y: 9, to: 'world', tx: 5, ty: 9, dir: 'right' },
    ],
  },
  house_hero: {
    id: 'house_hero', name: 'ゆうしゃの いえ', bgm: 'village', rows: houseHeroRows,
    npcs: [{ id: 'n_mother', x: 4, y: 3, look: 'mother', dir: 'down', talk: L.mother }],
    chests: [{ id: 'chest_r03', x: 6, y: 4 }],
    searches: [
      { id: 'bed', x: 5, y: 1, text: 'ゆうしゃの ベッド。\nふかふかで ぐっすり ねむれる。' },
      { id: 'shelf', x: 1, y: 1, text: 'たなに スパイスの びんが ならんでいる。\nシナモンの いいにおいが する。' },
    ],
    exits: [{ x: 3, y: 6, to: 'town_beach', tx: 5, ty: 8, dir: 'down' }],
  },
  inn_beach_in: {
    id: 'inn_beach_in', name: 'やどや', bgm: 'inn', rows: innRows,
    npcs: [{ id: 'n_okami', x: 3, y: 2, look: 'okami', dir: 'down', talk: { inn: 'inn_beach' } }],
    chests: [], searches: [],
    exits: [{ x: 3, y: 6, to: 'town_beach', tx: 13, ty: 8, dir: 'down' }],
  },
  hut_fisher: {
    id: 'hut_fisher', name: 'りょうしの こや', bgm: 'village', rows: hutRows,
    npcs: [{ id: 'n_old', x: 2, y: 2, look: 'old', dir: 'right', talk: L.old }],
    chests: [],
    searches: [{ id: 'net_pot', x: 5, y: 1, text: 'つぼの なかには ほしさかなが たくさん。' }],
    exits: [{ x: 3, y: 5, to: 'town_beach', tx: 20, ty: 8, dir: 'down' }],
  },
  world: {
    id: 'world', name: 'セレンディとう', bgm: 'field', rows: worldRows, area: 'beach', battleBg: 'beach', showName: true,
    encounters: { beach: 'z_beach', grass: 'z_plains_west', road: 'z_plains_west', shallow: 'z_beach' },
    npcs: [],
    chests: [],
    searches: [
      { id: 'sign_end', x: 28, y: 9, text: ['{立|た}て{札|ふだ}：\nこの さきは まだ とおれない。\n（つづきは これから つくるよ！）'] },
    ],
    exits: [{ x: 4, y: 9, to: 'town_beach', tx: 22, ty: 9, dir: 'left' }],
  },
};

/** 全滅したとき・かえりみちのたこで戻る宿屋の中の位置 */
export const INN_ARRIVAL: Record<string, { map: string; x: number; y: number; dir: Dir }> = {
  inn_beach: { map: 'inn_beach_in', x: 3, y: 4, dir: 'up' },
};

export function getMap(id: string): MapDef {
  const m = MAPS[id];
  if (!m) throw new Error(`マップがありません: ${id}`);
  return m;
}

export function tileAt(m: MapDef, x: number, y: number): TileInfo | null {
  const ch = m.rows[y]?.[x];
  return ch === undefined ? null : LEGEND[ch] ?? null;
}

export const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { down: 'up', up: 'down', left: 'right', right: 'left' };
