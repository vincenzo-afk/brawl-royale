import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));


export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      'battle-royale-shared': resolve(__dirname, '../shared/index.js'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        manualChunks: {
          vendor: ['socket.io-client', 'howler'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: process.env.VITE_SERVER_URL || 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL || 'http://localhost:3001'),
  },
});
