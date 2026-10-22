/**
 * FC iOS Controller — Pointer Events + setPointerCapture
 * @param {object} [opts]
 * @param {Record<string, string|string[]>} [opts.buttons] id → KeyboardEvent.code(s)
 * @param {(keys: Record<string, boolean>) => void} [opts.onChange]
 * @returns {{ K: Record<string, boolean>, destroy: () => void }}
 */
function initFcIosController(opts = {}) {
  const K = Object.create(null);
  const handlers = [];
  const buttonMap = {
    "fc-btn-a": ["KeyZ", "Space"],
    "fc-btn-b": ["KeyX"],
    "fc-btn-select": ["ShiftLeft"],
    "fc-btn-start": ["Enter"],
    ...opts.buttons,
  };

  function emit() {
    if (typeof opts.onChange === "function") opts.onChange({ ...K });
  }

  function setKeys(codes, on) {
    codes.forEach((code) => {
      K[code] = on;
    });
    emit();
  }

  function bindPointerButton(el, codes) {
    if (!el) return;
    const down = (e) => {
      if (opts.enabled && !opts.enabled()) return;
      if (opts.onInteract) opts.onInteract();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {}
      setKeys(codes, true);
      el.classList.add("pressed");
      if (navigator.vibrate) navigator.vibrate(12);
    };
    const up = (e) => {
      setKeys(codes, false);
      el.classList.remove("pressed");
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    const lost = () => {
      setKeys(codes, false);
      el.classList.remove("pressed");
    };
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointerup", up, { passive: false });
    el.addEventListener("pointercancel", up, { passive: false });
    el.addEventListener("lostpointercapture", lost);
    handlers.push({ el, down, up, lost });
  }

  const dpadWrap = document.getElementById(opts.dpadWrapId || "fc-dpad-wrap");
  const dpadEl = document.getElementById(opts.dpadId || "fc-dpad");
  let dpadPid = null;

  function setDpad(up, down, left, right) {
    const changed = !K.ArrowUp !== !up || !K.ArrowDown !== !down ||
                    !K.ArrowLeft !== !left || !K.ArrowRight !== !right;
    K.ArrowUp = up;
    K.ArrowDown = down;
    K.ArrowLeft = left;
    K.ArrowRight = right;
    if (dpadEl) {
      dpadEl.dataset.up = up ? "1" : "0";
      dpadEl.dataset.down = down ? "1" : "0";
      dpadEl.dataset.left = left ? "1" : "0";
      dpadEl.dataset.right = right ? "1" : "0";
      dpadEl.classList.toggle("pressed", up || down || left || right);
    }
    if (!up && !down && !left && !right) { K.AxisX = 0; K.AxisY = 0; }
    if (changed && (up || down || left || right) && navigator.vibrate) navigator.vibrate(8);
    emit();
  }

  function calcDpad(e) {
    if (!dpadWrap) return;
    const r = dpadWrap.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const s = Math.min(r.width, r.height);
    const dead = s * 0.12;
    const thr = s * 0.17;
    if (Math.abs(dx) < dead && Math.abs(dy) < dead) {
      setDpad(false, false, false, false);
      return;
    }
    const nx = dx / (r.width * .38), ny = -dy / (r.height * .40);
    const length = Math.hypot(nx, ny), gain = Math.min(1, Math.max(0, length - .1) / .65) / (length || 1);
    K.AxisX = nx * gain; K.AxisY = ny * gain;
    // 主軸寄せ: 縦棒・横棒の端を触ったときに弱いほうの向きまで入らないようにする。
    // 十字の棒は半幅が17〜23pxあり、しきい値(s*0.17=16〜22px)を素で超えてしまうため、
    // 「もう一方の軸の1.6倍以上あるときだけ有効」にして斜めだけ両方を通す
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const useX = ax > thr && ax * 1.6 >= ay;
    const useY = ay > thr && ay * 1.6 >= ax;
    setDpad(useY && dy < 0, useY && dy > 0, useX && dx < 0, useX && dx > 0);
  }

  if (dpadWrap) {
    const onDown = (e) => {
      if (opts.enabled && !opts.enabled()) return;
      if (opts.onInteract) opts.onInteract();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      if (dpadPid !== null) return;
      dpadPid = e.pointerId;
      try {
        dpadWrap.setPointerCapture(e.pointerId);
      } catch (_) {}
      calcDpad(e);
    };
    const onMove = (e) => {
      if (e.pointerId !== dpadPid) return;
      e.preventDefault();
      calcDpad(e);
    };
    const releaseDpad = (e) => {
      if (e.pointerId !== dpadPid) return;
      dpadPid = null;
      setDpad(false, false, false, false);
    };
    const onLost = () => { dpadPid = null; setDpad(false, false, false, false); };

    dpadWrap.addEventListener("pointerdown", onDown, { passive: false });
    dpadWrap.addEventListener("pointermove", onMove, { passive: false });
    dpadWrap.addEventListener("pointerup", releaseDpad);
    dpadWrap.addEventListener("pointercancel", releaseDpad);
    dpadWrap.addEventListener("lostpointercapture", onLost);
    handlers.push({ el: dpadWrap, down: onDown, move: onMove, up: releaseDpad, lost: onLost });
  }

  Object.entries(buttonMap).forEach(([id, codes]) => {
    const el = document.getElementById(id);
    const list = Array.isArray(codes) ? codes : [codes];
    bindPointerButton(el, list);
  });

  const onKeyDown = (e) => {
    if (opts.keyboard === false || (opts.enabled && !opts.enabled())) return;
    K[e.code] = true;
    emit();
  };
  const onKeyUp = (e) => {
    if (opts.keyboard === false) return;
    K[e.code] = false;
    emit();
  };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  handlers.push({ el: document, down: onKeyDown, up: onKeyUp });

  return {
    K,
    reset() { dpadPid = null; Object.keys(K).forEach(key => K[key] = false); emit(); },
    destroy() {
      handlers.forEach((h) => {
        if (h.move) h.el.removeEventListener("pointermove", h.move);
        if (h.down) h.el.removeEventListener("pointerdown", h.down);
        if (h.up) h.el.removeEventListener("pointerup", h.up);
        if (h.lost) h.el.removeEventListener("lostpointercapture", h.lost);
        if (h.el === document) {
          h.el.removeEventListener("keydown", h.down);
          h.el.removeEventListener("keyup", h.up);
        }
      });
    },
  };
}

/** iOS Safari 向けタッチガード（ゲーム起動時に1回） */
function installFcIosTouchGuard() {
  let lastTouchEnd = 0;
  const onTouchEnd = (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  };
  document.addEventListener("touchend", onTouchEnd, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault());
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  return () => document.removeEventListener("touchend", onTouchEnd);
}

window.initFcIosController = initFcIosController;
window.installFcIosTouchGuard = installFcIosTouchGuard;
