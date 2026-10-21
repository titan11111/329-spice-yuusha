import Phaser from 'phaser';
import { InputManager } from './core/input.ts';
import { loadGame, saveGame, hasSave } from './core/save.ts';
import { newGame } from './core/state.ts';
import { Overlay, mountTouchControls } from './ui/overlay.ts';
import { GameAudio } from './game/audio.ts';
import { setCtx, type GameCtx } from './game/ctx.ts';
import { BootScene } from './game/scenes/BootScene.ts';
import { TitleScene } from './game/scenes/TitleScene.ts';
import { FieldScene } from './game/scenes/FieldScene.ts';
import { BattleScene } from './game/scenes/BattleScene.ts';

const MUTE_KEY = 'tg.329.mute';
const VOL_KEY = 'tg.329.vol';

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* 保存できなくても遊べる */ }
}

const input = new InputManager();
const gs = newGame();
const savedVol = (() => {
  try {
    const v = JSON.parse(readStore(VOL_KEY) || '');
    if (v && typeof v.bgm === 'number' && typeof v.se === 'number') return v as { bgm: number; se: number };
  } catch { /* 初期音量 */ }
  return { bgm: gs.settings.bgm, se: gs.settings.se };
})();
if (readStore(MUTE_KEY) === '1') { gs.settings.bgm = 0; gs.settings.se = 0; }

const ctx = {
  input, gs,
  hasSave: () => hasSave(),
  persist: () => {
    ctx.gs.savedAt = new Date().toISOString();
    return saveGame(ctx.gs);
  },
  startedAt: Date.now(),
} as GameCtx;
const overlay = new Overlay(input, () => ctx.gs.settings);
const audio = new GameAudio(() => ctx.gs.settings);
ctx.overlay = overlay;
ctx.audio = audio;
setCtx(ctx);
void loadGame;

let userPaused = false;
let autoPaused = false;
let game: Phaser.Game;

function applyPause(): void {
  const on = userPaused || autoPaused;
  document.body.classList.toggle('is-paused', on);
  const loop = game?.loop as { sleep?: () => void; wake?: () => void; running?: boolean } | undefined;
  if (!loop) return;
  if (on) {
    if (loop.sleep) loop.sleep();
    else loop.running = false;
  } else if (loop.wake) loop.wake();
  else loop.running = true;
}

function paintMute(): void {
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = gs.settings.bgm === 0 && gs.settings.se === 0 ? '🔇' : '🔊';
}

function toggleMute(): void {
  const s = gs.settings;
  const muted = s.bgm === 0 && s.se === 0;
  if (muted) { s.bgm = savedVol.bgm || 0.7; s.se = savedVol.se || 0.8; }
  else {
    savedVol.bgm = s.bgm || 0.7;
    savedVol.se = s.se || 0.8;
    writeStore(VOL_KEY, JSON.stringify(savedVol));
    s.bgm = 0;
    s.se = 0;
  }
  writeStore(MUTE_KEY, s.bgm === 0 && s.se === 0 ? '1' : '0');
  audio.applyVolume();
  paintMute();
}

function togglePause(): void {
  userPaused = !userPaused;
  if (userPaused) {
    for (const a of ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'fast'] as const) input.setTouch(a, false);
  }
  applyPause();
  const btn = document.getElementById('btn-pause');
  if (btn) btn.textContent = userPaused ? '▶' : '‖';
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

mountTouchControls(input, document.getElementById('control-deck'), {
  onMute: toggleMute,
  onPause: togglePause,
  muted: () => gs.settings.bgm === 0 && gs.settings.se === 0,
  vibrate: () => { if (gs.settings.vibration && navigator.vibrate) navigator.vibrate(15); },
  tap: () => audio.se('cursor'),
});

game.events.on('step', (time: number) => {
  if (userPaused || autoPaused) return;
  input.update(time);
  overlay.tick(time);
});

document.addEventListener('visibilitychange', () => {
  autoPaused = document.hidden;
  applyPause();
});
