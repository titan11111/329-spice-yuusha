import { defineConfig } from 'vite';

// GitHub Pages で https://<user>.github.io/spice-hero/ に公開する場合は base を下記のままに。
// ルート公開（独自ドメインなど）なら '/' にする。
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
