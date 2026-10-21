/**
 * セーブ/ロード。保存先は localStorage（キー tg.329.save）。スロットは1つだけ。
 * version を持たせて、将来データが変わっても古いセーブを読めるようにする。
 */
import { defaultSettings, newGame } from "./state.js";
export const SAVE_KEY = 'tg.329.save';
export const PAD_KEY_PREFIX = 'tg.329.pad.';
/** localStorage が使えない環境（プライベートモード等）でも落ちないメモリ保存 */
export class MemoryStore {
    m = new Map();
    getItem(k) { return this.m.get(k) ?? null; }
    setItem(k, v) { this.m.set(k, v); }
    removeItem(k) { this.m.delete(k); }
}
export function defaultStore() {
    try {
        const ls = globalThis.localStorage;
        const probe = '__spice_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
        return ls;
    }
    catch {
        return new MemoryStore();
    }
}
export function saveGame(gs, store = defaultStore(), now = new Date()) {
    try {
        gs.savedAt = now.toISOString();
        store.setItem(SAVE_KEY, JSON.stringify(gs));
        return true;
    }
    catch {
        return false;
    }
}
export function hasSave(store = defaultStore()) {
    return store.getItem(SAVE_KEY) !== null;
}
/** 読めないセーブ（壊れている・新しすぎる）は null を返す。落とさない */
export function loadGame(store = defaultStore()) {
    const raw = store.getItem(SAVE_KEY);
    if (!raw)
        return null;
    try {
        const data = JSON.parse(raw);
        if (typeof data.version !== 'number' || data.version > 1)
            return null;
        return migrate(data);
    }
    catch {
        return null;
    }
}
/** 足りない項目を初期値で補う（バージョンが上がったときの入口） */
export function migrate(data) {
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
export function deleteSave(store = defaultStore()) {
    store.removeItem(SAVE_KEY);
}
export function savePadBinding(padId, b, store = defaultStore()) {
    try {
        store.setItem(PAD_KEY_PREFIX + padId, JSON.stringify(b));
    }
    catch { /* 保存できなくても遊べる */ }
}
export function loadPadBinding(padId, store = defaultStore()) {
    try {
        const raw = store.getItem(PAD_KEY_PREFIX + padId);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function clearPadBinding(padId, store = defaultStore()) {
    store.removeItem(PAD_KEY_PREFIX + padId);
}
