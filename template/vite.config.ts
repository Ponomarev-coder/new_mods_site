import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/uploads/screenshots/': { target: 'http://127.0.0.1', rewrite: path => '/modsKIK.ru' + path },
      '/kikcustom/': { target: 'http://127.0.0.1:8091' },
      '/messenger-api/': { target: 'http://127.0.0.1:8090', rewrite: (path) => path.replace(/^\/messenger-api/, '') },
      '/messenger-ws': { target: 'ws://127.0.0.1:8090', ws: true, rewrite: () => '/ws' },
    },
  },
});
