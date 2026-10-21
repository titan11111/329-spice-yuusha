import Phaser from 'phaser';
import { InputManager } from "./core/input.js";
import { loadGame, saveGame, hasSave } from "./core/save.js";
import { newGame } from "./core/state.js";
import { Overlay } from "./ui/overlay.js";
import { GameAudio } from "./game/audio.js";
import { setCtx } from "./game/ctx.js";
import { BootScene } from "./game/scenes/BootScene.js";
import { TitleScene } from "./game/scenes/TitleScene.js";
import { FieldScene } from "./game/scenes/FieldScene.js";
import { BattleScene } from "./game/scenes/BattleScene.js";
const MUTE_KEY = 'tg.329.mute';
const VOL_KEY = 'tg.329.vol';
function readStore(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function writeStore(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch { /* 保存できなくても遊べる */ }
}
const input = new InputManager();
const gs = newGame();
const savedVol = (() => {
    try {
        const v = JSON.parse(readStore(VOL_KEY) || '');
        if (v && typeof v.bgm === 'number' && typeof v.se === 'number')
            return v;
    }
    catch { /* 初期音量 */ }
    return { bgm: gs.settings.bgm, se: gs.settings.se };
})();
if (readStore(MUTE_KEY) === '1') {
    gs.settings.bgm = 0;
    gs.settings.se = 0;
}
const ctx = {
    input, gs,
    hasSave: () => hasSave(),
    persist: () => {
        ctx.gs.savedAt = new Date().toISOString();
        return saveGame(ctx.gs);
    },
    startedAt: Date.now(),
};
const overlay = new Overlay(input, () => ctx.gs.settings);
const audio = new GameAudio(() => ctx.gs.settings);
ctx.overlay = overlay;
ctx.audio = audio;
setCtx(ctx);
void loadGame;
let userPaused = false;
let autoPaused = false;
let game;
function applyPause() {
    const on = userPaused || autoPaused;
    document.body.classList.toggle('is-paused', on);
    const loop = game?.loop;
    if (!loop)
        return;
    if (on) {
        if (loop.sleep)
            loop.sleep();
        else
            loop.running = false;
    }
    else if (loop.wake)
        loop.wake();
    else
        loop.running = true;
}
function toggleMute() {
    const s = gs.settings;
    const muted = s.bgm === 0 && s.se === 0;
    if (muted) {
        s.bgm = savedVol.bgm || 0.7;
        s.se = savedVol.se || 0.8;
    }
    else {
        savedVol.bgm = s.bgm || 0.7;
        savedVol.se = s.se || 0.8;
        writeStore(VOL_KEY, JSON.stringify(savedVol));
        s.bgm = 0;
        s.se = 0;
    }
    writeStore(MUTE_KEY, s.bgm === 0 && s.se === 0 ? '1' : '0');
    audio.applyVolume();
    const btn = document.getElementById('fc-btn-mute');
    if (btn)
        btn.textContent = s.bgm === 0 && s.se === 0 ? '🔇' : '🔊';
}
function togglePause() {
    userPaused = !userPaused;
    if (userPaused) {
        for (const a of ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'fast'])
            input.setTouch(a, false);
    }
    applyPause();
}
game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-canvas',
    width: 320,
    height: 180,
    pixelArt: true,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.NONE },
    scene: [BootScene, TitleScene, FieldScene, BattleScene],
});
let startHeld = false;
const DIRS = ['up', 'down', 'left', 'right'];
window.initFcIosController({
    keyboard: false,
    buttons: {
        'fc-btn-a': ['KeyZ'],
        'fc-btn-b': ['KeyX'],
        'fc-btn-select': ['KeyC'],
        'fc-btn-start': ['KeyP'],
    },
    onInteract() { audio.se('cursor'); },
    onChange(keys) {
        const vx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
        const vy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
        let dir = null;
        if (vx || vy)
            dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
        for (const d of DIRS)
            input.setTouch(d, d === dir);
        input.setTouch('confirm', !!keys.KeyZ);
        input.setTouch('cancel', !!keys.KeyX);
        input.setTouch('menu', !!keys.KeyC);
        const start = !!keys.KeyP;
        if (start && !startHeld)
            togglePause();
        startHeld = start;
    },
});
const muteBtn = document.getElementById('fc-btn-mute');
if (readStore(MUTE_KEY) === '1' && muteBtn)
    muteBtn.textContent = '🔇';
muteBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { muteBtn.setPointerCapture(e.pointerId); } catch { /* 離れていれば無視 */ }
    toggleMute();
});
game.events.on('step', (time) => {
    if (userPaused || autoPaused)
        return;
    input.update(time);
    overlay.tick(time);
});
document.addEventListener('visibilitychange', () => {
    autoPaused = document.hidden;
    applyPause();
});
