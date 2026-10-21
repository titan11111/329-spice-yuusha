/**
 * ドット絵の素材をコードで描く（手描き素材ができるまでの仮絵。差し替えは同じキーで画像を読み込むだけ）。
 * タイル16×16 / キャラ16×24 / 敵32×32〜 / 戦闘背景320×120
 */
export function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
export function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
}
const r = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
// ───────── パレット ─────────
export const PAL = {
    sand: '#e8d29a', sand2: '#d9bd80', sandDark: '#c4a468',
    grass: '#6aa84f', grass2: '#58943f', grassDark: '#3f7a30',
    water: '#2f8fcf', water2: '#4aa8e0', waterDeep: '#1f6fae', foam: '#d8f1ff',
    wood: '#8a5a2b', woodDark: '#5e3a18', woodLight: '#b37c43',
    roof: '#c0532f', roofDark: '#8f3a1f', roofLight: '#e07a4a',
    wall: '#f3e6c4', wallDark: '#cdb98c',
    palm: '#2e7d32', palmDark: '#1b5e20', trunk: '#8d6e3f',
    stone: '#8c8c94', stoneDark: '#5e5e66', stoneLight: '#b8b8c0',
    gold: '#d4a437', red: '#e2452b', outline: '#1a0f08', cream: '#fff3d6',
    skin: '#f0c090',
};
const noise = (c, rng, cols, n) => {
    for (let i = 0; i < n; i++)
        r(c, Math.floor(rng() * 16), Math.floor(rng() * 16), 1, 1, cols[Math.floor(rng() * cols.length)]);
};
export const TILES = {
    sand: (c, g) => { r(c, 0, 0, 16, 16, PAL.sand); noise(c, g, [PAL.sand2, PAL.sandDark, '#f2e0b0'], 14); },
    sand_shore: (c, g) => { r(c, 0, 0, 16, 16, PAL.sand); r(c, 0, 0, 16, 5, PAL.water2); r(c, 0, 5, 16, 2, PAL.foam); noise(c, g, [PAL.sand2], 8); },
    grass: (c, g) => { r(c, 0, 0, 16, 16, PAL.grass); noise(c, g, [PAL.grass2, PAL.grassDark, '#7bbd5e'], 18); },
    flower: (c, g) => { TILES.grass(c, g); r(c, 4, 5, 2, 2, '#ffd23f'); r(c, 10, 10, 2, 2, '#ff7aa8'); r(c, 11, 3, 2, 2, '#ffffff'); },
    water: (c, g) => { r(c, 0, 0, 16, 16, PAL.water); for (let i = 0; i < 5; i++)
        r(c, Math.floor(g() * 12), Math.floor(g() * 16), 3, 1, PAL.water2); },
    water2: (c, g) => { r(c, 0, 0, 16, 16, PAL.water); for (let i = 0; i < 5; i++)
        r(c, Math.floor(g() * 12), Math.floor(g() * 16), 3, 1, PAL.waterDeep); },
    deep: (c, g) => { r(c, 0, 0, 16, 16, PAL.waterDeep); for (let i = 0; i < 4; i++)
        r(c, Math.floor(g() * 12), Math.floor(g() * 16), 3, 1, PAL.water); },
    shallow: (c, g) => { r(c, 0, 0, 16, 16, '#6cc6e8'); noise(c, g, [PAL.foam, PAL.sand], 10); },
    road: (c, g) => { r(c, 0, 0, 16, 16, '#c9a56a'); noise(c, g, ['#b48e55', '#d9b97f'], 16); },
    wood: (c, g) => { r(c, 0, 0, 16, 16, PAL.woodLight); for (let y = 0; y < 16; y += 4)
        r(c, 0, y, 16, 1, PAL.wood); r(c, 5 + Math.floor(g() * 6), 0, 1, 16, PAL.wood); },
    rug: (c) => { r(c, 0, 0, 16, 16, '#a63a2a'); r(c, 1, 1, 14, 14, '#c9552f'); r(c, 3, 3, 10, 10, '#a63a2a'); r(c, 6, 6, 4, 4, PAL.gold); },
    // 壁・屋根（高さのレイヤー）
    wall: (c) => { r(c, 0, 0, 16, 16, PAL.wall); r(c, 0, 0, 16, 1, PAL.wallDark); r(c, 0, 8, 16, 1, PAL.wallDark); r(c, 7, 0, 1, 8, PAL.wallDark); r(c, 3, 8, 1, 8, PAL.wallDark); r(c, 11, 8, 1, 8, PAL.wallDark); },
    wall_in: (c) => { r(c, 0, 0, 16, 16, '#6b4a2e'); r(c, 0, 0, 16, 2, '#4a3220'); for (let x = 0; x < 16; x += 4)
        r(c, x, 2, 1, 14, '#5a3d25'); },
    roof: (c) => { r(c, 0, 0, 16, 16, PAL.roof); for (let y = 0; y < 16; y += 4)
        r(c, 0, y + 3, 16, 1, PAL.roofDark); for (let y = 0; y < 16; y += 8)
        for (let x = 0; x < 16; x += 4)
            r(c, x + (y ? 2 : 0), y, 1, 3, PAL.roofLight); },
    roof_edge: (c) => { TILES.roof(c, () => 0); r(c, 0, 13, 16, 3, PAL.roofDark); },
    thatch: (c, g) => { r(c, 0, 0, 16, 16, '#c9a24a'); for (let i = 0; i < 22; i++)
        r(c, Math.floor(g() * 16), Math.floor(g() * 16), 1, 3, g() < 0.5 ? '#a8832f' : '#e0be66'); },
    thatch_edge: (c, g) => { TILES.thatch(c, g); r(c, 0, 13, 16, 3, '#8a6a22'); },
    door: (c) => { TILES.wall(c, () => 0); r(c, 3, 2, 10, 14, PAL.woodDark); r(c, 4, 3, 8, 13, PAL.wood); r(c, 10, 9, 2, 2, PAL.gold); },
    window: (c) => { TILES.wall(c, () => 0); r(c, 4, 3, 8, 8, PAL.woodDark); r(c, 5, 4, 6, 6, '#9fd8f0'); r(c, 7, 4, 1, 6, PAL.woodDark); r(c, 5, 7, 6, 1, PAL.woodDark); },
    exit_mat: (c) => { TILES.wood(c, () => 0.5); r(c, 2, 6, 12, 8, '#7a4a2a'); r(c, 3, 7, 10, 6, '#a0653a'); },
    // 物
    palm: (c, g) => {
        TILES.sand(c, g);
        r(c, 7, 7, 2, 9, PAL.trunk);
        r(c, 7, 9, 2, 1, '#6e5530');
        r(c, 7, 12, 2, 1, '#6e5530');
        r(c, 2, 3, 6, 2, PAL.palm);
        r(c, 8, 3, 6, 2, PAL.palm);
        r(c, 5, 1, 6, 3, PAL.palmDark);
        r(c, 1, 5, 4, 2, PAL.palmDark);
        r(c, 11, 5, 4, 2, PAL.palmDark);
        r(c, 6, 6, 2, 2, '#7a5a2a');
        r(c, 9, 6, 2, 2, '#7a5a2a');
    },
    palm_top: (c) => { c.clearRect(0, 0, 16, 16); r(c, 2, 8, 6, 2, PAL.palm); r(c, 8, 8, 6, 2, PAL.palm); r(c, 5, 6, 6, 3, PAL.palmDark); r(c, 1, 10, 4, 2, PAL.palmDark); r(c, 11, 10, 4, 2, PAL.palmDark); },
    bush: (c, g) => { TILES.grass(c, g); r(c, 2, 5, 12, 9, PAL.grassDark); r(c, 3, 4, 10, 4, PAL.grass2); r(c, 5, 7, 2, 2, '#e24a6a'); r(c, 10, 9, 2, 2, '#e24a6a'); },
    rock: (c, g) => { TILES.sand(c, g); r(c, 2, 6, 12, 9, PAL.stone); r(c, 3, 5, 9, 3, PAL.stoneLight); r(c, 2, 12, 12, 3, PAL.stoneDark); },
    fence: (c, g) => { TILES.sand(c, g); r(c, 0, 6, 16, 2, PAL.wood); r(c, 0, 11, 16, 2, PAL.wood); r(c, 2, 4, 2, 11, PAL.woodDark); r(c, 12, 4, 2, 11, PAL.woodDark); },
    boat: (c, g) => { TILES.sand(c, g); r(c, 1, 8, 14, 6, PAL.wood); r(c, 2, 14, 12, 1, PAL.woodDark); r(c, 7, 1, 1, 8, PAL.woodDark); r(c, 8, 2, 5, 5, PAL.cream); },
    net: (c, g) => { TILES.sand(c, g); r(c, 2, 4, 12, 9, '#9a8a6a'); for (let x = 3; x < 14; x += 3)
        r(c, x, 4, 1, 9, '#6a5a3a'); for (let y = 6; y < 13; y += 3)
        r(c, 2, y, 12, 1, '#6a5a3a'); },
    stilt: (c, g) => { TILES.shallow(c, g); r(c, 7, 2, 2, 12, PAL.woodDark); r(c, 5, 5, 6, 2, PAL.wood); },
    bed: (c) => { TILES.wood(c, () => 0.5); r(c, 1, 2, 14, 12, '#e8e0d0'); r(c, 1, 2, 14, 4, '#c0392b'); r(c, 1, 12, 14, 2, '#a89f8f'); },
    shelf: (c) => { r(c, 0, 0, 16, 16, PAL.woodDark); r(c, 1, 1, 14, 6, PAL.wood); r(c, 1, 9, 14, 6, PAL.wood); r(c, 3, 2, 3, 4, '#d4a437'); r(c, 9, 3, 4, 3, '#e2452b'); r(c, 4, 10, 4, 4, '#4e9a3a'); r(c, 10, 11, 3, 3, '#6aa0d0'); },
    table: (c) => { TILES.wood(c, () => 0.5); r(c, 1, 3, 14, 9, PAL.woodDark); r(c, 2, 4, 12, 7, PAL.wood); r(c, 6, 5, 4, 3, '#fff3d6'); },
    counter: (c) => { TILES.wood(c, () => 0.5); r(c, 0, 4, 16, 9, PAL.woodDark); r(c, 0, 4, 16, 3, PAL.woodLight); },
    pot: (c) => { TILES.wood(c, () => 0.5); r(c, 4, 4, 8, 10, '#9a5a2a'); r(c, 3, 3, 10, 3, '#b87a3a'); r(c, 5, 8, 6, 2, '#c99a5a'); },
    // 高原・宮殿など後で使うもの
    tea: (c, g) => { r(c, 0, 0, 16, 16, '#4f9a3c'); for (let y = 2; y < 16; y += 5)
        for (let x = 0; x < 16; x += 3)
            r(c, x, y, 2, 3, g() < 0.5 ? '#3f8a2c' : '#6fb85a'); },
    jungle: (c, g) => { r(c, 0, 0, 16, 16, '#2f6f2a'); noise(c, g, ['#1f5a1c', '#478a3a', '#6cae52'], 26); r(c, 6, 2, 4, 6, '#1b4d19'); },
    marble: (c) => { r(c, 0, 0, 16, 16, '#f2f2f5'); r(c, 0, 0, 16, 1, '#d5d5de'); r(c, 0, 8, 16, 1, '#d5d5de'); r(c, 8, 0, 1, 16, '#d5d5de'); },
    castle_rock: (c, g) => { r(c, 0, 0, 16, 16, '#6a4a3a'); noise(c, g, ['#7e5a46', '#523626', '#8e6a52'], 20); },
};
export const TILE_NAMES = Object.keys(TILES);
export function drawPerson(c, look, dir, frame) {
    c.clearRect(0, 0, 16, 24);
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    // 影
    c.globalAlpha = 0.28;
    r(c, 3, 21, 10, 3, '#000');
    c.globalAlpha = 1;
    // 足
    r(c, 4, 19 + (step > 0 ? 0 : 0), 3, 3 - (step > 0 ? 1 : 0), look.bottom);
    r(c, 9, 19, 3, 3 - (step < 0 ? 1 : 0), look.bottom);
    r(c, 4, 22 - (step > 0 ? 1 : 0), 3, 1, PAL.outline);
    r(c, 9, 22 - (step < 0 ? 1 : 0), 3, 1, PAL.outline);
    // 胴
    const side = dir === 'left' || dir === 'right';
    r(c, 3, 11, 10, 8, look.top);
    r(c, 3, 17, 10, 2, look.top2);
    if (look.accessory === 'apron')
        r(c, 5, 12, 6, 8, '#fffaf0');
    if (look.accessory === 'sash') {
        r(c, 3, 14, 10, 2, look.top2);
    }
    if (look.accessory === 'cape' && dir === 'up')
        r(c, 2, 10, 12, 11, look.top2);
    // 腕
    r(c, 2, 12 + step, 2, 5, look.top);
    r(c, 12, 12 - step, 2, 5, look.top);
    r(c, 2, 17 + step, 2, 2, look.skin);
    r(c, 12, 17 - step, 2, 2, look.skin);
    // 頭
    r(c, 3, 2, 10, 9, look.skin);
    // 髪
    const hair = look.hair;
    if (look.hairStyle === 'short') {
        r(c, 3, 1, 10, 4, hair);
        if (dir === 'up')
            r(c, 3, 1, 10, 9, hair);
        else {
            r(c, 3, 4, 2, 3, hair);
            r(c, 11, 4, 2, 3, hair);
        }
    }
    if (look.hairStyle === 'long') {
        r(c, 3, 1, 10, 4, hair);
        r(c, 2, 3, 2, 12, hair);
        r(c, 12, 3, 2, 12, hair);
        if (dir === 'up')
            r(c, 3, 1, 10, 13, hair);
    }
    if (look.hairStyle === 'turban') {
        r(c, 2, 0, 12, 5, '#e8e0d0');
        r(c, 3, 4, 10, 1, '#c9a04a');
    }
    if (look.hairStyle === 'cap') {
        r(c, 2, 0, 12, 4, look.top2);
        r(c, 2, 3, 12, 1, PAL.outline);
    }
    if (look.hairStyle === 'bald') {
        r(c, 4, 1, 8, 1, look.skin);
    }
    if (look.accessory === 'crown') {
        r(c, 3, 0, 10, 2, PAL.gold);
        r(c, 4, -1 + 1, 2, 1, PAL.gold);
        r(c, 10, 0, 2, 1, PAL.gold);
    }
    if (look.accessory === 'headband')
        r(c, 3, 3, 10, 2, PAL.red);
    // 顔
    if (dir === 'down') {
        r(c, 5, 6, 2, 2, PAL.outline);
        r(c, 9, 6, 2, 2, PAL.outline);
        r(c, 7, 9, 2, 1, '#b86a50');
    }
    else if (dir === 'left') {
        r(c, 4, 6, 2, 2, PAL.outline);
        r(c, 3, 9, 2, 1, '#b86a50');
    }
    else if (dir === 'right') {
        r(c, 10, 6, 2, 2, PAL.outline);
        r(c, 11, 9, 2, 1, '#b86a50');
    }
    if (look.accessory === 'beard' && dir !== 'up') {
        r(c, 4, 9, 8, 3, '#e8e8e8');
    }
    void side;
}
export const LOOKS = {
    hero: { skin: PAL.skin, hair: '#4a2c1a', hairStyle: 'short', top: '#2f6fb0', top2: '#e2452b', bottom: '#5a3a22', accessory: 'cape' },
    mina: { skin: '#e0a878', hair: '#1a1a22', hairStyle: 'long', top: '#4e9a3a', top2: '#f2c230', bottom: '#d4a437', accessory: 'sash' },
    fisher: { skin: '#c68a5a', hair: '#2a2a2a', hairStyle: 'turban', top: '#e8e0d0', top2: '#2f8fcf', bottom: '#7a5a3a', accessory: 'beard' },
    okami: { skin: '#e0a878', hair: '#555555', hairStyle: 'long', top: '#c0532f', top2: '#f2c230', bottom: '#8a5a2b', accessory: 'apron' },
    mother: { skin: '#e0a878', hair: '#3a2418', hairStyle: 'long', top: '#d46a8a', top2: '#fff3d6', bottom: '#8a5a2b', accessory: 'apron' },
    boy: { skin: '#d49a68', hair: '#1a1a22', hairStyle: 'short', top: '#f2c230', top2: '#e2452b', bottom: '#6a4a2a' },
    girl: { skin: '#d49a68', hair: '#1a1a22', hairStyle: 'long', top: '#e86a9a', top2: '#f2c230', bottom: '#6a4a2a' },
    old: { skin: '#c68a5a', hair: '#dddddd', hairStyle: 'bald', top: '#8a6a3a', top2: '#c9a04a', bottom: '#5a3a22', accessory: 'beard' },
    guard: { skin: '#c68a5a', hair: '#222', hairStyle: 'cap', top: '#8c8c94', top2: '#b8b8c0', bottom: '#5e5e66' },
    king: { skin: '#d49a68', hair: '#e8e8e8', hairStyle: 'short', top: '#7a2a6a', top2: '#d4a437', bottom: '#4a1a4a', accessory: 'crown' },
    merchant: { skin: '#d49a68', hair: '#3a2418', hairStyle: 'turban', top: '#c9a04a', top2: '#8a5a2b', bottom: '#5a3a22' },
};
// ───────── 子ゾウ・動物 ─────────
export function drawPearl(c, dir, frame) {
    c.clearRect(0, 0, 16, 24);
    const step = frame === 1 ? 1 : 0;
    const body = '#a9a9b8';
    const dark = '#82829a';
    c.globalAlpha = 0.28;
    r(c, 1, 21, 14, 3, '#000');
    c.globalAlpha = 1;
    r(c, 2, 12, 12, 8, body);
    r(c, 3, 19, 3, 3 - step, dark);
    r(c, 10, 19, 3, 3 - (1 - step), dark);
    // 頭
    r(c, 3, 4, 10, 9, body);
    // 耳
    r(c, 0, 5, 3, 7, dark);
    r(c, 13, 5, 3, 7, dark);
    r(c, 1, 6, 1, 5, '#e8a0a0');
    r(c, 14, 6, 1, 5, '#e8a0a0');
    // かざり布
    r(c, 4, 12, 8, 3, '#e2452b');
    r(c, 4, 14, 8, 1, PAL.gold);
    if (dir !== 'up') {
        r(c, 5, 7, 2, 2, PAL.outline);
        r(c, 9, 7, 2, 2, PAL.outline);
        r(c, 6, 10, 4, 6, body);
        r(c, 7, 15, 2, 2, dark);
        r(c, 3, 11, 2, 2, '#fff3d6');
        r(c, 11, 11, 2, 2, '#fff3d6');
    }
}
// ───────── 宝箱・キラキラ ─────────
export function drawChest(c, kind, open) {
    c.clearRect(0, 0, 16, 16);
    const body = kind === 'red' ? '#b02a1c' : PAL.wood;
    const dark = kind === 'red' ? '#701810' : PAL.woodDark;
    const gold = PAL.gold;
    r(c, 1, 6, 14, 9, dark);
    r(c, 2, 7, 12, 7, body);
    if (open) {
        r(c, 1, 2, 14, 4, dark);
        r(c, 2, 3, 12, 2, '#2a1810');
        r(c, 4, 7, 8, 2, '#ffe27a');
    }
    else {
        r(c, 1, 3, 14, 5, dark);
        r(c, 2, 4, 12, 3, body);
        r(c, 7, 7, 2, 3, gold);
    }
    r(c, 1, 11, 14, 1, gold);
    if (kind === 'red') {
        r(c, 3, 3, 2, 1, '#ffd0c0');
        r(c, 6, 11, 4, 2, '#ffd23f');
    }
}
const AREA_COLORS = {
    beach: ['#e8a838', '#f2c85a', '#d9743a', '#6cc6e8'],
    jungle: ['#6a8a2a', '#8a4a9a', '#b8452a', '#c9a24a'],
    sea: ['#2a8aa8', '#3a5aa8', '#7a3a8a', '#d8d8e8'],
    highland: ['#8a6a3a', '#5a8a3a', '#a8782a', '#7a5a4a'],
    palace: ['#c8c8d8', '#d4a437', '#5a4a7a', '#2a2a3a'],
    castle: ['#3a2a4a', '#5a2a3a', '#2a1a2a', '#7a2a5a'],
    boss: ['#2a2a3a', '#7a2a2a', '#3a4a6a', '#5a3a7a'],
};
export function drawEnemy(c, e) {
    const S = e.size;
    c.clearRect(0, 0, S, S);
    const rng = mulberry32(hashStr(e.id));
    const cols = AREA_COLORS[e.boss ? 'boss' : e.area ?? 'beach'];
    const base = cols[Math.floor(rng() * cols.length)];
    const alt = cols[Math.floor(rng() * cols.length)];
    const cell = Math.max(2, Math.floor(S / 16));
    const n = Math.floor(S / cell);
    const half = Math.ceil(n / 2);
    // 体: 中央に向かって詰まる確率で埋める（左右対称）
    const grid = [];
    for (let y = 0; y < n; y++) {
        grid[y] = [];
        for (let x = 0; x < half; x++) {
            const cx = (half - 1 - x) / half; // 中心ほど小さい
            const cy = Math.abs(y - n * 0.55) / (n * 0.5);
            const p = 1.05 - Math.hypot(cx * 1.15, cy) * 0.95 + (rng() - 0.5) * 0.35;
            grid[y][x] = p > 0.35 ? (rng() < 0.2 ? 2 : 1) : 0;
        }
    }
    // 影
    c.globalAlpha = 0.3;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(S / 2, S - cell, S * 0.38, cell * 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    const dark = shade(base, -45);
    const light = shade(base, 40);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < half; x++) {
            const v = grid[y][x];
            if (!v)
                continue;
            const edge = !grid[y]?.[x - 1] || !grid[y - 1]?.[x] || !grid[y + 1]?.[x];
            const col = v === 2 ? alt : edge ? dark : y < n * 0.4 ? light : base;
            r(c, x * cell, y * cell, cell, cell, col);
            r(c, (n - 1 - x) * cell, y * cell, cell, cell, col);
        }
    }
    // 目（かげ系は光る赤い目）
    const ey = Math.floor(n * 0.4) * cell;
    const ex = Math.floor(n * 0.28) * cell;
    const glow = e.tag === 'shadow';
    r(c, ex, ey, cell * 2, cell * 2, glow ? '#ff3b2a' : '#fff');
    r(c, S - ex - cell * 2, ey, cell * 2, cell * 2, glow ? '#ff3b2a' : '#fff');
    if (!glow) {
        r(c, ex + cell, ey + cell, cell, cell, PAL.outline);
        r(c, S - ex - cell * 2, ey + cell, cell, cell, PAL.outline);
    }
    // 口
    r(c, Math.floor(S / 2) - cell * 2, ey + cell * 4, cell * 4, cell, dark);
    if (e.boss) {
        r(c, Math.floor(S / 2) - cell * 3, ey - cell * 3, cell * 6, cell, PAL.gold);
    }
}
export function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = (v) => Math.max(0, Math.min(255, v));
    const R = cl((n >> 16) + amt), G = cl(((n >> 8) & 255) + amt), B = cl((n & 255) + amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
}
const BG_SKY = {
    beach: ['#7ad0f0', '#fbe9b0'], jungle: ['#3a8a5a', '#9acd6a'], cave: ['#1a1226', '#3a2a4a'], sea: ['#58b0e0', '#c8ecff'],
    highland: ['#9ad0f0', '#e8f0c8'], palace: ['#f0d0a0', '#fff0d0'], castle: ['#2a1a2a', '#6a2a3a'], ship_storm: ['#2a3040', '#586070'],
};
const BG_FLOOR = {
    beach: ['#e8d29a', '#c4a468'], jungle: ['#4f8f3a', '#3a6a2a'], cave: ['#4a3a5a', '#2a2036'], sea: ['#2f8fcf', '#1f6fae'],
    highland: ['#6aa84f', '#4a8a3a'], palace: ['#f2f2f5', '#c8c8d4'], castle: ['#5a3a3a', '#3a2228'], ship_storm: ['#6a4a2a', '#4a3018'],
};
export function drawBattleBack(c, bg) {
    const W = 320, H = 120;
    const [top, bottom] = BG_SKY[bg];
    const g = c.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const rng = mulberry32(hashStr(bg));
    if (bg === 'beach' || bg === 'sea' || bg === 'ship_storm') {
        r(c, 0, 52, W, 20, bg === 'beach' ? '#4aa8e0' : '#2f7fb8');
        for (let i = 0; i < 24; i++)
            r(c, Math.floor(rng() * 300), 54 + Math.floor(rng() * 16), 8 + Math.floor(rng() * 10), 1, '#d8f1ff');
    }
    if (bg === 'beach')
        for (let i = 0; i < 4; i++) {
            const x = 20 + i * 90 + rng() * 20;
            r(c, x, 28, 3, 28, '#8d6e3f');
            r(c, x - 10, 24, 12, 4, '#2e7d32');
            r(c, x + 2, 24, 12, 4, '#2e7d32');
            r(c, x - 5, 20, 12, 5, '#1b5e20');
        }
    if (bg === 'jungle' || bg === 'highland')
        for (let i = 0; i < 14; i++) {
            const x = rng() * 320;
            const h = 24 + rng() * 26;
            r(c, x, 62 - h, 12, h, bg === 'jungle' ? '#245a28' : '#5a9a4a');
            r(c, x - 3, 62 - h - 6, 18, 8, bg === 'jungle' ? '#1b4d19' : '#6ab05a');
        }
    if (bg === 'cave' || bg === 'castle')
        for (let i = 0; i < 16; i++) {
            const x = rng() * 320;
            const h = 10 + rng() * 28;
            c.fillStyle = bg === 'cave' ? '#2a1c38' : '#3a1c2a';
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x + 8, 0);
            c.lineTo(x + 4, h);
            c.fill();
        }
    if (bg === 'palace') {
        for (let i = 0; i < 6; i++) {
            r(c, 20 + i * 52, 20, 10, 44, '#e8e8f0');
            r(c, 17 + i * 52, 16, 16, 6, '#d4a437');
        }
        r(c, 0, 60, W, 4, '#d4a437');
    }
    if (bg === 'castle') {
        c.fillStyle = '#ff6a3a';
        c.globalAlpha = 0.6;
        c.beginPath();
        c.arc(250, 36, 22, 0, 7);
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = '#000';
        c.beginPath();
        c.arc(256, 34, 20, 0, 7);
        c.fill();
    }
    // 床（台形: 奥がせまい）
    const [f1, f2] = BG_FLOOR[bg];
    const fg = c.createLinearGradient(0, 62, 0, H);
    fg.addColorStop(0, f1);
    fg.addColorStop(1, f2);
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(60, 62);
    c.lineTo(260, 62);
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.closePath();
    c.fill();
    c.fillStyle = f1;
    c.fillRect(0, 62, 60, 2);
    c.fillRect(260, 62, 60, 2);
    c.fillStyle = f1;
    c.beginPath();
    c.moveTo(0, 62);
    c.lineTo(60, 62);
    c.lineTo(0, H);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(260, 62);
    c.lineTo(W, 62);
    c.lineTo(W, H);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.12)';
    c.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
        const y = 62 + (H - 62) * (i / 6) ** 1.6;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
    }
}
export function battleBgForArea(area, map) {
    if (map?.startsWith('cave'))
        return 'cave';
    switch (area) {
        case 'jungle': return 'jungle';
        case 'sea': return 'sea';
        case 'highland': return 'highland';
        case 'palace': return 'palace';
        case 'castle': return 'castle';
        default: return 'beach';
    }
}
