/**
 * 入力: キーボード / ゲームパッド（standard・Joy-Con1本など） / タッチ をまとめて「アクション」にする。
 * ゲームの中ではボタン番号を使わず、アクション名だけを使う。仕様: docs/02_UI.md 5章
 */
import { inputConfig } from './data.ts';
import { type KeyValueStore, type PadBinding, defaultStore, loadPadBinding, savePadBinding } from './save.ts';

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'fast';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'fast'];
export type InputKind = 'keyboard' | 'pad' | 'touch';

/** Gamepad の必要な部分だけ（テストしやすいように） */
export interface PadSnapshot {
  id: string;
  mapping: string;
  buttons: boolean[];
  axes: number[];
}

type StdCfg = Partial<Record<Action, { buttons: number[]; axis?: { index: number; dir: -1 | 1 } }>>;
const std = inputConfig.gamepadStandard as unknown as StdCfg & { deadzone: number };
const DEADZONE = std.deadzone ?? 0.5;

/** 強いほうの向きだけを使う（斜めは4方向のどれかに寄せる） */
function stickDirs(axes: number[], xi: number, yi: number): Set<Action> {
  const x = axes[xi] ?? 0;
  const y = axes[yi] ?? 0;
  const out = new Set<Action>();
  if (Math.max(Math.abs(x), Math.abs(y)) < DEADZONE) return out;
  if (Math.abs(x) >= Math.abs(y)) out.add(x < 0 ? 'left' : 'right');
  else out.add(y < 0 ? 'up' : 'down');
  return out;
}

/** パッド1台ぶんの押されているアクション。standard のときは標準配置、それ以外は覚えさせた設定 */
export function padActions(p: PadSnapshot, binding: PadBinding | null): Set<Action> {
  const out = new Set<Action>();
  if (p.mapping === 'standard' && !binding) {
    for (const a of ACTIONS) {
      const c = std[a];
      if (c?.buttons.some((i) => p.buttons[i])) out.add(a);
    }
    for (const d of stickDirs(p.axes, 0, 1)) out.add(d);
    return out;
  }
  if (!binding) return out;
  for (const a of ACTIONS) {
    if (binding.buttons[a]?.some((i) => p.buttons[i])) out.add(a);
    const ax = binding.axes[a];
    if (ax) {
      const v = p.axes[ax.index] ?? 0;
      if (ax.dir < 0 ? v <= -DEADZONE : v >= DEADZONE) out.add(a);
    }
  }
  return out;
}

export type LearnResult = { button: number } | { axis: { index: number; dir: -1 | 1 } } | null;

/** ボタン設定画面: 直前の状態と今の状態を比べて、新しく押されたボタン/倒れた軸を見つける */
export function detectLearn(prev: PadSnapshot | null, cur: PadSnapshot): LearnResult {
  for (let i = 0; i < cur.buttons.length; i++) if (cur.buttons[i] && !prev?.buttons[i]) return { button: i };
  for (let i = 0; i < cur.axes.length; i++) {
    const v = cur.axes[i];
    const pv = prev?.axes[i] ?? 0;
    // Joy-Con の十字キーが1本の軸で来る機種があるので、軸の変化も見る
    if (Math.abs(v) >= DEADZONE && Math.abs(pv) < DEADZONE) return { axis: { index: i, dir: v < 0 ? -1 : 1 } };
  }
  return null;
}

export function emptyBinding(): PadBinding {
  return { buttons: {}, axes: {} };
}

export function applyLearn(b: PadBinding, action: Action, r: NonNullable<LearnResult>): void {
  if ('button' in r) b.buttons[action] = [...(b.buttons[action] ?? []), r.button];
  else b.axes[action] = r.axis;
}

export const LEARN_ORDER = inputConfig.gamepadCustom.learnOrder as Action[];
export const LEARN_TIMEOUT_MS = inputConfig.gamepadCustom.learnTimeoutMs;

// ───────── InputManager（ブラウザで使う本体） ─────────

export interface InputManagerOptions {
  target?: Window;
  store?: KeyValueStore;
  getPads?: () => (Gamepad | null)[];
}

export class InputManager {
  private keys = new Set<string>();
  private touch = new Set<Action>();
  /** タップが1フレームより短いときも、次の update で押したことにする */
  private touchPulse = new Set<Action>();
  private cur = new Set<Action>();
  private prev = new Set<Action>();
  private holdMs: Partial<Record<Action, number>> = {};
  private repeated = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  lastKind: InputKind = 'keyboard';
  /** 設定が必要なパッドID（standardでなく、まだ設定がないもの）。ゲーム側が見てボタン設定画面を出す */
  needsSetup: string | null = null;
  disconnected = false;
  private pads = new Map<string, PadBinding | null>();
  private store: KeyValueStore;
  private getPads: () => (Gamepad | null)[];
  private lastTime = 0;
  private listeners: (() => void)[] = [];
  private ignoreSetup = new Set<string>();

  constructor(opts: InputManagerOptions = {}) {
    this.store = opts.store ?? defaultStore();
    this.getPads = opts.getPads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []));
    const w = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
    if (!w) return;
    const kbd = inputConfig.keyboard as unknown as Record<Action, string[]>;
    const onDown = (e: KeyboardEvent) => {
      const mapped = ACTIONS.some((a) => kbd[a]?.includes(e.code));
      if (!mapped) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      this.lastKind = 'keyboard';
    };
    const onUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
    const onBlur = () => { this.keys.clear(); this.touch.clear(); };
    w.addEventListener('keydown', onDown);
    w.addEventListener('keyup', onUp);
    w.addEventListener('blur', onBlur);
    w.addEventListener('gamepaddisconnected', () => { this.disconnected = true; });
    w.addEventListener('gamepadconnected', (e) => {
      this.disconnected = false;
      this.lastKind = 'pad';
      const id = (e as GamepadEvent).gamepad.id;
      this.pads.delete(id);
    });
    this.listeners.push(() => {
      w.removeEventListener('keydown', onDown);
      w.removeEventListener('keyup', onUp);
      w.removeEventListener('blur', onBlur);
    });
  }

  dispose(): void { this.listeners.forEach((f) => f()); this.listeners = []; }

  // タッチUIから呼ぶ
  setTouch(action: Action, down: boolean): void {
    if (down) { this.touch.add(action); this.touchPulse.add(action); this.lastKind = 'touch'; }
    else this.touch.delete(action);
  }

  private padSnapshot(g: Gamepad): PadSnapshot {
    return { id: g.id, mapping: g.mapping, buttons: g.buttons.map((b) => b.pressed || b.value > 0.6), axes: [...g.axes] };
  }

  /** ボタン設定画面用: 今つながっているパッドの状態 */
  currentPadSnapshots(): PadSnapshot[] {
    return this.getPads().filter((g): g is Gamepad => !!g && g.connected).map((g) => this.padSnapshot(g));
  }

  saveBinding(padId: string, b: PadBinding): void {
    savePadBinding(padId, b, this.store);
    this.pads.set(padId, b);
    this.ignoreSetup.delete(padId);
    if (this.needsSetup === padId) this.needsSetup = null;
  }

  skipSetup(padId: string): void { this.ignoreSetup.add(padId); if (this.needsSetup === padId) this.needsSetup = null; }

  /** 毎フレーム呼ぶ。now はミリ秒 */
  update(now: number): void {
    const dt = this.lastTime ? now - this.lastTime : 0;
    this.lastTime = now;
    const next = new Set<Action>();

    const kbd = inputConfig.keyboard as unknown as Record<Action, string[]>;
    for (const a of ACTIONS) if (kbd[a]?.some((k) => this.keys.has(k))) next.add(a);
    for (const a of this.touch) next.add(a);
    for (const a of this.touchPulse) next.add(a);
    this.touchPulse.clear();

    // ゲームパッド: イベントだけに頼らず毎フレーム読む
    let anyPad = false;
    for (const g of this.getPads()) {
      if (!g || !g.connected) continue;
      anyPad = true;
      const snap = this.padSnapshot(g);
      if (!this.pads.has(snap.id)) this.pads.set(snap.id, loadPadBinding(snap.id, this.store));
      const binding = this.pads.get(snap.id) ?? null;
      if (snap.mapping !== 'standard' && !binding && !this.ignoreSetup.has(snap.id)) this.needsSetup = snap.id;
      const acts = padActions(snap, binding);
      if (acts.size) this.lastKind = 'pad';
      for (const a of acts) next.add(a);
    }
    if (anyPad) this.disconnected = false;

    this.prev = this.cur;
    this.cur = next;
    this.repeated.clear();
    const { firstDelayMs, intervalMs } = inputConfig.repeat;
    for (const a of ACTIONS) {
      if (!next.has(a)) { delete this.holdMs[a]; continue; }
      if (!this.prev.has(a)) { this.holdMs[a] = 0; this.pressedAt.set(a, now); continue; }
      const before = this.holdMs[a] ?? 0;
      const after = before + dt;
      this.holdMs[a] = after;
      // 最初の1回のあと firstDelay 待って、そのあと interval ごとにくり返す
      if (after >= firstDelayMs) {
        const n0 = Math.floor((before - firstDelayMs) / intervalMs);
        const n1 = Math.floor((after - firstDelayMs) / intervalMs);
        if (before < firstDelayMs || n1 > n0) this.repeated.add(a);
      }
    }
  }

  isDown(a: Action): boolean { return this.cur.has(a); }
  /** 押した瞬間 */
  pressed(a: Action): boolean { return this.cur.has(a) && !this.prev.has(a); }
  /** 押した瞬間＋長押しのくり返し（メニューのカーソル用） */
  repeat(a: Action): boolean { return this.pressed(a) || this.repeated.has(a); }
  held(a: Action): number { return this.holdMs[a] ?? 0; }

  /** 今の向き（フィールドの歩き用）。同時押しは最後に押したものを優先 */
  direction(): Action | null {
    let best: Action | null = null;
    let t = -1;
    for (const a of ['up', 'down', 'left', 'right'] as Action[]) {
      if (!this.cur.has(a)) continue;
      const at = this.pressedAt.get(a) ?? 0;
      if (at >= t) { t = at; best = a; }
    }
    return best;
  }

  /** ボタンの説明（「Aで けってい」等）を最後に使った入力に合わせて返す */
  label(a: Action): string {
    const L: Record<InputKind, Partial<Record<Action, string>>> = {
      keyboard: { confirm: 'Enter', cancel: 'Esc', menu: 'C', fast: 'Shift' },
      pad: { confirm: '●', cancel: '×', menu: '≡', fast: 'R' },
      touch: { confirm: 'A', cancel: 'B', menu: '≡', fast: '≫' },
    };
    return L[this.lastKind][a] ?? '';
  }
}
