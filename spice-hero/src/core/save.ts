/**
 * セーブ/ロード。保存先は localStorage（キー tg.329.save）。スロットは1つだけ。
 * version を持たせて、将来データが変わっても古いセーブを読めるようにする。
 */
import { type GameState, defaultSettings, newGame } from './state.ts';

export const SAVE_KEY = 'tg.329.save';
export const PAD_KEY_PREFIX = 'tg.329.pad.';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage が使えない環境（プライベートモード等）でも落ちないメモリ保存 */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

export function defaultStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__spice_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStore();
  }
}

export function saveGame(gs: GameState, store: KeyValueStore = defaultStore(), now = new Date()): boolean {
  try {
    gs.savedAt = now.toISOString();
    store.setItem(SAVE_KEY, JSON.stringify(gs));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(store: KeyValueStore = defaultStore()): boolean {
  return store.getItem(SAVE_KEY) !== null;
}

/** 読めないセーブ（壊れている・新しすぎる）は null を返す。落とさない */
export function loadGame(store: KeyValueStore = defaultStore()): GameState | null {
  const raw = store.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GameState> & { version?: number };
    if (typeof data.version !== 'number' || data.version > 1) return null;
    return migrate(data);
  } catch {
    return null;
  }
}

/** 足りない項目を初期値で補う（バージョンが上がったときの入口） */
export function migrate(data: Partial<GameState>): GameState {
  const base = newGame();
  return {
    ...base,
    ...data,
    version: 1,
    pos: { ...base.pos, ...(data.pos ?? {}) },
    items: { ...(data.items ?? base.items) },
    gear: { ...(data.gear ?? {}) },
    flags: { ...(data.flags ?? {}) },
    defeatCount: { ...(data.defeatCount ?? {}) },
    keyItems: [...(data.keyItems ?? [])],
    party: data.party && data.party.length ? data.party : base.party,
    settings: { ...defaultSettings(), ...(data.settings ?? {}) },
  };
}

export function deleteSave(store: KeyValueStore = defaultStore()): void {
  store.removeItem(SAVE_KEY);
}

// ───────── パッドのボタン設定 ─────────

export interface PadBinding {
  buttons: Partial<Record<string, number[]>>;
  axes: Partial<Record<string, { index: number; dir: -1 | 1 }>>;
}

export function savePadBinding(padId: string, b: PadBinding, store: KeyValueStore = defaultStore()): void {
  try { store.setItem(PAD_KEY_PREFIX + padId, JSON.stringify(b)); } catch { /* 保存できなくても遊べる */ }
}

export function loadPadBinding(padId: string, store: KeyValueStore = defaultStore()): PadBinding | null {
  try {
    const raw = store.getItem(PAD_KEY_PREFIX + padId);
    return raw ? (JSON.parse(raw) as PadBinding) : null;
  } catch {
    return null;
  }
}

export function clearPadBinding(padId: string, store: KeyValueStore = defaultStore()): void {
  store.removeItem(PAD_KEY_PREFIX + padId);
}
