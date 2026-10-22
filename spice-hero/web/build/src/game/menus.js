/**
 * メニュー類（フィールド共通）: ステータス・どうぐ・スパイス・そうび・せってい・ボタン設定・名前入力・宿屋。
 * 画面は HTML オーバーレイ。ロジックは core/state.ts を呼ぶだけ。
 */
import { LEARN_ORDER, LEARN_TIMEOUT_MS, applyLearn, detectLearn, emptyBinding } from '../core/input.js';
import { statsWithEquip } from '../core/battle.js';
import { equipById, items, itemById, must, spellById, uiTheme } from '../core/data.js';
import { buy, clampVitals, equip, equipDiff, fullHeal, innById, knownSpells, priceOf, shopStock, stayAtInn } from '../core/state.js';
import { saveGame } from '../core/save.js';
import { rubyToHtml } from '../core/ruby.js';
const R = (x, y, w, h) => ({ x, y, w, h });
export const SLOT_NAME = { weapon: 'ぶき', armor: 'よろい', shield: 'たて' };
function memberLine(gs, i) {
    const m = gs.party[i];
    const s = statsWithEquip(m);
    return `${m.name}  Lv${m.lv}  HP ${m.hp}/${s.maxHp}  SP ${m.sp}/${s.maxSp}`;
}
/** 仲間を選ぶ（HP/SP つき）。キャンセルで -1 */
export function pickMember(g, rect = R(8, 8, 200, 56), start = 0) {
    return g.overlay.choose(g.gs.party.map((_, i) => ({ label: memberLine(g.gs, i) })), { rect, start });
}
// ───────── ステータス ─────────
export async function statusScreen(g) {
    const { overlay, input, gs } = g;
    const win = overlay.window(R(8, 8, 304, 164), 'status');
    let idx = 0;
    const paint = () => {
        const m = gs.party[idx];
        const s = statsWithEquip(m);
        const eq = (slot) => (m.equip[slot] ? must(equipById.get(m.equip[slot]), 'e').name : 'なし');
        const spells = knownSpells(gs, m.id).map((id) => must(spellById.get(id), id).name).join(' ') || 'なし';
        const keyNames = gs.keyItems.map((id) => items.keyItems.find((k) => k.id === id)?.name ?? id);
        const lines = [
            `◀ ${m.name}  Lv${m.lv} ▶    ${idx + 1}/${gs.party.length}`,
            `HP ${m.hp}/${s.maxHp}   SP ${m.sp}/${s.maxSp}   けいけんち ${m.exp}`,
            `こうげき ${s.atk}   しゅび ${s.def}   すばやさ ${s.agi}`,
            `ぶき：${eq('weapon')}`,
            `よろい：${eq('armor')}`,
            `たて：${eq('shield')}`,
            `スパイス：${spells}`,
            `おかね：${gs.gold}G`,
            ...(keyNames.length ? [`だいじな もの：${keyNames.join(' ')}`] : []),
        ];
        // 改行は <br> だけで作る（テンプレートの改行は pre-wrap で空行になる）
        win.innerHTML = `<div class="text-line status-body">${lines.join('<br>')}</div><i class="corner-tr"></i><i class="corner-bl"></i>`;
    };
    paint();
    await overlay.modal((resolve) => () => {
        if (input.pressed('left')) {
            idx = (idx + gs.party.length - 1) % gs.party.length;
            paint();
            g.audio.se('cursor');
        }
        if (input.pressed('right')) {
            idx = (idx + 1) % gs.party.length;
            paint();
            g.audio.se('cursor');
        }
        if (input.pressed('cancel') || input.pressed('confirm') || input.pressed('menu')) {
            win.remove();
            resolve();
        }
    });
}
// ───────── どうぐ ─────────
const FIELD_ITEM_TYPES = new Set(['heal_hp', 'heal_sp', 'cure', 'full_restore', 'repel', 'warp_inn']);
export async function itemMenu(g) {
    const { overlay, gs } = g;
    const msg = overlay.window(overlay.messageRect, 'msg');
    for (;;) {
        const ids = Object.keys(gs.items).filter((id) => (gs.items[id] ?? 0) > 0);
        if (!ids.length) {
            msg.remove();
            await overlay.message('どうぐを もっていない。');
            return null;
        }
        const idx = await overlay.choose(ids.map((id) => ({ label: must(itemById.get(id), id).name, right: `×${gs.items[id]}`, disabled: !FIELD_ITEM_TYPES.has(must(itemById.get(id), id).type) })), { rect: R(8, 8, 200, 100), onMove: (i) => { msg.innerHTML = `<div class="msg-text text-line">${rubyToHtml(must(itemById.get(ids[i]), 'i').desc ?? '')}</div>`; }, keep: false });
        if (idx < 0) {
            msg.remove();
            return null;
        }
        const it = must(itemById.get(ids[idx]), ids[idx]);
        let result = null;
        switch (it.type) {
            case 'heal_hp':
            case 'heal_sp':
            case 'cure': {
                const t = await pickMember(g, R(8, 8, 200, 56));
                if (t < 0)
                    continue;
                const m = gs.party[t];
                const s = statsWithEquip(m);
                if (it.type === 'heal_hp') {
                    if (m.hp >= s.maxHp) {
                        result = { text: `${m.name}の HPは まんたんだ。` };
                        break;
                    }
                    const a = Math.min(it.power ?? 0, s.maxHp - m.hp);
                    m.hp += a;
                    result = { text: `${m.name}の HPが ${a} かいふくした！` };
                }
                else if (it.type === 'heal_sp') {
                    if (m.sp >= s.maxSp) {
                        result = { text: `${m.name}の SPは まんたんだ。` };
                        break;
                    }
                    const a = Math.min(it.power ?? 0, s.maxSp - m.sp);
                    m.sp += a;
                    result = { text: `${m.name}の SPが ${a} かいふくした！` };
                }
                else
                    result = { text: `${m.name}は どくに かかっていない。` };
                if (!result.text.includes('まんたん') && !result.text.includes('かかっていない'))
                    gs.items[it.id]--;
                break;
            }
            case 'full_restore':
                fullHeal(gs);
                gs.items[it.id]--;
                result = { text: 'みんなの HPと SPが ぜんぶ もどった！' };
                break;
            case 'repel':
                gs.items[it.id]--;
                result = { text: 'シナモンの においが ただよう。\nしばらく てきが でにくくなる。', repel: { steps: it.steps ?? 120, rate: it.rate ?? 0.25 } };
                break;
            case 'warp_inn':
                gs.items[it.id]--;
                result = { text: 'たこが ふわりと {空|そら}へ… やどやへ もどった！', warp: true };
                break;
        }
        if (result) {
            g.audio.se(result.warp ? 'run' : 'heal');
            msg.remove();
            return result;
        }
    }
}
// ───────── スパイス（フィールドで使える呪文） ─────────
export async function spellMenu(g) {
    const { overlay, gs } = g;
    const mi = await pickMember(g);
    if (mi < 0)
        return null;
    const who = gs.party[mi];
    const list = knownSpells(gs, who.id).map((id) => must(spellById.get(id), id)).filter((s) => s.field);
    if (!list.length) {
        await overlay.message(`${who.name}は つかえる スパイスが ない。`);
        return null;
    }
    const msg = overlay.window(overlay.messageRect, 'msg');
    const idx = await overlay.choose(list.map((s) => ({ label: s.name, right: `SP${s.sp}`, disabled: who.sp < s.sp || s.type === 'escape_dungeon' })), { rect: R(8, 8, 200, 100), onMove: (i) => { msg.innerHTML = `<div class="msg-text text-line">${rubyToHtml(list[i].desc ?? '')}</div>`; } });
    msg.remove();
    if (idx < 0)
        return null;
    const sp = list[idx];
    const t = await pickMember(g, R(8, 8, 200, 56));
    if (t < 0)
        return null;
    const target = gs.party[t];
    const ts = statsWithEquip(target);
    who.sp -= sp.sp;
    g.audio.se('heal');
    if (sp.type === 'heal') {
        const targets = sp.target === 'ally_all' ? gs.party : [target];
        let total = 0;
        for (const m of targets) {
            const s = statsWithEquip(m);
            const a = Math.min(Math.round(((sp.power?.[0] ?? 0) + (sp.power?.[1] ?? 0)) / 2), s.maxHp - m.hp);
            m.hp += a;
            total += a;
        }
        await overlay.message(`${who.name}は ${sp.name}を となえた！\n${total} かいふくした！`);
    }
    else
        await overlay.message(`${who.name}は ${sp.name}を となえた！`);
    void ts;
    return sp.id;
}
// ───────── そうび ─────────
export async function equipMenu(g) {
    const { overlay, gs } = g;
    for (;;) {
        const mi = await pickMember(g);
        if (mi < 0)
            return;
        for (;;) {
            const m = gs.party[mi];
            const slots = ['weapon', 'armor', 'shield'];
            const si = await overlay.choose(slots.map((s) => ({ label: SLOT_NAME[s], right: m.equip[s] ? must(equipById.get(m.equip[s]), 'e').name : 'なし' })), { rect: R(8, 8, 304, 48) });
            if (si < 0)
                break;
            const slot = slots[si];
            const cands = Object.entries(gs.gear).filter(([id, n]) => n > 0 && equipById.get(id)?.slot === slot && equipById.get(id)?.who.includes(m.id)).map(([id]) => id);
            if (!cands.length) {
                await overlay.message(`${m.name}が そうびできる ${SLOT_NAME[slot]}は もっていない。`);
                continue;
            }
            const msg = overlay.window(overlay.messageRect, 'msg');
            const ci = await overlay.choose(cands.map((id) => ({ label: must(equipById.get(id), id).name, right: `×${gs.gear[id]}` })), {
                rect: R(8, 8, 180, 100),
                onMove: (i) => {
                    const d = equipDiff(m, cands[i]);
                    const nm = d ? (d.stat === 'atk' ? 'こうげき' : 'しゅび') : '';
                    const arrow = d ? (d.to > d.from ? '<span class="up">↑</span>' : d.to < d.from ? '<span class="down">↓</span>' : '') : '';
                    msg.innerHTML = `<div class="msg-text text-line">${d ? `${nm} ${d.from}→${d.to} ${arrow}` : 'そうびできない'}\n${must(equipById.get(cands[i]), 'e').note ?? ''}</div>`;
                },
            });
            msg.remove();
            if (ci < 0)
                continue;
            if (equip(gs, m.id, cands[ci]).ok) {
                g.audio.se('confirm');
                clampVitals(m);
            }
        }
    }
}
// ───────── せってい ─────────
export async function settingsMenu(g, padId) {
    const { overlay, gs, input, audio } = g;
    let idx = 0;
    for (;;) {
        const s = gs.settings;
        const items = [
            { label: 'おとを けす', right: g.isMuted() ? 'けしてる' : 'ならす' },
            { label: 'もじの はやさ', right: s.textSpeed === 'normal' ? 'ふつう' : 'はやい' },
            { label: 'ふりがな', right: s.ruby ? 'あり' : 'なし' },
            { label: 'BGM', right: `${Math.round(s.bgm * 10)}` },
            { label: 'こうかおん', right: `${Math.round(s.se * 10)}` },
            { label: 'しんどう（パッド）', right: s.vibration ? 'あり' : 'なし' },
            { label: 'ボタンせってい', right: padId ? '' : '（パッドなし）', disabled: !padId },
        ];
        idx = await overlay.choose(items, {
            rect: R(8, 8, 304, 110), start: idx,
        });
        if (idx < 0)
            return;
        if (idx === 0)
            g.toggleMute();
        else if (idx === 1)
            s.textSpeed = s.textSpeed === 'normal' ? 'fast' : 'normal';
        else if (idx === 2) {
            s.ruby = !s.ruby;
            overlay.applySettings();
        }
        else if (idx === 3) {
            s.bgm = ((Math.round(s.bgm * 10) + 1) % 11) / 10;
            audio.applyVolume();
        }
        else if (idx === 4) {
            s.se = ((Math.round(s.se * 10) + 1) % 11) / 10;
            audio.applyVolume();
            audio.se('confirm');
        }
        else if (idx === 5)
            s.vibration = !s.vibration;
        else if (idx === 6 && padId)
            await padSetup(g, padId);
        void input;
    }
}
// ───────── ボタン設定（Joy-Con1本でもテストできるように） ─────────
const ACTION_LABEL = { up: '↑ うえ', down: '↓ した', left: '← ひだり', right: '→ みぎ', confirm: '● けってい', cancel: '× キャンセル', menu: '≡ メニュー' };
export async function padSetup(g, padId) {
    const { overlay, input } = g;
    const win = overlay.window(R(8, 8, 304, 164), 'pad-learn');
    const binding = emptyBinding();
    const order = LEARN_ORDER;
    let i = 0;
    let prev = null;
    let waited = 0;
    let lockMs = 400; // 直前の押しっぱなしを拾わない
    const paint = () => {
        const rows = order.map((a, k) => `<div class="row ${k === i ? 'now' : k < i ? 'done' : ''}"><span>${ACTION_LABEL[a] ?? a}</span><span>${k < i ? 'OK' : k === i ? `おしてね（${Math.max(0, Math.ceil((LEARN_TIMEOUT_MS - waited) / 1000))}）` : ''}</span></div>`).join('');
        win.innerHTML = `<div style="margin-bottom:calc(var(--px)*4px)">ボタンを おしてね（Joy-Con 1ほんでも OK）</div>${rows}<i class="corner-tr"></i><i class="corner-bl"></i>`;
    };
    paint();
    const ok = await overlay.modal((resolve) => (_now, dt) => {
        const snap = input.currentPadSnapshots().find((p) => p.id === padId) ?? null;
        if (!snap) {
            return;
        }
        lockMs -= dt;
        waited += dt;
        if (lockMs <= 0) {
            const found = detectLearn(prev, snap);
            if (found) {
                applyLearn(binding, order[i], found);
                i++;
                waited = 0;
                lockMs = 350;
                g.audio.se('confirm');
            }
            else if (waited >= LEARN_TIMEOUT_MS) {
                i++;
                waited = 0;
                lockMs = 200; // 5秒押さなかったらスキップ
            }
        }
        prev = snap;
        paint();
        if (i >= order.length)
            resolve(true);
    });
    win.remove();
    if (ok)
        input.saveBinding(padId, binding);
    return ok;
}
// ───────── みせ（どうぐや・ぶきや） ─────────
/** 装備のとき、持ち主になれる仲間ごとの こうげき/しゅび の変化を1行で */
function equipHint(g, id) {
    const e = equipById.get(id);
    if (!e)
        return rubyToHtml(itemById.get(id)?.desc ?? '');
    const lines = [];
    for (const m of g.gs.party) {
        const d = equipDiff(m, id);
        if (!d)
            continue;
        const nm = d.stat === 'atk' ? 'こうげき' : 'しゅび';
        const arrow = d.to > d.from ? '<span class="up">↑</span>' : d.to < d.from ? '<span class="down">↓</span>' : '';
        lines.push(`${m.name} ${nm} ${d.from}→${d.to} ${arrow}`);
    }
    if (!lines.length)
        lines.push('いまの なかまには そうびできない');
    if (e.note)
        lines.push(rubyToHtml(e.note));
    return lines.join('\n');
}
/**
 * お店。買うだけ（売るのは入れていない）。
 * 品ぞろえは data/shops.json。値段は items.json / equipment.json の price が正本。
 * 窓は ui_theme.json の shop（list・gold）とフィールドのメッセージ窓を使う。
 */
export async function shopTalk(g, shopId) {
    const { overlay, gs, audio } = g;
    const stock = shopStock(gs, shopId).filter((id) => priceOf(id) != null);
    const shopUi = uiTheme.layout.shop;
    const msg = overlay.window(overlay.messageRect, 'msg');
    const say = (t) => { msg.innerHTML = `<div class="msg-text text-line">${t}</div>`; };
    if (!stock.length) {
        msg.remove();
        await overlay.message('ごめんね、いまは なにも\nならべて いないんだ。');
        return;
    }
    const gold = overlay.window(shopUi.gold, 'gold');
    const paintGold = () => { gold.innerHTML = `${gs.gold} G<i class="corner-tr"></i><i class="corner-bl"></i>`; };
    paintGold();
    // あいさつは先に1回だけ。リストを出すと説明文で上書きされるので、ここで見せきる
    await overlay.message('いらっしゃい！\nなにに する？', { el: msg });
    let cur = 0;
    let quiet = false; // 直前に出した「かった！」を、カーソルを動かすまで消さない
    for (;;) {
        const labels = stock.map((id) => {
            const price = priceOf(id);
            const name = itemById.get(id)?.name ?? must(equipById.get(id), id).name;
            return { label: name, right: `${price}G`, disabled: gs.gold < price };
        });
        cur = await overlay.choose(labels, {
            rect: shopUi.list, start: Math.min(cur, stock.length - 1), keep: false,
            quietStart: quiet,
            onMove: (i) => say(equipHint(g, stock[i])),
        });
        quiet = false;
        if (cur < 0)
            break;
        const id = stock[cur];
        const name = labels[cur].label;
        const r = buy(gs, id);
        if (!r.ok) {
            audio.se('cancel');
            say(rubyToHtml(r.reason === 'gold' ? 'おかねが たりないようだね。' : 'もう いっぱい もっているよ。'));
            quiet = true;
            continue;
        }
        audio.se('coconut');
        paintGold();
        say(rubyToHtml(`${name}を かった！\nありがとう！`));
        quiet = true;
        // 買った装備は、その場でつけられるようにする（子どもが装備画面を探さなくていい）
        const eq = equipById.get(id);
        if (eq) {
            const who = gs.party.filter((m) => eq.who.includes(m.id));
            if (who.length) {
                const pick = who.length === 1
                    ? (await overlay.confirm(`${who[0].name}に いま そうびする？`) ? 0 : -1)
                    : await overlay.choose(who.map((m) => ({ label: m.name })), { rect: R(8, 8, 180, 56) });
                if (pick >= 0 && equip(gs, who[pick].id, id).ok) {
                    audio.se('confirm');
                    clampVitals(who[pick]);
                    say(rubyToHtml(`${who[pick].name}は ${name}を そうびした！`));
                    quiet = true;
                }
            }
        }
    }
    gold.remove();
    msg.remove();
    await overlay.message('また きてね！');
}
// ───────── 名前入力 ─────────
const KANA_ROWS = [
    'あいうえおかきくけこ', 'さしすせそたちつてと', 'なにぬねのはひふへほ', 'まみむめもやゆよわを', 'らりるれろんっゃゅょー', 'がぎぐげござじずぜぞ', 'だぢづでどばびぶべぼ', 'ぱぴぷぺぽぁぃぅぇぉ・',
];
export async function nameEntry(g, def, max = 4) {
    const { overlay, input } = g;
    const cells = [];
    const cols = 11;
    KANA_ROWS.forEach((row) => { const arr = [...row]; while (arr.length < 10)
        arr.push(''); cells.push(...arr, ''); });
    cells.push('けす', '', '', 'おわり');
    const total = cells.length;
    let name = [...def].slice(0, max);
    let sel = 0;
    const win = overlay.window(R(8, 8, 304, 164), 'name-entry');
    const paint = () => {
        const nm = name.join('').padEnd(max, '＿');
        win.innerHTML = `<div style="text-align:center;margin-bottom:calc(var(--px)*3px)">なまえを いれてね　<b style="color:var(--gold-bright)">${nm}</b></div><div class="kana">${cells.map((c, i) => `<span data-i="${i}" class="${i === sel ? 'sel' : ''}">${c}</span>`).join('')}</div><i class="corner-tr"></i><i class="corner-bl"></i>`;
    };
    const press = (i) => {
        const c = cells[i];
        if (!c)
            return false;
        if (c === 'けす') {
            name.pop();
            g.audio.se('cancel');
        }
        else if (c === 'おわり')
            return name.length > 0;
        else if (name.length < max) {
            name.push(c);
            g.audio.se('confirm');
        }
        return false;
    };
    paint();
    win.addEventListener('pointerdown', (e) => {
        const t = e.target.closest('[data-i]');
        if (t) {
            sel = Number(t.dataset.i);
            paint();
        }
    });
    const res = await overlay.modal((resolve) => () => {
        const move = (dx, dy) => {
            let n = sel;
            for (let k = 0; k < total; k++) {
                n = (n + dx + dy * cols + total * 4) % total;
                if (cells[n])
                    break;
            }
            sel = n;
            paint();
            g.audio.se('cursor');
        };
        if (input.repeat('left'))
            move(-1, 0);
        if (input.repeat('right'))
            move(1, 0);
        if (input.repeat('up'))
            move(0, -1);
        if (input.repeat('down'))
            move(0, 1);
        if (input.pressed('confirm')) {
            const done = press(sel);
            paint();
            if (done)
                resolve(name.join(''));
        }
        if (input.pressed('cancel')) {
            name.pop();
            paint();
        }
    });
    win.remove();
    return res || def;
}
// ───────── 宿屋 ─────────
export async function innTalk(g, innId) {
    const { overlay, gs, audio } = g;
    const inn = innById(innId);
    const msg = overlay.window(overlay.messageRect, 'msg');
    msg.innerHTML = `<div class="msg-text text-line">${rubyToHtml(`ようこそ！\nひとばん ${inn.price}ゴールドだよ`)}</div>`;
    const pick = await overlay.choose([{ label: 'とまる' }, { label: 'セーブする' }, { label: 'やめる' }], { rect: R(216, 8, 96, 56), keep: false });
    msg.remove();
    if (pick === 0) {
        if (!stayAtInn(gs, innId).ok) {
            await overlay.message('おや、おかねが たりないようだね。\nまた おいで。');
            return;
        }
        await overlay.fade(true, 500);
        audio.se('save');
        await overlay.wait(900);
        await overlay.fade(false, 500);
        await overlay.message('おはよう！ ぐっすり ねむれたかい？\nげんきに なったようだね！');
        if (await overlay.confirm('ぼうけんの きろくを のこす？'))
            await doSave(g);
    }
    else if (pick === 1) {
        await doSave(g);
    }
    else {
        await overlay.message('また おいで！');
    }
}
export async function doSave(g) {
    const { overlay, gs, audio } = g;
    if (g.hasSave() && !(await overlay.confirm('まえの きろくに うわがき するよ。\nいい？'))) {
        await overlay.message('おわりに しました。');
        return;
    }
    if (g.persist()) {
        audio.se('save');
        await overlay.message('ぼうけんの きろくを のこしました。');
    }
    else
        await overlay.message('ごめんね、きろくに しっぱいしました。\nブラウザの せっていを みてね。');
    void gs;
    void saveGame;
}
