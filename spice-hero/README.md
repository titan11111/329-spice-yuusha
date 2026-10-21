# スパイスの勇者と日蝕の魔王
子どもが初めて遊ぶ30分RPG。Phaser 4 + TypeScript。

## 遊ぶ（npm なし）
`./scripts/serve.sh` → http://localhost:8765/play.html （Phaser は CDN から読み込み）

## 開発（npm）
`npm install && npm run dev` / `npm test` / `npm run build`
`npm run build:web` で web/build を作り直す。

## いまの範囲（縦切り）
タイトル → 名前入力 → 勇者の家 → 浜辺の村 → フィールド（ランダムエンカウント）→ 戦闘 → 宿屋でセーブ。
絵はコード生成の仮絵（差し替え前提）。
