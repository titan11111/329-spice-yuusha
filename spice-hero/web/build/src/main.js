import Phaser from 'phaser';
import { InputManager } from './core/input.js';
import { loadGame, saveGame, hasSave } from './core/save.js';
import { newGame } from './core/state.js';
import { Overlay } from './ui/overlay.js';
import { GameAudio } from './game/audio.js';
import { setCtx } from './game/ctx.js';
import { BootScene } from './game/scenes/BootScene.js';
import { TitleScene } from './game/scenes/TitleScene.js';
import { FieldScene } from './game/scenes/FieldScene.js';
import { BattleScene } from './game/scenes/BattleScene.js';
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
    toggleMute: () => toggleMute(),
    isMuted: () => gs.settings.bgm === 0 && gs.settings.se === 0,
    pause: () => setPaused(true),
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
}
function setPaused(on) {
    if (userPaused === on)
        return;
    userPaused = on;
    // ポーズ中は update() が止まる。押しっぱなしの入力を捨てないと解除した瞬間に1回ぶん入る
    input.clearTouch();
    applyPause();
}
function togglePause() { setPaused(!userPaused); }
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
const DIRS = ['up', 'down', 'left', 'right'];
const fc = window.initFcIosController;
fc?.({
    keyboard: false,
    buttons: {
        'fc-btn-a': ['KeyZ'],
        'fc-btn-b': ['KeyX'],
        'fc-btn-select': ['KeyC'],
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
    },
});
// ポーズ画面はタップで解除する（操作盤にポーズボタンを置かないため、ここが唯一の出口になる）
const pauseLayer = document.getElementById('pause-layer');
pauseLayer?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setPaused(false);
});
// キーボードのポーズ。ポーズ中は Phaser のループが寝ているので DOM 側で受ける。
// Esc は menus の「キャンセル」と重なるので割り当てない
window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.repeat)
        return;
    e.preventDefault();
    togglePause();
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
