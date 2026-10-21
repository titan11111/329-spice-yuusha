# LEARNINGS — 329-spice-yuusha

## 2026-10-21

- `329-day101` のままでは GitHub Pages の入口が無く、操作が画面に重なっていた。
- フォルダを `329-spice-yuusha` にし、`index.html` からビルド済みのゲームを開くようにした。
- Phaser は CDN ではなく `web/vendor` に置いた。JSON の import はビルド済み JS の相対パスのまま。
- 操作は下 25% に固定し、ミュート・ポーズ・`tg.329.*` を足した。
- 自作の小さいボタン列は使いにくかった。`titans-ui/src/components/Controls/fc-ios-controller.js` を使い、配置の実測は `250-hoshimeguri-kokai-nisshi` に合わせた。A=決定、B=もどる、中央=メニュー・ミュート・ポーズ。

## 2026-10-21（2回目）

### 戦闘画面の文字が見切れていた

窓の大きさを目分量で決めていたのが原因。WebKit で実際に `clientHeight` / `scrollHeight` を測ったら、
ゲーム内ドット単位で次のはみ出しが出ていた。

| 窓 | 内側 | 中身 | はみ出し |
|---|---|---|---|
| 戦闘ステータス | 40.2 | 49.2 | 縦 +9.0（3人目の行が丸ごと消える） |
| 名前欄 `.nm` | 枠 30.4 | 「ゆうしゃ」36.1 | 横 +5.7 |
| 戦闘コマンド | — | — | 横 +23.8（「たたかう」が2列に入らない） |
| フィールドメッセージ（ふりがな3行） | 59.9 | 70.5 | 縦 +10.6 |

直した内容:

- `ui_theme.json`: ステータス h 44→54、コマンド 104×52→140×54、戦闘メッセージ 204×52→168×54（x も 112→148）、フィールドメッセージ 304×64→304×74（y 112→104）
- `style.css`: 行の高さ 18→16、窓の余白 6/8/4→4/8/3、ふりがな 6→5、`.nm` 30→38、ステータス窓だけ左右の余白 8→5
- 戦闘メッセージは窓を広げる余地が無い（下端 178 まで）ので `.battle-msg` で字を 10px に落とした。実際に出る最長は「ゆうしゃは シナモンのにおいぶくろを つかった！」の24文字

**ふりがなは行の高さを押し広げる。** `rt` は 6px なのに行の余白は (18-12)/2=3px しか無く、1行あたり約3px ずつ背が伸びていた。
`body.no-ruby` は `visibility:hidden` なので、ふりがなを切っても高さは縮まない。窓はふりがな込みで設計する。

計測はスクリーンショットの目視ではなく `clientHeight`/`scrollHeight` を読む。はみ出しが数値で出る。
空の窓でも枠の丸めで +0.8〜1.7 は出るので、そこが合格の下限。

### ミュートとポーズを操作盤からメニューへ移した

タイタン指示。下段のボタンは 十字キー / メニュー / B / A の4つだけになった。

- ミュート → メニュー →「せってい」→「おとを けす」（`tg.329.mute` / `tg.329.vol` はそのまま）
- ポーズ → メニュー →「ポーズ」。**解除は ポーズ画面のタップか キーボードの P**
- ポーズ画面に `pointer-events: auto` を付けないと解除できなくなる。操作盤からボタンを外すときは「戻り道」を先に作る
- Esc はメニューの「キャンセル」と重なるのでポーズに割り当てない

**ポーズ中は `input.update()` が止まるので `touchPulse` が溜まり、解除した瞬間に1回ぶん暴発していた。**
`InputManager.clearTouch()` を足して、ポーズの出入りで `touch` と `touchPulse` の両方を捨てる。

### ワールドを王都まで広げた

`world` の東をふさいでいた岩に切れ目を作り、`world_east`（ひがしの かいどう）→ `town_capital`（みなとの おうと）→ `castle_capital`（おうじょう）を実装。
やどや `inn_capital_in` と `house_capital` も付けた。

既にデータ側（`shops.json` の `inn_capital`、`chests.json` の `chest_capital_01/02`、`art.ts` の `marble`/`castle_rock`/`tea` タイルと `guard`/`king`/`merchant` の立ち絵）が用意されていた。
**新しい地方を足すときは、先に `data/` と `art.ts` に何が揃っているか見る。** 絵もデータも書かずに済む。

つなぎ方の鉄則: **出口タイルと到着タイルを重ねない。** 重ねると入った瞬間に跳ね返って無限ループする。
`tests/maps.test.ts` に「重なり」「往復できるか」「はまむらから全マップへ歩いて行けるか」の3つを機械チェックとして足した。

NPC が会話でフラグを立てられるよう `NpcDef.setsFlag` を追加（王さま → `f_royal_order`）。
それまでは `FieldScene` に `n_mother` が直書きされていた。

### ビルドまわりで踏んだもの

- `npm run build:web` が `data/*.json` をコピーしていなかった。`web/build/data/` が古いまま公開されうる状態だったので、コピーをスクリプトに足した
- `package.json` の `phaser: latest` を `npm install` すると、`scripts/phaser-shim.d.ts` ではなく本物の型を拾ってビルドが落ちる。`tsconfig.web.json` の `paths` で shim に固定した（`baseUrl` は最近の tsc で廃止。`paths` だけ書く）

### 残っているコントローラの課題（未着手・タイタン判断待ち）

1. 十字キーの縦棒の端を触ると横に歩く。`calcDpad` のしきい値（幅の17%＝16〜22px）に対し縦棒の半幅が17〜23px で、`main.ts` が横を優先するため
2. 十字キーをなぞる間ずっと `navigator.vibrate(8)` が鳴る
3. パッド切断時のポーズ（`input.json` の `disconnect.pause`）が未実装。`InputManager.disconnected` を読む場所が無い
4. `overlay.ts` の `mountTouchControls()` が約90行まるごと死蔵。呼び出し元ゼロだが、冒頭で `#control-deck` を `replaceChildren()` するので呼ばれた瞬間に操作盤が消える
5. 共有部品 `fc-ios-controller.js` の既定マップに `"fc-btn-select": ["KeyShift"]`。`KeyboardEvent.code` に存在しない値（正は `ShiftLeft`/`ShiftRight`）。329 は上書き済みなので実害なし
6. 320×180 の画面を縦持ち端末に収めるため、上75%の中でさらに上下へ黒帯が出る（占有率はハーネス基準では100%だが、見た目は画面の約35%）
