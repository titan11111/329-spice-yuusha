# LEARNINGS — 329-spice-yuusha

## 2026-10-21

- `329-day101` のままでは GitHub Pages の入口が無く、操作が画面に重なっていた。
- フォルダを `329-spice-yuusha` にし、`index.html` からビルド済みのゲームを開くようにした。
- Phaser は CDN ではなく `web/vendor` に置いた。JSON の import はビルド済み JS の相対パスのまま。
- 操作は下 25% に固定し、ミュート・ポーズ・`tg.329.*` を足した。
- 自作の小さいボタン列は使いにくかった。`titans-ui/src/components/Controls/fc-ios-controller.js` を使い、配置の実測は `250-hoshimeguri-kokai-nisshi` に合わせた。A=決定、B=もどる、中央=メニュー・ミュート・ポーズ。
