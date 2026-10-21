import Phaser from 'phaser';
import { enemyList } from "../../core/data.js";
import { LOOKS, TILES, canvas, drawBattleBack, drawChest, drawEnemy, drawPearl, drawPerson, mulberry32, hashStr, } from "../art.js";
const DIRS = ['down', 'up', 'left', 'right'];
const BGS = ['beach', 'jungle', 'cave', 'sea', 'highland', 'palace', 'castle', 'ship_storm'];
/** 絵（タイル・キャラ・敵・背景）をコードで作って Phaser のテクスチャに登録する */
export class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
        const add = (key, c) => { if (!this.textures.exists(key))
            this.textures.addCanvas(key, c); };
        for (const [name, fn] of Object.entries(TILES)) {
            const [c, ctx] = canvas(16, 16);
            fn(ctx, mulberry32(hashStr(name)));
            add(`t_${name}`, c);
        }
        for (const [id, look] of Object.entries(LOOKS)) {
            for (const d of DIRS)
                for (let f = 0; f < 3; f++) {
                    const [c, ctx] = canvas(16, 24);
                    drawPerson(ctx, look, d, f);
                    add(`p_${id}_${d}_${f}`, c);
                }
        }
        for (const d of DIRS)
            for (let f = 0; f < 3; f++) {
                const [c, ctx] = canvas(16, 24);
                drawPearl(ctx, d, f);
                add(`p_pearl_${d}_${f}`, c);
            }
        for (const kind of ['normal', 'red'])
            for (const open of [false, true]) {
                const [c, ctx] = canvas(16, 16);
                drawChest(ctx, kind, open);
                add(`chest_${kind}_${open ? 'open' : 'closed'}`, c);
            }
        for (const e of enemyList) {
            const [c, ctx] = canvas(e.size, e.size);
            drawEnemy(ctx, { id: e.id, size: e.size, area: e.area, tag: e.tag, boss: !e.area });
            add(`e_${e.id}`, c);
        }
        for (const bg of BGS) {
            const [c, ctx] = canvas(320, 120);
            drawBattleBack(ctx, bg);
            add(`bb_${bg}`, c);
        }
        // 小さな丸い影
        {
            const [c, ctx] = canvas(16, 8);
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.beginPath();
            ctx.ellipse(8, 4, 7, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            add('shadow', c);
        }
        {
            const [c, ctx] = canvas(2, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, 2, 2);
            add('white', c);
        }
        this.scene.start('Title');
    }
}
