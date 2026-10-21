let ctx = null;
export function setCtx(c) { ctx = c; }
export function G() {
    if (!ctx)
        throw new Error('GameCtx が初期化されていません');
    return ctx;
}
