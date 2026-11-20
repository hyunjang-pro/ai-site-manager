import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 로 두면 Vercel 루트든 GitHub Pages 하위 경로든 그대로 배포된다.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
