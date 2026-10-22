import Phaser from 'phaser';
import { encounterRate } from '../../core/battle.js';
import { chestsData, encounters, equipById, itemById, must, uiTheme } from '../../core/data.js';
import { addItem, innById, joinMember, onWipeout, openChest } from '../../core/state.js';
import { G } from '../ctx.js';
import { DIR_VEC, INN_ARRIVAL, OPPOSITE, getMap, tileAt, LEGEND, } from '../maps.js';
import { equipMenu, innTalk, itemMenu, padSetup, settingsMenu, shopTalk, spellMenu, statusScreen } from '../menus.js';
const T = 16;
const STEP_MS = 150;
const BGM = { village: 'village', field: 'field', inn: 'inn', cave: 'field', castle: 'boss' };
export class FieldScene extends Phaser.Scene {
    map;
    objs = [];
    hero;
    followers = [];
    trail = [];
    npcs = [];
    chestSprites = new Map();
    busy = false;
    safeSteps = 0;
    repel = null;
    bangMark = null;
    lastSaveTick = 0;
    constructor() { super('Field'); }
    create(data) {
        const g = G();
        document.body.classList.remove('battle');
        g.overlay.clear();
        void g.overlay.fade(true, 0);
        this.cameras.main.setBackgroundColor('#000000');
        this.events.on('wake', () => document.body.classList.remove('battle'));
        this.buildMap(g.gs.mapId, g.gs.pos.x, g.gs.pos.y, g.gs.pos.dir);
        void (async () => {
            this.busy = true;
            await g.overlay.fade(false, 500);
            if (data?.intro && !g.gs.flags.f_intro) {
                g.gs.flags.f_intro = true;
                await g.overlay.message('{朝|あさ}なのに、{空|そら}が まっくらだ…\nなにか わるい ことが おきているのかも。');
            }
            this.busy = false;
        })();
    }
    // ───────── マップの組み立て ─────────
    clearMap() {
        this.objs.forEach((o) => o.destroy());
        this.objs = [];
        this.npcs = [];
        this.followers = [];
        this.chestSprites.clear();
    }
    px(n) { return n * T; }
    makeActor(key, x, y, dir) {
        const shadow = this.add.image(this.px(x) + 8, this.px(y) + 15, 'shadow').setDepth(this.px(y) + 15.5);
        const spr = this.add.image(this.px(x) + 8, this.px(y) + 17, `p_${key}_${dir}_0`).setOrigin(0.5, 1).setDepth(this.px(y) + 16.1);
        this.objs.push(shadow, spr);
        return { spr, shadow, x, y, dir, mv: null, frame: 0, key };
    }
    setFrame(a) { a.spr.setTexture(`p_${a.key}_${a.dir}_${a.frame}`); }
    place(a) {
        let px = this.px(a.x);
        let py = this.px(a.y);
        if (a.mv) {
            const t = Math.min(1, a.mv.t);
            px = Phaser.Math.Linear(this.px(a.mv.fx), this.px(a.mv.tx), t);
            py = Phaser.Math.Linear(this.px(a.mv.fy), this.px(a.mv.ty), t);
        }
        a.spr.setPosition(px + 8, py + 17);
        a.shadow.setPosition(px + 8, py + 15);
        a.spr.setDepth(py + 16.1);
        a.shadow.setDepth(py + 15.5);
    }
    buildMap(id, x, y, dir) {
        const g = G();
        this.clearMap();
        this.map = getMap(id);
        const m = this.map;
        const w = m.rows[0].length;
        const h = m.rows.length;
        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const info = LEGEND[m.rows[ty][tx]];
                this.objs.push(this.add.image(this.px(tx), this.px(ty), `t_${info.ground}`).setOrigin(0).setDepth(0));
                if (info.obj)
                    this.objs.push(this.add.image(this.px(tx), this.px(ty), `t_${info.obj}`).setOrigin(0).setDepth(this.px(ty) + 16));
                if (info.front)
                    this.objs.push(this.add.image(this.px(tx), this.px(ty) - 12, `t_${info.front}`).setOrigin(0).setDepth(5000));
            }
        }
        // 宝箱
        for (const c of m.chests) {
            const opened = !!g.gs.flags[c.id];
            const def = must(chestsData.list.find((q) => q.id === c.id), c.id);
            const spr = this.add.image(this.px(c.x), this.px(c.y), `chest_${def.color === 'red' ? 'red' : 'normal'}_${opened ? 'open' : 'closed'}`).setOrigin(0).setDepth(this.px(c.y) + 16);
            this.objs.push(spr);
            this.chestSprites.set(c.id, spr);
        }
        // NPC
        for (const n of m.npcs) {
            const a = this.makeActor(n.look, n.x, n.y, n.dir);
            a.def = n;
            a.origin = { x: n.x, y: n.y };
            a.wait = 1000 + Math.random() * 2000;
            this.npcs.push(a);
            this.place(a);
        }
        // 主人公と仲間
        this.hero = this.makeActor('hero', x, y, dir);
        this.place(this.hero);
        this.trail = [];
        for (let i = 0; i < 6; i++)
            this.trail.push({ x, y, dir });
        g.gs.party.slice(1).forEach((p) => {
            const f = this.makeActor(p.id, x, y, dir);
            this.followers.push(f);
            this.place(f);
        });
        g.gs.mapId = id;
        g.gs.pos = { x, y, dir };
        this.updateCamera(true);
        g.audio.bgm(BGM[m.bgm] ?? 'village');
        if (m.showName)
            g.overlay.flash(m.name, 2200);
    }
    updateCamera(_snap = false) {
        const w = this.map.rows[0].length * T;
        const h = this.map.rows.length * T;
        const px = this.hero.spr.x;
        const py = this.hero.spr.y - 8;
        const sx = w <= 320 ? -(320 - w) / 2 : Phaser.Math.Clamp(px - 160, 0, w - 320);
        const sy = h <= 180 ? -(180 - h) / 2 : Phaser.Math.Clamp(py - 90, 0, h - 180);
        this.cameras.main.setScroll(Math.round(sx), Math.round(sy));
    }
    // ───────── 毎フレーム ─────────
    update(_time, delta) {
        const g = G();
        // 動きの更新（会話中でも歩きかけの動きは最後まで）
        this.advance(this.hero, delta, true);
        this.followers.forEach((f) => this.advance(f, delta, false));
        this.npcs.forEach((n) => this.advance(n, delta, false));
        this.updateCamera();
        g.gs.playTimeSec += delta / 1000;
        if (this.busy || g.overlay.busy) {
            this.hideBang();
            return;
        }
        const input = g.input;
        if (input.needsSetup && !this.busy) {
            void this.runBusy(async () => { await g.overlay.message('コントローラーを みつけたよ！\nボタンを おぼえさせてね。'); await padSetup(g, input.needsSetup); if (input.needsSetup)
                input.skipSetup(input.needsSetup); });
            return;
        }
        this.updateNpcs(delta);
        this.updateBang();
        if (this.hero.mv)
            return;
        if (input.pressed('menu')) {
            void this.runBusy(() => this.fieldMenu());
            return;
        }
        if (input.pressed('confirm')) {
            void this.runBusy(() => this.interact());
            return;
        }
        const d = input.direction();
        if (d)
            this.tryStep(d);
    }
    async runBusy(fn) {
        if (this.busy)
            return;
        this.busy = true;
        try {
            await fn();
        }
        finally {
            this.busy = false;
        }
    }
    advance(a, delta, isHero) {
        if (!a.mv)
            return;
        a.mv.t += delta / STEP_MS;
        if (a.mv.t >= 1) {
            a.x = a.mv.tx;
            a.y = a.mv.ty;
            a.mv = null;
            a.frame = 0;
            this.setFrame(a);
            this.place(a);
            if (isHero)
                this.onArrive();
        }
        else {
            a.frame = a.mv.t < 0.5 ? 1 : 2;
            this.setFrame(a);
            this.place(a);
        }
    }
    // ───────── 歩く ─────────
    blocked(x, y, ignore) {
        const info = tileAt(this.map, x, y);
        if (!info || info.solid)
            return true;
        if (this.npcs.some((n) => n !== ignore && (n.x === x && n.y === y || (n.mv && n.mv.tx === x && n.mv.ty === y))))
            return true;
        if (this.map.chests.some((c) => c.x === x && c.y === y))
            return true;
        if (this.map.searches.some((s) => s.x === x && s.y === y && !this.walkableSearch(s.id)))
            return true;
        return false;
    }
    walkableSearch(_id) { return false; }
    tryStep(d) {
        const h = this.hero;
        h.dir = d;
        const [dx, dy] = DIR_VEC[d];
        const nx = h.x + dx;
        const ny = h.y + dy;
        // マップの外へ出る出入口（端のタイル）
        const exit = this.map.exits.find((e) => e.x === nx && e.y === ny);
        const outside = !tileAt(this.map, nx, ny);
        if (outside) {
            this.setFrame(h);
            return;
        }
        if (this.blocked(nx, ny) && !exit) {
            h.frame = 0;
            this.setFrame(h);
            return;
        }
        this.trail.unshift({ x: h.x, y: h.y, dir: d });
        this.trail.length = 8;
        h.mv = { fx: h.x, fy: h.y, tx: nx, ty: ny, t: 0 };
        this.followers.forEach((f, i) => {
            const tile = this.trail[i];
            if (tile && (tile.x !== f.x || tile.y !== f.y)) {
                f.dir = tile.dir;
                f.mv = { fx: f.x, fy: f.y, tx: tile.x, ty: tile.y, t: 0 };
            }
        });
    }
    onArrive() {
        const g = G();
        const h = this.hero;
        g.gs.pos = { x: h.x, y: h.y, dir: h.dir };
        const exit = this.map.exits.find((e) => e.x === h.x && e.y === h.y);
        if (exit) {
            void this.runBusy(() => this.useExit(exit));
            return;
        }
        const boss = this.map.boss;
        if (boss && boss.x === h.x && boss.y === h.y && !g.gs.flags[boss.flag]) {
            void this.runBusy(() => this.fightBoss(boss));
            return;
        }
        void this.checkEncounter();
    }
    async useExit(e) {
        const g = G();
        const why = e.blocked?.(g.gs);
        if (why) {
            await g.overlay.message(why);
            return;
        }
        g.audio.se('door');
        await g.overlay.fade(true, 250);
        this.buildMap(e.to, e.tx, e.ty, e.dir ?? 'down');
        await g.overlay.fade(false, 250);
    }
    // ───────── エンカウント ─────────
    async checkEncounter() {
        const g = G();
        const zones = this.map.encounters;
        if (!zones)
            return;
        const info = tileAt(this.map, this.hero.x, this.hero.y);
        if (!info)
            return;
        const zoneId = zones[info.terrain];
        if (!zoneId)
            return;
        if (this.safeSteps > 0) {
            this.safeSteps--;
            return;
        }
        const zone = must(encounters.zones.find((z) => z.id === zoneId), zoneId);
        const key = info.terrain === 'shallow' ? 'sea' : info.terrain;
        let rate = encounterRate(key, g.gs.party[0].lv, zone.expectedLv, encounters.overLevelMargin, encounters.overLevelRateMultiplier, encounters.terrainRate);
        if (this.repel) {
            rate *= this.repel.rate;
            if (--this.repel.left <= 0)
                this.repel = null;
        }
        if (Math.random() >= rate)
            return;
        const total = zone.groups.reduce((s, q) => s + q.w, 0);
        let r = Math.random() * total;
        let pick = zone.groups[0];
        for (const q of zone.groups) {
            r -= q.w;
            if (r < 0) {
                pick = q;
                break;
            }
        }
        await this.runBusy(async () => { await this.battle({ enemies: pick.enemies, boss: false, bg: this.map.battleBg ?? 'beach' }); });
    }
    /** 決まった場所のボス。踏んだら始まり、勝つと flag が立って二度は出ない */
    async fightBoss(b) {
        const g = G();
        g.audio.bgm(null);
        await this.say(b.before);
        const out = await this.battle({ enemies: [b.enemy], boss: true, bg: this.map.battleBg ?? 'cave' });
        if (out.result !== 'win')
            return;
        g.gs.flags[b.flag] = true;
        if (b.keyItem && !g.gs.keyItems.includes(b.keyItem))
            g.gs.keyItems.push(b.keyItem);
        if (b.setsFlag)
            g.gs.flags[b.setsFlag] = true;
        g.audio.se('unlock');
        await this.say(b.after);
    }
    /** 戦闘シーンを起動して、終わるまで待つ */
    async battle(p) {
        const g = G();
        g.audio.bgm(null);
        this.hideBang();
        this.cameras.main.flash(180, 255, 255, 255);
        g.audio.se('crit');
        await g.overlay.fade(true, 350);
        const outcome = await new Promise((resolve) => {
            this.scene.launch('Battle', { ...p, onEnd: resolve });
            this.scene.sleep();
        });
        this.scene.wake();
        g.overlay.clear();
        void g.overlay.fade(true, 0);
        if (outcome.result === 'lose')
            await this.afterWipeout(p.boss ? p.enemies[0] : undefined);
        else {
            await g.overlay.fade(false, 350);
            g.audio.bgm(BGM[this.map.bgm] ?? 'village');
        }
        this.safeSteps = encounters.safeStepsAfterBattle;
        return outcome;
    }
    async afterWipeout(bossId) {
        const g = G();
        const r = onWipeout(g.gs, bossId);
        const arr = INN_ARRIVAL[r.innId] ?? INN_ARRIVAL.inn_beach;
        this.buildMap(arr.map, arr.x, arr.y, arr.dir);
        g.audio.bgm('inn');
        await g.overlay.fade(false, 600, true);
        await g.overlay.message('…… ここは やどやの ベッドの うえ。');
        await g.overlay.message(`${innById(r.innId).keeper}：\nもう だいじょうぶ。ゆっくり やすんでね。\nつよく なって また いこう！`);
        if (r.hint)
            await g.overlay.message('りょうしの おじさん：\nてごわい あいてだな…。\nあいての よわてんを さがしてみな。\nよわてんを つくと こうかばつぐんだ！');
    }
    // ───────── はなす・しらべる ─────────
    frontTile() {
        const [dx, dy] = DIR_VEC[this.hero.dir];
        return { x: this.hero.x + dx, y: this.hero.y + dy };
    }
    npcAt(x, y) {
        return this.npcs.find((n) => (n.x === x && n.y === y) || (n.mv && n.mv.tx === x && n.mv.ty === y));
    }
    async say(s) {
        const g = G();
        const v = typeof s === 'function' ? s(g.gs) : s;
        for (const t of Array.isArray(v) ? v : [v])
            await g.overlay.message(t);
    }
    async interact() {
        const g = G();
        const { x, y } = this.frontTile();
        let npc = this.npcAt(x, y);
        // カウンター越しに話す
        if (!npc) {
            const info = tileAt(this.map, x, y);
            if (info && LEGEND[this.map.rows[y][x]]?.ground === 'counter') {
                const [dx, dy] = DIR_VEC[this.hero.dir];
                npc = this.npcAt(x + dx, y + dy);
            }
        }
        if (npc) {
            npc.dir = OPPOSITE[this.hero.dir];
            npc.frame = 0;
            this.setFrame(npc);
            g.audio.se('confirm');
            const t = npc.def.talk;
            if (typeof t === 'object' && !Array.isArray(t) && 'inn' in t)
                await innTalk(g, t.inn);
            else if (typeof t === 'object' && !Array.isArray(t) && 'shop' in t)
                await shopTalk(g, t.shop);
            else
                await this.say(t);
            if (npc.def.id === 'n_mother' && !g.gs.flags.f_departed)
                g.gs.flags.f_departed = true;
            if (npc.def.setsFlag)
                g.gs.flags[npc.def.setsFlag] = true;
            return;
        }
        const chest = this.map.chests.find((c) => c.x === x && c.y === y);
        if (chest) {
            await this.openChestAt(chest.id);
            return;
        }
        const s = this.map.searches.find((q) => q.x === x && q.y === y);
        if (s) {
            if (s.once && g.gs.flags[s.once]) {
                await g.overlay.message('もう なにも ないようだ。');
                return;
            }
            if (s.give) {
                if (s.once)
                    g.gs.flags[s.once] = true;
                addItem(g.gs, s.give.item, s.give.count ?? 1);
                g.audio.se('coconut');
                await this.say(s.text);
                await g.overlay.message(`${must(itemById.get(s.give.item), 'i').name}を てにいれた！`);
            }
            else
                await this.say(s.text);
            return;
        }
        const info = tileAt(this.map, x, y);
        if (info && LEGEND[this.map.rows[y]?.[x] ?? '']?.ground === 'water') {
            await g.overlay.message('{海|うみ}だ。きれいな あおい {色|いろ}。');
        }
    }
    async openChestAt(id) {
        const g = G();
        const was = !!g.gs.flags[id];
        const r = openChest(g.gs, id);
        if (!r.ok) {
            if (r.reason === 'opened') {
                await g.overlay.message('からっぽだ。');
                return;
            }
            g.audio.se('cancel');
            await g.overlay.message(chestsData.redChestMessageLocked);
            if (id === 'chest_r03')
                await g.overlay.message('なんで あかないんだろう…？\nどこかに カギが あるのかな。');
            return;
        }
        g.audio.se('chest');
        const def = chestsData.list.find((c) => c.id === id);
        this.chestSprites.get(id)?.setTexture(`chest_${def.color === 'red' ? 'red' : 'normal'}_open`);
        await g.overlay.message(r.text);
        void was;
        void equipById;
    }
    // ───────── メニュー ─────────
    async fieldMenu() {
        const g = G();
        const gold = g.overlay.window(uiTheme.layout.field.gold, 'gold');
        gold.textContent = `${g.gs.gold} G`;
        g.audio.se('confirm');
        let idx = 0;
        const padId = g.input.currentPadSnapshots()[0]?.id ?? null;
        for (;;) {
            gold.innerHTML = `${g.gs.gold} G<i class="corner-tr"></i><i class="corner-bl"></i>`;
            idx = await g.overlay.choose(['つよさ', 'どうぐ', 'スパイス', 'そうび', 'せってい', 'ポーズ', 'とじる'].map((label) => ({ label })), { rect: { x: 216, y: 4, w: 96, h: 110 }, start: idx, menuCancels: true, keep: false });
            if (idx < 0 || idx === 6)
                break;
            if (idx === 5) {
                gold.remove();
                g.pause();
                return;
            }
            if (idx === 0)
                await statusScreen(g);
            if (idx === 1) {
                const r = await itemMenu(g);
                if (r) {
                    if (r.repel) {
                        this.repel = { left: r.repel.steps, rate: r.repel.rate };
                    }
                    await g.overlay.message(r.text);
                    if (r.warp) {
                        gold.remove();
                        await this.warpToInn();
                        return;
                    }
                }
            }
            if (idx === 2)
                await spellMenu(g);
            if (idx === 3)
                await equipMenu(g);
            if (idx === 4) {
                await settingsMenu(g, padId);
                g.audio.applyVolume();
            }
        }
        gold.remove();
    }
    async warpToInn() {
        const g = G();
        const arr = INN_ARRIVAL[g.gs.innId] ?? INN_ARRIVAL.inn_beach;
        await g.overlay.fade(true, 400);
        this.buildMap(arr.map, arr.x, arr.y, arr.dir);
        await g.overlay.fade(false, 400);
    }
    // ───────── NPCの歩き・「！」 ─────────
    updateNpcs(delta) {
        for (const n of this.npcs) {
            if (!n.def.wander || n.mv)
                continue;
            n.wait -= delta;
            if (n.wait > 0)
                continue;
            n.wait = 1200 + Math.random() * 2500;
            const dirs = ['up', 'down', 'left', 'right'];
            const d = dirs[Math.floor(Math.random() * 4)];
            const [dx, dy] = DIR_VEC[d];
            const nx = n.x + dx;
            const ny = n.y + dy;
            n.dir = d;
            if (Math.abs(nx - n.origin.x) > 3 || Math.abs(ny - n.origin.y) > 2) {
                this.setFrame(n);
                continue;
            }
            if (this.blocked(nx, ny, n) || (this.hero.x === nx && this.hero.y === ny) || tileAt(this.map, nx, ny)?.terrain === 'shallow') {
                this.setFrame(n);
                continue;
            }
            n.mv = { fx: n.x, fy: n.y, tx: nx, ty: ny, t: 0 };
        }
    }
    /** 調べられるものの前に立つと「！」を出す（子どもが気づけるように） */
    updateBang() {
        const g = G();
        if (this.hero.mv) {
            this.hideBang();
            return;
        }
        const { x, y } = this.frontTile();
        const interesting = !!this.npcAt(x, y) || this.map.chests.some((c) => c.x === x && c.y === y && !g.gs.flags[c.id])
            || this.map.searches.some((s) => s.x === x && s.y === y && !(s.once && g.gs.flags[s.once]));
        if (!interesting) {
            this.hideBang();
            return;
        }
        if (!this.bangMark) {
            const el = document.createElement('div');
            el.className = 'mark-bang';
            el.textContent = '！';
            g.overlay.root.appendChild(el);
            this.bangMark = el;
        }
        const cam = this.cameras.main;
        const sx = this.hero.spr.x - cam.scrollX;
        const sy = this.hero.spr.y - 24 - cam.scrollY;
        this.bangMark.style.left = `calc(var(--px) * ${sx - 3}px)`;
        this.bangMark.style.top = `calc(var(--px) * ${sy - 8}px)`;
    }
    hideBang() { this.bangMark?.remove(); this.bangMark = null; }
    // ───────── 外から呼ぶ ─────────
    /** 仲間を加えて、見た目も追いかけてくる */
    addMember(id) {
        const g = G();
        joinMember(g.gs, id);
        const f = this.makeActor(id, this.hero.x, this.hero.y, this.hero.dir);
        this.followers.push(f);
    }
    shutdown() { this.hideBang(); void {}; void this.lastSaveTick; }
}
