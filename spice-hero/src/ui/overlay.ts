/**
 * HTMLオーバーレイ: 文字が出るものはすべてここ（メッセージ・メニュー・ステータス・ふりがな）。
 * Phaser の canvas とぴったり同じ位置・サイズに重ねる。座標はすべて320×180のドット座標。
 */
import { type InputManager } from '../core/input.ts';
import { paginate, rubyToHtml, tokenize, tokensToHtml } from '../core/ruby.ts';
import { uiTheme } from '../core/data.ts';
import type { Settings } from '../core/state.ts';

export const W = 320;
export const H = 180;

export interface Rect { x: number; y: number; w: number; h: number }

const px = (n: number) => `calc(var(--px) * ${n}px)`;

type Handler = (now: number, dt: number) => void;

export class Overlay {
  readonly root: HTMLElement;
  readonly gameRoot: HTMLElement;
  private handler: Handler | null = null;
  private lastNow = 0;
  px = 4;

  constructor(readonly input: InputManager, private getSettings: () => Settings, root?: HTMLElement, gameRoot?: HTMLElement) {
    this.root = root ?? document.getElementById('ui-overlay')!;
    this.gameRoot = gameRoot ?? document.getElementById('game-root')!;
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 100));
  }

  // ───────── 拡大 ─────────

  /** 上75%のステージに 320×180 を縦横同じ倍率で収める */
  static computeScale(vw: number, vh: number, reserveBottom = 0): number {
    const s = Math.min(vw / W, (vh - reserveBottom) / H);
    return Math.max(0.5, Math.round(s * 1000) / 1000);
  }

  layout(): void {
    const stage = document.getElementById('game-stage');
    const r = stage?.getBoundingClientRect();
    const vw = r && r.width > 0 ? r.width : window.innerWidth;
    const vh = r && r.height > 0 ? r.height : window.innerHeight * 0.75;
    const portrait = window.innerHeight > window.innerWidth;
    this.px = Overlay.computeScale(vw, vh, 0);
    document.documentElement.style.setProperty('--px', String(this.px));
    const wrap = document.getElementById('screen-wrap');
    if (wrap) {
      wrap.style.width = `${this.px * W}px`;
      wrap.style.height = `${this.px * H}px`;
    }
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);
    this.applySettings();
  }

  applySettings(): void {
    document.body.classList.toggle('no-ruby', !this.getSettings().ruby);
  }

  // ───────── 毎フレーム ─────────

  tick(now: number): void {
    const dt = this.lastNow ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;
    this.handler?.(now, dt);
  }

  get busy(): boolean { return this.handler !== null; }

  /** 自分で毎フレームの処理を書きたいとき用（名前入力・ボタン設定など） */
  modal<T>(setup: (resolve: (v: T) => void) => Handler): Promise<T> { return this.run<T>(setup); }

  private run<T>(setup: (resolve: (v: T) => void) => Handler): Promise<T> {
    return new Promise<T>((resolve) => {
      const prev = this.handler;
      this.handler = setup((v) => { this.handler = prev; resolve(v); });
    });
  }

  // ───────── 部品 ─────────

  window(r: Rect, cls = '', deluxe = false): HTMLElement {
    const el = document.createElement('div');
    el.className = `window ${cls} ${deluxe ? 'deluxe' : ''}`.trim();
    this.place(el, r);
    el.insertAdjacentHTML('beforeend', '<i class="corner-tr"></i><i class="corner-bl"></i>');
    this.root.appendChild(el);
    return el;
  }

  place(el: HTMLElement, r: Rect): void {
    el.style.left = px(r.x);
    el.style.top = px(r.y);
    el.style.width = px(r.w);
    el.style.height = px(r.h);
  }

  clear(): void { this.root.innerHTML = ''; }
  remove(el: HTMLElement | null | undefined): void { el?.remove(); }

  get messageRect(): Rect { return uiTheme.layout.field.message; }

  /** メッセージを出す。決定で次のページへ。最後のページで閉じて解決する */
  message(text: string, opts: { rect?: Rect; deluxe?: boolean; keep?: boolean; el?: HTMLElement } = {}): Promise<void> {
    const rect = opts.rect ?? this.messageRect;
    const pages = paginate(text, uiTheme.font.maxCharsPerLine, uiTheme.font.maxLines);
    const win = opts.el ?? this.window(rect, 'msg', opts.deluxe);
    const body = document.createElement('div');
    body.className = 'msg-text text-line';
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = '▼';
    more.hidden = true;
    win.replaceChildren(body, more);
    return this.run<void>((resolve) => {
      let page = 0;
      let tokens = tokenize(pages[0]);
      let shown = 0;
      let acc = 0;
      const speeds = uiTheme.textSpeedMs;
      return (_now, dt) => {
        const typing = shown < tokens.length;
        if (typing) {
          const interval = this.input.isDown('fast') || this.getSettings().textSpeed === 'fast' ? speeds.fast : speeds.normal;
          acc += dt;
          while (acc >= interval && shown < tokens.length) { acc -= interval; shown++; }
          if (this.input.pressed('confirm') || this.input.pressed('cancel')) shown = tokens.length;
          body.innerHTML = tokensToHtml(tokens, shown);
          more.hidden = shown < tokens.length;
          return;
        }
        more.hidden = false;
        // 全部出したあとに、決定で次へ（押しっぱなしの早送りは fast）
        if (this.input.pressed('confirm') || this.input.pressed('cancel') || (this.input.isDown('fast') && this.input.held('fast') > 200)) {
          page++;
          if (page >= pages.length) {
            if (!opts.keep && !opts.el) win.remove();
            resolve();
            return;
          }
          tokens = tokenize(pages[page]);
          shown = 0;
          acc = 0;
        }
      };
    });
  }

  /** 自動で消える一言（場所の名前など）。入力は待たない */
  flash(text: string, ms = 2000, cls = 'area-name'): void {
    const el = document.createElement('div');
    el.className = `window ${cls}`;
    el.innerHTML = rubyToHtml(text);
    el.style.top = px(8);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /** 大きく出る文字（こうかばつぐん！） */
  pop(text: string): void {
    const el = document.createElement('div');
    el.className = 'big-pop';
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  // ───────── 選択メニュー ─────────

  choose(items: ChoiceItem[], opts: ChooseOptions): Promise<number> {
    const win = opts.el ?? this.window(opts.rect, 'menu', opts.deluxe);
    const list = document.createElement('div');
    list.className = `list${opts.cols === 2 ? ' cols-2' : ''}`;
    const rows: HTMLElement[] = items.map((it, i) => {
      const row = document.createElement('div');
      row.className = `item${it.disabled ? ' disabled' : ''}`;
      row.innerHTML = rubyToHtml(it.label) + (it.right ? `<span class="right ${it.rightClass ?? ''}">${rubyToHtml(it.right)}</span>` : '');
      list.appendChild(row);
      return row;
    });
    win.replaceChildren(list);
    win.insertAdjacentHTML('beforeend', '<i class="corner-tr"></i><i class="corner-bl"></i>');
    let sel = Math.min(Math.max(opts.start ?? 0, 0), items.length - 1);
    const cols = opts.cols ?? 1;
    return this.run<number>((resolve) => {
      const done = (v: number) => { if (!opts.keep && !opts.el) win.remove(); rows.forEach((r) => r.classList.remove('sel')); resolve(v); };
      let first = true;
      const paint = () => {
        rows.forEach((r, i) => r.classList.toggle('sel', i === sel));
        // quietStart: 直前に出したメッセージ（「かった！」など）を最初の描画で消さない
        if (first && opts.quietStart) { first = false; return; }
        first = false;
        opts.onMove?.(sel);
      };
      rows.forEach((row, i) => {
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          sel = i;
          paint();
          if (!items[i].disabled) done(i);
        });
      });
      paint();
      return () => {
        const inp = this.input;
        const move = (d: number) => { sel = (sel + d + items.length) % items.length; paint(); };
        if (cols === 2) {
          if (inp.repeat('left') || inp.repeat('right')) { const row = Math.floor(sel / 2); const c = sel % 2 === 0 ? 1 : 0; const n = row * 2 + c; if (n < items.length) { sel = n; paint(); } }
          if (inp.repeat('up')) { if (sel - 2 >= 0) { sel -= 2; paint(); } }
          if (inp.repeat('down')) { if (sel + 2 < items.length) { sel += 2; paint(); } }
        } else {
          if (inp.repeat('up')) move(-1);
          if (inp.repeat('down')) move(1);
        }
        if (inp.pressed('confirm') && !items[sel].disabled) done(sel);
        else if ((inp.pressed('cancel') || (opts.menuCancels && inp.pressed('menu'))) && opts.cancel !== false) done(-1);
      };
    });
  }

  /** はい/いいえ */
  async confirm(prompt: string, yes = 'はい', no = 'いいえ'): Promise<boolean> {
    const msg = this.window(this.messageRect, 'msg');
    msg.innerHTML = `<div class="msg-text text-line">${rubyToHtml(prompt)}</div>`;
    const r = await this.choose([{ label: yes }, { label: no }], { rect: { x: 216, y: 84, w: 96, h: 40 }, start: 0 });
    msg.remove();
    return r === 0;
  }

  // ───────── 画面の切り替え ─────────

  fade(on: boolean, ms = 400, white = false): Promise<void> {
    let el = this.root.querySelector<HTMLElement>('.fade');
    if (!el) {
      el = document.createElement('div');
      el.className = 'fade';
      this.root.appendChild(el);
    }
    el.classList.toggle('white', white);
    el.style.transition = `opacity ${ms}ms`;
    void el.offsetWidth;
    el.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }

  wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

  /** 画面に出ている内容をタイマー無しで待つ（決定で進む） */
  waitConfirm(): Promise<void> {
    return this.run<void>((resolve) => () => { if (this.input.pressed('confirm') || this.input.pressed('cancel')) resolve(); });
  }
}

export interface ChoiceItem { label: string; disabled?: boolean; right?: string; rightClass?: string; desc?: string }
export interface ChooseOptions {
  rect: Rect;
  el?: HTMLElement;
  cols?: 1 | 2;
  start?: number;
  cancel?: boolean;
  menuCancels?: boolean;
  keep?: boolean;
  deluxe?: boolean;
  /** 最初の描画では onMove を呼ばない（前のメッセージを残したいとき） */
  quietStart?: boolean;
  onMove?: (i: number) => void;
}
