import Phaser from 'phaser';
import { Battle } from "../../core/engine.js";
import { isAlive, statsWithEquip } from "../../core/battle.js";
import { enemyById, itemById, memberById, must, spellById, uiTheme } from "../../core/data.js";
import { gainExp, knownSpells } from "../../core/state.js";
import { rubyToHtml } from "../../core/ruby.js";
import { mulberry32 } from "../art.js";
import { G } from "../ctx.js";
const L = uiTheme.layout.battle;
export class BattleScene extends Phaser.Scene {
    battle;
    params;
    sprites = new Map();
    home = new Map();
    status;
    disp = new Map();
    msgEl = null;
    constructor() { super('Battle'); }
    create(p) {
        const g = G();
        this.params = p;
        this.sprites.clear();
        this.home.clear();
        document.body.classList.add('battle');
        g.overlay.clear();
        this.cameras.main.setBackgroundColor('#1a0f08');
        this.add.image(0, 0, `bb_${p.bg}`).setOrigin(0).setDepth(0);
        this.add.rectangle(0, 120, 320, 60, 0x1a0f08).setOrigin(0).setDepth(0);
        const known = {};
        for (const m of g.gs.party)
            known[m.id] = knownSpells(g.gs, m.id);
        this.battle = new Battle(g.gs.party, p.enemies, {
            rng: mulberry32((Date.now() ^ 0x9e3779b9) >>> 0), known, inventory: { ...g.gs.items }, boss: p.boss,
        });
        this.battle.heroWeapon = g.gs.party[0].equip.weapon;
        this.layoutEnemies();
        L.partySlots.forEach((slot) => {
            const c = this.battle.party.find((q) => q.id === slot.id);
            if (!c)
                return;
            const spr = this.add.image(slot.x, slot.y + 24, `p_${slot.id}_left_0`).setOrigin(0.5, 1).setDepth(slot.y + 24);
            this.sprites.set(c.id, spr);
            this.home.set(c.id, { x: slot.x, y: slot.y + 24 });
            this.add.image(slot.x, slot.y + 22, 'shadow').setDepth(slot.y + 20);
        });
        for (const c of this.battle.party)
            this.disp.set(c.id, { hp: c.hp, sp: c.sp });
        this.status = g.overlay.window(L.status, 'status');
        this.refreshStatus();
        void g.overlay.fade(false, 300);
        g.audio.bgm(p.boss ? 'boss' : 'battle');
        void this.run();
    }
    layoutEnemies() {
        const z = L.enemyZone;
        const alive = this.battle.enemies.filter((e) => !this.sprites.has(e.id));
        const n = this.battle.enemies.length;
        this.battle.enemies.forEach((e, i) => {
            if (this.sprites.has(e.id))
                return;
            const size = e.enemyDef?.size ?? 32;
            const cx = n === 1 ? z.x + z.w / 2 : z.x + ((i + 0.5) * z.w) / n;
            const cy = z.y + z.h - (n > 1 && i % 2 ? 6 : 0);
            const spr = this.add.image(cx, cy, `e_${e.enemyDef.id}`).setOrigin(0.5, 1).setDepth(cy);
            this.sprites.set(e.id, spr);
            this.home.set(e.id, { x: cx, y: cy });
            this.add.image(cx, cy - 1, 'shadow').setScale(size / 18, 1).setDepth(cy - 1).setAlpha(0.6);
            this.tweens.add({ targets: spr, y: cy - 2, duration: 500 + i * 90, yoyo: true, repeat: -1, ease: 'Stepped' });
        });
        void alive;
    }
    // ───────── 表示 ─────────
    refreshStatus() {
        const rows = this.battle.party.map((c) => {
            const d = this.disp.get(c.id);
            const r = d.hp / c.stats.maxHp;
            const cls = r <= L.hpThresholds.low ? 'low' : r <= L.hpThresholds.mid ? 'mid' : '';
            return `<div class="stat-row ${cls}"><span class="nm">${rubyToHtml(c.name)}</span><span class="bar ${cls}"><i style="width:${Math.max(0, Math.round(r * 100))}%"></i></span><span class="num">${d.hp}</span></div>`;
        });
        this.status.innerHTML = rows.join('') + '<i class="corner-tr"></i><i class="corner-bl"></i>';
    }
    pop(id, text, cls = '') {
        const h = this.home.get(id);
        if (!h)
            return;
        const el = document.createElement('div');
        el.className = `dmg ${cls}`;
        el.textContent = text;
        el.style.left = `calc(var(--px) * ${h.x}px)`;
        el.style.top = `calc(var(--px) * ${h.y - (this.sprites.get(id)?.height ?? 24) - 4}px)`;
        G().overlay.root.appendChild(el);
        setTimeout(() => el.remove(), 900);
    }
    say(text) {
        const g = G();
        if (!this.msgEl || !this.msgEl.isConnected)
            this.msgEl = g.overlay.window(L.message, 'msg');
        this.msgEl.innerHTML = `<div class="msg-text text-line">${rubyToHtml(text)}</div><i class="corner-tr"></i><i class="corner-bl"></i>`;
        const dur = g.gs.settings.textSpeed === 'fast' ? 500 : 900 + text.length * 25;
        return g.overlay.modal((resolve) => {
            let t = 0;
            return (_now, dt) => { t += dt; if (t > dur || g.input.pressed('confirm'))
                resolve(); };
        });
    }
    clearMsg() { this.msgEl?.remove(); this.msgEl = null; }
    nameOf(id) { return this.battle.find(id).name; }
    // ───────── 戦闘の流れ ─────────
    async run() {
        const g = G();
        const first = this.battle.enemies.map((e) => e.name);
        const uniq = [...new Set(first)];
        await this.say(this.params.boss ? `${uniq[0]}が たちはだかった！` : `${uniq.join('と ')}${first.length > 1 && uniq.length === 1 ? 'の むれ' : ''}が あらわれた！`);
        while (this.battle.result === 'ongoing') {
            const cmds = await this.collectCommands();
            if (!cmds)
                continue;
            this.clearMsg();
            const events = this.battle.resolveTurn(cmds);
            for (const e of events)
                await this.play(e);
            for (const c of this.battle.party) {
                const d = this.disp.get(c.id);
                d.sp = c.sp;
                d.hp = c.hp;
            }
            this.refreshStatus();
        }
        await this.finish();
        void g;
    }
    async collectCommands() {
        const g = G();
        const cmds = [];
        const members = this.battle.party.filter(isAlive);
        let i = 0;
        while (i < members.length) {
            const c = members[i];
            this.clearMsg();
            const def = must(memberById.get(c.id), c.id);
            const items = [{ label: 'たたかう' }, { label: def.commandName ?? 'スパイス' }, { label: 'どうぐ' }, { label: 'まかせる' }, { label: 'にげる' }];
            const sel = await g.overlay.choose(items, { rect: L.command, cols: 2, cancel: true, keep: false });
            if (sel < 0) {
                if (i > 0) {
                    i--;
                    cmds.pop();
                }
                continue;
            }
            if (sel === 0) {
                const t = await this.pickEnemy();
                if (t === null)
                    continue;
                cmds.push({ actor: c.id, kind: 'attack', target: t });
            }
            else if (sel === 1) {
                const r = await this.pickSpell(c);
                if (!r)
                    continue;
                cmds.push({ actor: c.id, kind: 'spell', spell: r.spell, target: r.target });
            }
            else if (sel === 2) {
                const r = await this.pickItem();
                if (!r)
                    continue;
                cmds.push({ actor: c.id, kind: 'item', item: r.item, target: r.target });
            }
            else if (sel === 3) {
                for (let k = i; k < members.length; k++)
                    cmds.push({ actor: members[k].id, kind: 'auto' });
                return cmds;
            }
            else {
                // にげる: 勇者が選んだらパーティ全体で逃げる
                return members.map((m) => ({ actor: m.id, kind: 'run' }));
            }
            i++;
        }
        return cmds;
    }
    async pickEnemy() {
        const g = G();
        const alive = this.battle.enemies.filter(isAlive);
        if (alive.length === 1)
            return alive[0].id;
        const sel = await g.overlay.choose(alive.map((e, k) => ({ label: `${e.name}${alive.filter((q) => q.name === e.name).length > 1 ? ` ${String.fromCharCode(65 + alive.filter((q) => q.name === e.name).indexOf(e))}` : ''}`, right: '' })), {
            rect: L.list, cancel: true, keep: false,
            onMove: (k) => alive.forEach((e, j) => this.sprites.get(e.id)?.setAlpha(j === k ? 1 : 0.55)),
        });
        alive.forEach((e) => this.sprites.get(e.id)?.setAlpha(1));
        return sel < 0 ? null : alive[sel].id;
    }
    async pickAlly() {
        const g = G();
        const ps = this.battle.party.filter(isAlive);
        const sel = await g.overlay.choose(ps.map((p) => ({ label: p.name, right: `${p.hp}/${p.stats.maxHp}` })), { rect: L.list, cancel: true, keep: false });
        return sel < 0 ? null : ps[sel].id;
    }
    async pickSpell(c) {
        const g = G();
        const list = (this.battle.opts.known[c.id] ?? []).map((id) => must(spellById.get(id), id)).filter((s) => s.battle !== false);
        if (!list.length) {
            await this.say(`${c.name}は まだ つかえる スパイスが ない。`);
            return null;
        }
        const info = document.createElement('div');
        const sel = await g.overlay.choose(list.map((s) => ({ label: s.name, right: `SP${s.sp}`, disabled: c.sp < s.sp })), { rect: L.list, cancel: true, keep: false });
        void info;
        if (sel < 0)
            return null;
        const sp = list[sel];
        if (sp.target === 'enemy_one') {
            const t = await this.pickEnemy();
            return t ? { spell: sp.id, target: t } : null;
        }
        if (sp.target === 'ally_one') {
            const t = await this.pickAlly();
            return t ? { spell: sp.id, target: t } : null;
        }
        return { spell: sp.id };
    }
    async pickItem() {
        const g = G();
        const inv = this.battle.opts.inventory;
        const ids = Object.keys(inv).filter((id) => (inv[id] ?? 0) > 0 && itemById.get(id)?.battle);
        if (!ids.length) {
            await this.say('つかえる どうぐが ない。');
            return null;
        }
        const sel = await g.overlay.choose(ids.map((id) => ({ label: must(itemById.get(id), id).name, right: `×${inv[id]}` })), { rect: L.list, cancel: true, keep: false });
        if (sel < 0)
            return null;
        const it = must(itemById.get(ids[sel]), ids[sel]);
        if (it.type === 'full_restore')
            return { item: it.id };
        const t = await this.pickAlly();
        return t ? { item: it.id, target: t } : null;
    }
    // ───────── 演出 ─────────
    async play(e) {
        const g = G();
        switch (e.t) {
            case 'text':
                await this.say(e.text);
                break;
            case 'damage': {
                const spr = this.sprites.get(e.target);
                const isEnemy = this.battle.find(e.target).side === 'enemy';
                g.audio.se(e.critical ? 'crit' : isEnemy ? 'hit' : 'enemy_hit');
                this.pop(e.target, String(e.amount), e.weak ? 'weak' : isEnemy ? '' : 'hurt');
                if (spr) {
                    this.tweens.add({ targets: spr, x: spr.x + 3, duration: 40, yoyo: true, repeat: 3 });
                    spr.setTintFill(0xffffff);
                    this.time.delayedCall(90, () => spr.clearTint());
                }
                if (!isEnemy) {
                    this.cameras.main.shake(120, 0.004);
                    const d = this.disp.get(e.target);
                    if (d) {
                        d.hp = Math.max(0, d.hp - e.amount);
                        this.refreshStatus();
                    }
                }
                await g.overlay.wait(180);
                break;
            }
            case 'miss':
                g.audio.se('miss');
                this.pop(e.target, 'ミス');
                await g.overlay.wait(150);
                break;
            case 'heal': {
                g.audio.se('heal');
                const c = this.battle.find(e.target);
                const d = this.disp.get(e.target);
                if (e.hp) {
                    this.pop(e.target, String(Math.min(e.hp, 999)), 'heal');
                    if (d)
                        d.hp = Math.min(c.stats.maxHp, d.hp + e.hp);
                }
                if (d && e.sp)
                    d.sp = Math.min(c.stats.maxSp, d.sp + e.sp);
                this.refreshStatus();
                await g.overlay.wait(180);
                break;
            }
            case 'defeat': {
                const spr = this.sprites.get(e.target);
                const isEnemy = this.battle.find(e.target).side === 'enemy';
                g.audio.se(isEnemy ? 'defeat' : 'enemy_hit');
                if (spr) {
                    if (isEnemy)
                        this.tweens.add({ targets: spr, alpha: 0, duration: 400 });
                    else {
                        spr.setTint(0x666666);
                        spr.setAngle(-90);
                    }
                }
                if (!isEnemy) {
                    const d = this.disp.get(e.target);
                    if (d)
                        d.hp = 0;
                    this.refreshStatus();
                }
                await g.overlay.wait(300);
                break;
            }
            case 'spellFx': {
                g.audio.se('spell');
                const col = Phaser.Display.Color.HexStringToColor(e.color);
                this.cameras.main.flash(220, col.red, col.green, col.blue);
                await g.overlay.wait(200);
                break;
            }
            case 'buff':
                g.audio.se('buff');
                this.pop(e.target, '↑', 'heal');
                break;
            case 'cure':
                g.audio.se('heal');
                this.pop(e.target, '✓', 'heal');
                break;
            case 'status':
                this.pop(e.target, '!', 'weak');
                break;
            case 'phase': {
                g.audio.se('crit');
                this.cameras.main.flash(300, 255, 255, 255);
                this.layoutEnemies();
                await g.overlay.wait(300);
                break;
            }
            case 'fled':
                g.audio.se('run');
                this.sprites.forEach((s, id) => { if (this.battle.find(id).side === 'party')
                    s.setAlpha(0.3); });
                await g.overlay.wait(300);
                break;
            case 'end': break;
        }
    }
    // ───────── 決着 ─────────
    syncBack() {
        const g = G();
        g.gs.items = { ...this.battle.opts.inventory };
        for (const m of g.gs.party) {
            const c = this.battle.party.find((q) => q.id === m.id);
            if (!c)
                continue;
            m.hp = c.hp;
            m.sp = c.sp;
        }
    }
    async finish() {
        const g = G();
        const result = this.battle.result;
        this.syncBack();
        if (result === 'win') {
            g.audio.bgm(null);
            g.audio.se('victory');
            for (const m of g.gs.party) {
                m.hp = Math.max(1, m.hp);
            }
            const r = this.battle.rewards();
            g.gs.gold += r.gold;
            await this.say(`${r.exp}の けいけんちと ${r.gold}ゴールドを てにいれた！`);
            const ups = gainExp(g.gs, r.exp);
            for (const u of ups) {
                g.audio.se('levelup');
                await this.say(`${u.name}は レベル${u.to}に あがった！\nHP+${u.gains.hp} SP+${u.gains.sp} ちから+${u.gains.atk}`);
                for (const s of u.learned)
                    await this.say(`${u.name}は ${must(spellById.get(s), s).name}を おぼえた！`);
            }
            void enemyById;
            void statsWithEquip;
        }
        else if (result === 'lose') {
            g.audio.bgm(null);
            g.audio.se('defeat');
            await this.say('めのまえが まっくらに なった…');
        }
        else {
            for (const m of g.gs.party) {
                m.hp = Math.max(1, m.hp);
            }
        }
        this.clearMsg();
        await g.overlay.fade(true, 300);
        document.body.classList.remove('battle');
        g.overlay.clear();
        this.params.onEnd({ result });
        this.scene.stop();
    }
}
