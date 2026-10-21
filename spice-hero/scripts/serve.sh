#!/bin/sh
# npm なしで遊ぶ: ビルド済みの web/ をローカルサーバで開く（Phaser は CDN から読む）
cd "$(dirname "$0")/../web" && echo "→ http://localhost:8765/play.html" && python3 -m http.server 8765
