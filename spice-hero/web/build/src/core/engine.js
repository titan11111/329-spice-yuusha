/**
 * 戦闘エンジン: コマンドを受け取り、1ターンを解決して「出来事（イベント）」の列を返す。
 * 描画側（Phaser）はイベントを順番に演出するだけ。ロジックはここに全部ある。
 */
import { applyPoisonTick, battleRewards, canAct, effAgi, healAmount, isAlive, isWiped, makeEnemyCombatant, makePartyCombatant, physicalDamage, pickEnemyAction, pickTarget, randInt, runChance, spellDamage, tickBuffs, turnOrder, wakeOnHit, } from './battle.js';
import { enemyById, equipById, itemById, must, spellById } from './data.js';
export class Battle {
    opts;
    party;
    enemies;
    result = 'ongoing';
    turn = 0;
    spawn = 0;
    constructor(members, enemyIds, opts) {
        this.opts = opts;
        this.party = members.map(makePartyCombatant);
        this.enemies = enemyIds.map((id, i) => makeEnemyCombatant(id, i));
        this.spawn = enemyIds.length;
    }
    find(id) {
        return must([...this.party, ...this.enemies].find((c) => c.id === id), id);
    }
    get rng() { return this.opts.rng; }
    aliveParty() { return this.party.filter(isAlive); }
    aliveEnemies() { return this.enemies.filter(isAlive); }
    /** 全員ぶんのコマンドを受けて1ターン進める */
    resolveTurn(commands) {
        const ev = [];
        this.turn++;
        this.party.forEach((p) => { p.guarding = false; p.covering = false; });
        this.enemies.forEach((e) => { e.guarding = false; });
        // 逃げるが選ばれたら先に判定（失敗したら敵だけ動く）
        const runCmd = commands.find((c) => c.kind === 'run');
        let enemyOnly = false;
        if (runCmd) {
            const hero = this.party[0];
            if (!this.opts.boss && this.rng() < runChance(effAgi(hero), this.enemies)) {
                ev.push({ t: 'text', text: `${hero.name}たちは にげだした！` }, { t: 'fled' }, { t: 'end', result: 'fled' });
                this.result = 'fled';
                return ev;
            }
            ev.push({ t: 'text', text: this.opts.boss ? 'にげられない！' : 'しかし まわりこまれてしまった！' });
            enemyOnly = true;
        }
        const cmdBy = new Map(commands.map((c) => [c.actor, c]));
        const order = turnOrder([...this.party, ...this.enemies], this.rng);
        for (const actor of order) {
            if (this.result !== 'ongoing')
                break;
            if (!isAlive(actor))
                continue;
            const act = canAct(actor, this.rng);
            if (!act.act) {
                ev.push({ t: 'text', text: act.reason === 'sleep' ? `${actor.name}は ねむっている…` : `${actor.name}は くしゃみで ひとやすみ！` });
                continue;
            }
            if (act.woke)
                ev.push({ t: 'text', text: `${actor.name}は めを さました！` });
            if (actor.side === 'party') {
                if (enemyOnly)
                    continue;
                const cmd = cmdBy.get(actor.id);
                if (!cmd || cmd.kind === 'run')
                    continue;
                this.partyAct(actor, cmd.kind === 'auto' ? this.autoCommand(actor) : cmd, ev);
            }
            else {
                const times = actor.enemyDef?.actionsPerTurn ?? 1;
                for (let i = 0; i < times && this.result === 'ongoing' && isAlive(actor); i++) {
                    this.enemyAct(actor, ev);
                    this.checkEnd(ev);
                }
            }
            this.checkEnd(ev);
        }
        if (this.result === 'ongoing') {
            for (const c of [...this.party, ...this.enemies]) {
                if (!isAlive(c))
                    continue;
                const lost = applyPoisonTick(c);
                if (lost > 0)
                    ev.push({ t: 'text', text: `${c.name}は どくで ${lost}の ダメージ！` }, { t: 'damage', target: c.id, amount: lost });
                tickBuffs(c);
            }
        }
        return ev;
    }
    // ───────── 味方の行動 ─────────
    firstAlive(side, target) {
        const t = target ? side.find((c) => c.id === target && isAlive(c)) : undefined;
        if (t)
            return t;
        const alive = side.filter(isAlive);
        return alive[Math.floor(this.rng() * alive.length)];
    }
    partyAct(actor, cmd, ev) {
        switch (cmd.kind) {
            case 'attack': {
                const target = this.firstAlive(this.enemies, cmd.target);
                if (!target)
                    return;
                ev.push({ t: 'text', text: `${actor.name}の こうげき！` });
                this.hitPhysical(actor, target, ev, 1);
                break;
            }
            case 'spell': {
                const sp = must(spellById.get(cmd.spell), cmd.spell);
                this.castSpell(actor, sp, cmd.target, ev);
                break;
            }
            case 'item': {
                this.useItem(actor, cmd.item, cmd.target, ev);
                break;
            }
            default:
                break;
        }
    }
    hitPhysical(att, def, ev, rate, accuracy) {
        const r = physicalDamage(att, def, this.rng, rate, accuracy);
        if (r.miss) {
            ev.push({ t: 'miss', target: def.id }, { t: 'text', text: `${def.name}は ひらりと かわした！` });
            return;
        }
        if (r.critical)
            ev.push({ t: 'text', text: 'かいしんの いちげき！' });
        this.applyDamage(def, r.damage, ev, { critical: r.critical });
        // 武器の特殊効果: こしょうのけん（攻撃で10%くしゃみ）
        if (att.side === 'party' && att.id === 'hero' && this.heroWeapon === 'pepper_sword' && isAlive(def) && this.rng() < 0.1) {
            def.status.sneeze = 1;
            ev.push({ t: 'status', target: def.id, status: 'sneeze' }, { t: 'text', text: `${def.name}は くしゃみを した！` });
        }
    }
    /** こしょうのけん判定用。シーン側で設定する */
    heroWeapon = null;
    applyDamage(target, amount, ev, extra = {}) {
        target.hp = Math.max(0, target.hp - amount);
        wakeOnHit(target);
        ev.push({ t: 'damage', target: target.id, amount, ...extra });
        if (extra.weak)
            ev.push({ t: 'text', text: 'こうかばつぐん！' });
        ev.push({ t: 'text', text: `${target.name}に ${amount}の ダメージ！` });
        if (target.hp <= 0)
            this.onDefeat(target, ev);
    }
    onDefeat(target, ev) {
        ev.push({ t: 'defeat', target: target.id });
        ev.push({ t: 'text', text: target.side === 'enemy' ? `${target.name}を たおした！` : `${target.name}は ちからつきた…` });
        const next = target.enemyDef?.nextPhase;
        if (target.side === 'enemy' && next) {
            const idx = this.spawn++;
            const e = makeEnemyCombatant(next, idx);
            this.enemies.push(e);
            ev.push({ t: 'phase', next: e.id }, { t: 'text', text: `${e.name}が あらわれた！` });
        }
    }
    checkEnd(ev) {
        if (this.result !== 'ongoing')
            return;
        if (isWiped(this.enemies)) {
            this.result = 'win';
            ev.push({ t: 'end', result: 'win' });
        }
        else if (isWiped(this.party)) {
            this.result = 'lose';
            ev.push({ t: 'end', result: 'lose' });
        }
    }
    targetsOf(actor, kind, target) {
        const own = actor.side === 'party' ? this.party : this.enemies;
        const foe = actor.side === 'party' ? this.enemies : this.party;
        switch (kind) {
            case 'enemy_one': return [this.firstAlive(foe, target)].filter(Boolean);
            case 'enemy_all': return foe.filter(isAlive);
            case 'ally_one': return [this.firstAlive(own.filter((c) => true), target)].filter(Boolean);
            case 'ally_all': return own.filter(isAlive);
            default: return [];
        }
    }
    castSpell(actor, sp, target, ev) {
        if (actor.sp < sp.sp) {
            ev.push({ t: 'text', text: `${actor.name}は SPが たりない！` });
            return;
        }
        actor.sp -= sp.sp;
        const isMove = actor.id === 'pearl';
        ev.push({ t: 'text', text: isMove ? `${actor.name}の ${sp.name}！` : `${actor.name}は ${sp.name}を となえた！` });
        if (sp.color)
            ev.push({ t: 'spellFx', color: sp.color });
        const targets = this.targetsOf(actor, sp.target, target);
        switch (sp.type) {
            case 'damage':
                for (const t of targets) {
                    if (!isAlive(t))
                        continue;
                    const r = spellDamage(sp, t, this.rng);
                    this.applyDamage(t, r.damage, ev, { weak: r.weak, spellColor: sp.color });
                }
                break;
            case 'physical':
                for (const t of targets) {
                    if (isAlive(t))
                        this.hitPhysical(actor, t, ev, sp.rate ?? 1, sp.accuracy);
                }
                break;
            case 'heal': {
                const bonus = this.opts.healBonus?.[actor.id] ?? 1;
                for (const t of targets) {
                    if (!isAlive(t))
                        continue;
                    const amt = Math.min(healAmount(sp, this.rng, bonus), t.stats.maxHp - t.hp);
                    t.hp += amt;
                    ev.push({ t: 'heal', target: t.id, hp: amt }, { t: 'text', text: `${t.name}の HPが ${amt} かいふくした！` });
                }
                break;
            }
            case 'buff':
                for (const t of targets) {
                    if (!isAlive(t))
                        continue;
                    t.buffs.push({ stat: (sp.stat ?? 'def'), rate: sp.rate ?? 1.5, turns: sp.turns ?? 5 });
                    ev.push({ t: 'buff', target: t.id, stat: sp.stat ?? 'def' }, { t: 'text', text: `${t.name}の ${statName(sp.stat)}が あがった！` });
                }
                break;
            case 'status':
                for (const t of targets) {
                    if (!isAlive(t))
                        continue;
                    if (this.rng() < (sp.rate ?? 0.5)) {
                        const st = sp.status;
                        t.status[st] = 1;
                        ev.push({ t: 'status', target: t.id, status: st }, { t: 'text', text: statusText(t.name, st) });
                    }
                    else
                        ev.push({ t: 'text', text: `しかし ${t.name}には きかなかった！` });
                }
                break;
            case 'cure':
                for (const t of targets) {
                    const st = sp.status;
                    if (t.status[st]) {
                        delete t.status[st];
                        ev.push({ t: 'cure', target: t.id, status: st }, { t: 'text', text: `${t.name}の どくが なおった！` });
                    }
                    else
                        ev.push({ t: 'text', text: 'しかし なにも おこらなかった！' });
                }
                break;
            case 'cover':
                actor.covering = true;
                ev.push({ t: 'text', text: `${actor.name}が なかまを まもる！` });
                break;
            default:
                ev.push({ t: 'text', text: 'しかし なにも おこらなかった！' });
        }
    }
    useItem(actor, itemId, target, ev) {
        const it = must(itemById.get(itemId), itemId);
        if ((this.opts.inventory[itemId] ?? 0) <= 0) {
            ev.push({ t: 'text', text: `${it.name}は もっていない！` });
            return;
        }
        this.opts.inventory[itemId]--;
        ev.push({ t: 'text', text: `${actor.name}は ${it.name}を つかった！` });
        const own = this.party;
        switch (it.type) {
            case 'heal_hp': {
                const t = this.firstAlive(own, target);
                const amt = Math.min(it.power ?? 0, t.stats.maxHp - t.hp);
                t.hp += amt;
                ev.push({ t: 'heal', target: t.id, hp: amt }, { t: 'text', text: `${t.name}の HPが ${amt} かいふくした！` });
                break;
            }
            case 'heal_sp': {
                const t = this.firstAlive(own, target);
                const amt = Math.min(it.power ?? 0, t.stats.maxSp - t.sp);
                t.sp += amt;
                ev.push({ t: 'heal', target: t.id, sp: amt }, { t: 'text', text: `${t.name}の SPが ${amt} かいふくした！` });
                break;
            }
            case 'cure': {
                const t = this.firstAlive(own, target);
                delete t.status.poison;
                ev.push({ t: 'cure', target: t.id, status: 'poison' }, { t: 'text', text: `${t.name}の どくが なおった！` });
                break;
            }
            case 'full_restore':
                for (const t of own.filter(isAlive)) {
                    t.hp = t.stats.maxHp;
                    t.sp = t.stats.maxSp;
                    ev.push({ t: 'heal', target: t.id, hp: 999, sp: 999 });
                }
                ev.push({ t: 'text', text: 'みんなの HPと SPが ぜんぶ もどった！' });
                break;
            default:
                ev.push({ t: 'text', text: 'しかし なにも おこらなかった！' });
        }
    }
    // ───────── 「まかせる」 ─────────
    autoCommand(actor) {
        const known = (this.opts.known[actor.id] ?? []).map((id) => must(spellById.get(id), id));
        const usable = known.filter((s) => s.sp <= actor.sp);
        const living = this.party.filter(isAlive);
        const ratio = (c) => c.hp / c.stats.maxHp;
        const weakest = [...living].sort((a, b) => ratio(a) - ratio(b))[0];
        // 2人以上が傷ついていたら全体回復
        const hurt = living.filter((c) => ratio(c) < 0.6);
        const healAll = usable.find((s) => s.type === 'heal' && s.target === 'ally_all');
        if (hurt.length >= 2 && healAll)
            return { actor: actor.id, kind: 'spell', spell: healAll.id };
        if (weakest && ratio(weakest) < 0.4) {
            const heal = usable.find((s) => s.type === 'heal' && s.target === 'ally_one') ?? usable.find((s) => s.type === 'heal');
            if (heal)
                return { actor: actor.id, kind: 'spell', spell: heal.id, target: weakest.id };
            // 回復呪文がない/SPがないときは道具で
            const food = ['kottu', 'hopper'].find((id) => (this.opts.inventory[id] ?? 0) > 0);
            if (food && actor.id !== 'pearl')
                return { actor: actor.id, kind: 'item', item: food, target: weakest.id };
        }
        // SPが切れそうで、キングココナッツがあれば自分に使う（回復役・勇者のみ）
        if (this.opts.boss && actor.id !== 'pearl' && actor.sp < 6 && actor.stats.maxSp >= 20 && (this.opts.inventory.king_coconut ?? 0) > 0) {
            return { actor: actor.id, kind: 'item', item: 'king_coconut', target: actor.id };
        }
        // ボス戦の最初のターンは、しゅび上げがあれば使う
        if (this.opts.boss && this.turn === 1) {
            const buff = usable.find((s) => s.type === 'buff' && s.target === 'ally_all' && s.stat === 'def');
            if (buff)
                return { actor: actor.id, kind: 'spell', spell: buff.id };
        }
        const foes = this.aliveEnemies();
        // 弱点をつける攻撃呪文があれば使う
        let best;
        for (const s of usable) {
            if (s.type !== 'damage')
                continue;
            for (const f of foes) {
                let score = ((s.power?.[0] ?? 0) + (s.power?.[1] ?? 0)) / 2 * (s.target === 'enemy_all' ? foes.length : 1);
                if (s.element && f.weak.includes(s.element))
                    score *= 2;
                if (s.element && f.resist.includes(s.element))
                    score *= 0.5;
                if (s.bonusTag && f.tag === s.bonusTag)
                    score *= s.bonusRate ?? 1;
                if (!this.opts.boss)
                    score /= Math.max(1, s.sp * 0.6); // ふつうの戦闘ではSPを使いすぎない（ボス戦は使い切る）
                if (!best || score > best.score)
                    best = { s, score, target: f.id };
            }
        }
        const physical = (effAtkOf(actor) / 2);
        if (best && best.score > physical * 0.9 && (this.opts.boss || foes.length >= 2 || best.score > physical * 1.5)) {
            return { actor: actor.id, kind: 'spell', spell: best.s.id, target: best.target };
        }
        return { actor: actor.id, kind: 'attack', target: foes[0]?.id };
    }
    // ───────── 敵の行動 ─────────
    enemyAct(e, ev) {
        if (this.aliveParty().length === 0)
            return;
        const a = pickEnemyAction(e, this.rng);
        const target = () => pickTarget(this.party, this.rng);
        const enemyMsg = (s) => ev.push({ t: 'text', text: s });
        switch (a.act) {
            case 'attack':
            case 'bite':
            case 'charge':
            case 'heavy_attack': {
                const t = target();
                enemyMsg(`${e.name}の こうげき！`);
                this.hitPhysical(e, t, ev, a.rate ?? 1);
                break;
            }
            case 'double_attack':
                for (let i = 0; i < 2; i++) {
                    const t = target();
                    if (!t || !isAlive(t))
                        break;
                    enemyMsg(`${e.name}の れんぞくこうげき！`);
                    this.hitPhysical(e, t, ev, 0.8);
                }
                break;
            case 'guard':
                e.guarding = true;
                enemyMsg(`${e.name}は みを まもっている！`);
                break;
            case 'flee':
                enemyMsg(`${e.name}は にげだした！`);
                e.hp = 0;
                ev.push({ t: 'defeat', target: e.id });
                break;
            case 'sleep_self':
                enemyMsg(`${e.name}は うとうと している…`);
                e.status.sleep = 1;
                break;
            case 'status': {
                const t = target();
                enemyMsg(`${e.name}は ${a.status === 'sneeze' ? 'こしょうを まいた！' : 'ふしぎな こうを たいた！'}`);
                if (this.rng() < (a.rate ?? 0.5)) {
                    t.status[a.status] = 1;
                    ev.push({ t: 'status', target: t.id, status: a.status ?? '' }, { t: 'text', text: statusText(t.name, a.status ?? '') });
                }
                else
                    enemyMsg(`${t.name}には きかなかった！`);
                break;
            }
            case 'attack_status': {
                const t = target();
                enemyMsg(`${e.name}の かみつき！`);
                this.hitPhysical(e, t, ev, 0.8);
                if (isAlive(t) && this.rng() < (a.rate ?? 0.4)) {
                    t.status.poison = 1;
                    ev.push({ t: 'status', target: t.id, status: 'poison' }, { t: 'text', text: `${t.name}は どくに おかされた！` });
                }
                break;
            }
            case 'spell': {
                const sp = must(spellById.get(a.spell ?? ''), a.spell ?? '');
                const t = target();
                enemyMsg(`${e.name}は ${sp.name}を となえた！`);
                if (sp.color)
                    ev.push({ t: 'spellFx', color: sp.color });
                const r = spellDamage(sp, t, this.rng);
                this.applyDamage(t, Math.max(1, Math.floor(r.damage * 0.8)), ev, { spellColor: sp.color });
                break;
            }
            case 'debuff':
            case 'ink':
            case 'roar': {
                enemyMsg(a.act === 'roar' ? `${e.name}の おたけび！` : `${e.name}は すみを はいた！`);
                for (const t of this.aliveParty()) {
                    t.buffs.push({ stat: 'accuracy', rate: a.act === 'roar' ? 1 : 0.7, turns: 3 });
                }
                ev.push({ t: 'text', text: 'みんなの めいちゅうが さがった！' });
                break;
            }
            case 'tentacle_all':
            case 'quake_all':
            case 'eclipse_fire_all':
            case 'dark_wave_all': {
                const names = { tentacle_all: 'しょくしゅが あばれまわる！', quake_all: 'じめんが ゆれる！', eclipse_fire_all: 'くろい ほのおが ふきあれる！', dark_wave_all: 'やみの はどうが おそう！' };
                enemyMsg(`${e.name}の ${names[a.act]}`);
                ev.push({ t: 'spellFx', color: a.act === 'eclipse_fire_all' ? '#7A1F2B' : '#44324F' });
                const [min, max] = a.power ?? [8, 12];
                for (const t of this.aliveParty()) {
                    const dmg = Math.max(1, Math.floor(randInt(this.rng, min, max) * (t.guarding ? 0.5 : 1)));
                    this.applyDamage(t, dmg, ev);
                }
                break;
            }
            case 'dispel_buffs':
                enemyMsg(`${e.name}は ひかりを うちけした！`);
                this.aliveParty().forEach((t) => { t.buffs = []; });
                ev.push({ t: 'text', text: 'みんなの ちからが もとに もどった！' });
                break;
            default:
                enemyMsg(`${e.name}は ようすを みている…`);
        }
    }
    // ───────── 結果 ─────────
    rewards() {
        // 通常敵: 倒した全員ぶん。2形態ボスは最終形のexp/goldを使う（0なので前形態の報酬を合算）
        const all = this.enemies;
        return battleRewards(all);
    }
}
const effAtkOf = (c) => c.stats.atk;
function statName(stat) {
    return stat === 'def' ? 'しゅびりょく' : stat === 'agi' ? 'すばやさ' : stat === 'str' ? 'こうげきりょく' : 'ちから';
}
function statusText(name, st) {
    switch (st) {
        case 'sleep': return `${name}は ねむってしまった！`;
        case 'sneeze': return `${name}は くしゃみが とまらない！`;
        case 'flinch': return `${name}は ひるんで うごけない！`;
        case 'poison': return `${name}は どくに おかされた！`;
        default: return `${name}に じょうたいいじょう！`;
    }
}
export { enemyById, equipById };
