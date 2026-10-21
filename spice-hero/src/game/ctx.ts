import type { InputManager } from '../core/input.ts';
import type { GameState } from '../core/state.ts';
import type { Overlay } from '../ui/overlay.ts';
import type { GameAudio } from './audio.ts';

/** シーン間で共有するもの（Phaser のシーンは作り直されるので、状態はここに置く） */
export interface GameCtx {
  input: InputManager;
  overlay: Overlay;
  audio: GameAudio;
  gs: GameState;
  hasSave(): boolean;
  /** セーブする。成功したら true */
  persist(): boolean;
  /** 遊んだ時間を数えるための起動時刻 */
  startedAt: number;
  /** ミュートの切り替え（操作盤ではなく せってい から呼ぶ） */
  toggleMute(): void;
  /** いま消音か */
  isMuted(): boolean;
  /** ポーズに入る。解除は ポーズ画面のタップ / Esc / P */
  pause(): void;
}

let ctx: GameCtx | null = null;
export function setCtx(c: GameCtx): void { ctx = c; }
export function G(): GameCtx {
  if (!ctx) throw new Error('GameCtx が初期化されていません');
  return ctx;
}
