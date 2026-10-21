import Phaser from 'phaser';
import { loadGame } from '../../core/save.js';
import { newGame } from '../../core/state.js';
import { rubyToHtml } from '../../core/ruby.js';
import { G } from '../ctx.js';
import { nameEntry } from '../menus.js';
import { mulberry32 } from '../art.js';
export class TitleScene extends Phaser.Scene {
    flowId = 0;
    constructor() { super('Title'); }
    create() {
        const g = G();
        g.overlay.clear();
        document.body.classList.remove('battle');
        this.drawBackdrop();
        g.audio.bgm('village');
        void this.flow(++this.flowId);
    }
    drawBackdrop() {
        const gfx = this.add.graphics();
        // 空: 日蝕の夕やみ
        const steps = 18;
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const c = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(24, 12, 40), new Phaser.Display.Color(214, 96, 52), steps - 1, i);
            gfx.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
            gfx.fillRect(0, Math.floor(t * 110), 320, Math.ceil(110 / steps) + 1);
        }
        // 星
        const rng = mulberry32(7);
        for (let i = 0; i < 40; i++) {
            gfx.fillStyle(0xfff3d6, 0.4 + rng() * 0.6);
            gfx.fillRect(Math.floor(rng() * 320), Math.floor(rng() * 70), 1, 1);
        }
        // 日蝕
        gfx.fillStyle(0xffd27a, 0.35);
        gfx.fillCircle(210, 58, 38);
        gfx.fillStyle(0xffb347, 0.5);
        gfx.fillCircle(210, 58, 30);
        gfx.fillStyle(0x08040c, 1);
        gfx.fillCircle(214, 56, 28);
        // 海
        gfx.fillStyle(0x1b3f66, 1);
        gfx.fillRect(0, 110, 320, 70);
        for (let i = 0; i < 30; i++) {
            gfx.fillStyle(i % 3 === 0 ? 0xd6a45a : 0x2f6a9e, 0.7);
            gfx.fillRect(Math.floor(rng() * 300), 112 + Math.floor(rng() * 60), 6 + Math.floor(rng() * 14), 1);
        }
        // ヤシのシルエット
        gfx.fillStyle(0x0b0710, 1);
        gfx.fillRect(40, 70, 4, 70);
        gfx.fillRect(22, 66, 24, 4);
        gfx.fillRect(42, 66, 22, 4);
        gfx.fillRect(30, 60, 26, 6);
        gfx.fillRect(18, 70, 10, 3);
        gfx.fillRect(58, 70, 10, 3);
        gfx.fillRect(272, 90, 3, 50);
        gfx.fillRect(258, 86, 18, 3);
        gfx.fillRect(274, 86, 16, 3);
        gfx.fillRect(264, 82, 20, 4);
        gfx.fillRect(0, 140, 320, 40);
    }
    async flow(id) {
        const g = G();
        const { overlay } = g;
        for (;;) {
            if (id !== this.flowId)
                return;
            overlay.clear();
            const box = document.createElement('div');
            box.className = 'title-box';
            box.style.paddingBottom = 'calc(var(--px) * 40px)';
            box.innerHTML = `<h1>${rubyToHtml('スパイスの{勇者|ゆうしゃ}')}</h1><h1>${rubyToHtml('と{日蝕|にっしょく}の{魔王|まおう}')}</h1><h2>〜 セレンディとう ぼうけんき 〜</h2>`;
            overlay.root.appendChild(box);
            const note = document.createElement('div');
            note.className = 'title-note';
            note.innerHTML = rubyToHtml('セーブは ブラウザに のこるよ。{履歴|りれき}を けすと きえるので、おうちの {人|ひと}に きいてね。\nパッドや Joy-Con を つないだら ボタンを おしてね。');
            overlay.root.appendChild(note);
            const has = g.hasSave();
            const pick = await overlay.choose([{ label: 'はじめから' }, { label: 'つづきから', disabled: !has }], { rect: { x: 112, y: 112, w: 96, h: 40 }, cancel: false, start: has ? 1 : 0 });
            g.audio.se('confirm');
            if (pick === 1) {
                const loaded = loadGame();
                if (!loaded) {
                    await overlay.message('きろくを よみこめなかったよ。');
                    continue;
                }
                g.gs = loaded;
                await this.begin(false);
                return;
            }
            if (has && !(await overlay.confirm('いままでの きろくは のこるよ。\nはじめから はじめる？')))
                continue;
            const gs = newGame();
            g.gs = gs;
            overlay.clear();
            const name = await nameEntry(g, 'ゆうしゃ');
            gs.party[0].name = name;
            await this.begin(true);
            return;
        }
    }
    async begin(isNew) {
        const g = G();
        await g.overlay.fade(true, 500);
        g.overlay.clear();
        this.scene.start('Field', { intro: isNew });
    }
}
