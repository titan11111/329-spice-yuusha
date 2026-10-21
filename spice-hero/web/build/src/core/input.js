/**
 * 入力: キーボード / ゲームパッド（standard・Joy-Con1本など） / タッチ をまとめて「アクション」にする。
 * ゲームの中ではボタン番号を使わず、アクション名だけを使う。仕様: docs/02_UI.md 5章
 */
import { inputConfig } from "./data.js";
import { defaultStore, loadPadBinding, savePadBinding } from "./save.js";
export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'fast'];
const std = inputConfig.gamepadStandard;
const DEADZONE = std.deadzone ?? 0.5;
/** 強いほうの向きだけを使う（斜めは4方向のどれかに寄せる） */
function stickDirs(axes, xi, yi) {
    const x = axes[xi] ?? 0;
    const y = axes[yi] ?? 0;
    const out = new Set();
    if (Math.max(Math.abs(x), Math.abs(y)) < DEADZONE)
        return out;
    if (Math.abs(x) >= Math.abs(y))
        out.add(x < 0 ? 'left' : 'right');
    else
        out.add(y < 0 ? 'up' : 'down');
    return out;
}
/** パッド1台ぶんの押されているアクション。standard のときは標準配置、それ以外は覚えさせた設定 */
export function padActions(p, binding) {
    const out = new Set();
    if (p.mapping === 'standard' && !binding) {
        for (const a of ACTIONS) {
            const c = std[a];
            if (c?.buttons.some((i) => p.buttons[i]))
                out.add(a);
        }
        for (const d of stickDirs(p.axes, 0, 1))
            out.add(d);
        return out;
    }
    if (!binding)
        return out;
    for (const a of ACTIONS) {
        if (binding.buttons[a]?.some((i) => p.buttons[i]))
            out.add(a);
        const ax = binding.axes[a];
        if (ax) {
            const v = p.axes[ax.index] ?? 0;
            if (ax.dir < 0 ? v <= -DEADZONE : v >= DEADZONE)
                out.add(a);
        }
    }
    return out;
}
/** ボタン設定画面: 直前の状態と今の状態を比べて、新しく押されたボタン/倒れた軸を見つける */
export function detectLearn(prev, cur) {
    for (let i = 0; i < cur.buttons.length; i++)
        if (cur.buttons[i] && !prev?.buttons[i])
            return { button: i };
    for (let i = 0; i < cur.axes.length; i++) {
        const v = cur.axes[i];
        const pv = prev?.axes[i] ?? 0;
        // Joy-Con の十字キーが1本の軸で来る機種があるので、軸の変化も見る
        if (Math.abs(v) >= DEADZONE && Math.abs(pv) < DEADZONE)
            return { axis: { index: i, dir: v < 0 ? -1 : 1 } };
    }
    return null;
}
export function emptyBinding() {
    return { buttons: {}, axes: {} };
}
export function applyLearn(b, action, r) {
    if ('button' in r)
        b.buttons[action] = [...(b.buttons[action] ?? []), r.button];
    else
        b.axes[action] = r.axis;
}
export const LEARN_ORDER = inputConfig.gamepadCustom.learnOrder;
export const LEARN_TIMEOUT_MS = inputConfig.gamepadCustom.learnTimeoutMs;
export class InputManager {
    keys = new Set();
    touch = new Set();
    touchPulse = new Set();
    cur = new Set();
    prev = new Set();
    holdMs = {};
    repeated = new Set();
    pressedAt = new Map();
    lastKind = 'keyboard';
    /** 設定が必要なパッドID（standardでなく、まだ設定がないもの）。ゲーム側が見てボタン設定画面を出す */
    needsSetup = null;
    disconnected = false;
    pads = new Map();
    store;
    getPads;
    lastTime = 0;
    listeners = [];
    ignoreSetup = new Set();
    constructor(opts = {}) {
        this.store = opts.store ?? defaultStore();
        this.getPads = opts.getPads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []));
        const w = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
        if (!w)
            return;
        const kbd = inputConfig.keyboard;
        const onDown = (e) => {
            const mapped = ACTIONS.some((a) => kbd[a]?.includes(e.code));
            if (!mapped)
                return;
            if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))
                e.preventDefault();
            this.keys.add(e.code);
            this.lastKind = 'keyboard';
        };
        const onUp = (e) => { this.keys.delete(e.code); };
        const onBlur = () => { this.keys.clear(); this.touch.clear(); };
        w.addEventListener('keydown', onDown);
        w.addEventListener('keyup', onUp);
        w.addEventListener('blur', onBlur);
        w.addEventListener('gamepaddisconnected', () => { this.disconnected = true; });
        w.addEventListener('gamepadconnected', (e) => {
            this.disconnected = false;
            this.lastKind = 'pad';
            const id = e.gamepad.id;
            this.pads.delete(id);
        });
        this.listeners.push(() => {
            w.removeEventListener('keydown', onDown);
            w.removeEventListener('keyup', onUp);
            w.removeEventListener('blur', onBlur);
        });
    }
    dispose() { this.listeners.forEach((f) => f()); this.listeners = []; }
    // タッチUIから呼ぶ
    setTouch(action, down) {
        if (down) {
            this.touch.add(action);
            this.touchPulse.add(action);
            this.lastKind = 'touch';
        }
        else
            this.touch.delete(action);
    }
    padSnapshot(g) {
        return { id: g.id, mapping: g.mapping, buttons: g.buttons.map((b) => b.pressed || b.value > 0.6), axes: [...g.axes] };
    }
    /** ボタン設定画面用: 今つながっているパッドの状態 */
    currentPadSnapshots() {
        return this.getPads().filter((g) => !!g && g.connected).map((g) => this.padSnapshot(g));
    }
    saveBinding(padId, b) {
        savePadBinding(padId, b, this.store);
        this.pads.set(padId, b);
        this.ignoreSetup.delete(padId);
        if (this.needsSetup === padId)
            this.needsSetup = null;
    }
    skipSetup(padId) { this.ignoreSetup.add(padId); if (this.needsSetup === padId)
        this.needsSetup = null; }
    /** 毎フレーム呼ぶ。now はミリ秒 */
    update(now) {
        const dt = this.lastTime ? now - this.lastTime : 0;
        this.lastTime = now;
        const next = new Set();
        const kbd = inputConfig.keyboard;
        for (const a of ACTIONS)
            if (kbd[a]?.some((k) => this.keys.has(k)))
                next.add(a);
        for (const a of this.touch)
            next.add(a);
        for (const a of this.touchPulse)
            next.add(a);
        this.touchPulse.clear();
        // ゲームパッド: イベントだけに頼らず毎フレーム読む
        let anyPad = false;
        for (const g of this.getPads()) {
            if (!g || !g.connected)
                continue;
            anyPad = true;
            const snap = this.padSnapshot(g);
            if (!this.pads.has(snap.id))
                this.pads.set(snap.id, loadPadBinding(snap.id, this.store));
            const binding = this.pads.get(snap.id) ?? null;
            if (snap.mapping !== 'standard' && !binding && !this.ignoreSetup.has(snap.id))
                this.needsSetup = snap.id;
            const acts = padActions(snap, binding);
            if (acts.size)
                this.lastKind = 'pad';
            for (const a of acts)
                next.add(a);
        }
        if (anyPad)
            this.disconnected = false;
        this.prev = this.cur;
        this.cur = next;
        this.repeated.clear();
        const { firstDelayMs, intervalMs } = inputConfig.repeat;
        for (const a of ACTIONS) {
            if (!next.has(a)) {
                delete this.holdMs[a];
                continue;
            }
            if (!this.prev.has(a)) {
                this.holdMs[a] = 0;
                this.pressedAt.set(a, now);
                continue;
            }
            const before = this.holdMs[a] ?? 0;
            const after = before + dt;
            this.holdMs[a] = after;
            // 最初の1回のあと firstDelay 待って、そのあと interval ごとにくり返す
            if (after >= firstDelayMs) {
                const n0 = Math.floor((before - firstDelayMs) / intervalMs);
                const n1 = Math.floor((after - firstDelayMs) / intervalMs);
                if (before < firstDelayMs || n1 > n0)
                    this.repeated.add(a);
            }
        }
    }
    isDown(a) { return this.cur.has(a); }
    /** 押した瞬間 */
    pressed(a) { return this.cur.has(a) && !this.prev.has(a); }
    /** 押した瞬間＋長押しのくり返し（メニューのカーソル用） */
    repeat(a) { return this.pressed(a) || this.repeated.has(a); }
    held(a) { return this.holdMs[a] ?? 0; }
    /** 今の向き（フィールドの歩き用）。同時押しは最後に押したものを優先 */
    direction() {
        let best = null;
        let t = -1;
        for (const a of ['up', 'down', 'left', 'right']) {
            if (!this.cur.has(a))
                continue;
            const at = this.pressedAt.get(a) ?? 0;
            if (at >= t) {
                t = at;
                best = a;
            }
        }
        return best;
    }
    /** ボタンの説明（「Aで けってい」等）を最後に使った入力に合わせて返す */
    label(a) {
        const L = {
            keyboard: { confirm: 'Enter', cancel: 'Esc', menu: 'C', fast: 'Shift' },
            pad: { confirm: '●', cancel: '×', menu: '≡', fast: 'R' },
            touch: { confirm: 'A', cancel: 'B', menu: '≡', fast: '≫' },
        };
        return L[this.lastKind][a] ?? '';
    }
}
