import { defineConfig } from 'vite';

// NFR-12: base 使用相对路径，dist/ 可被任意静态服务器托管
// 使用 .mjs 而非 .ts：纯 ESM 配置可被 Node 原生导入，Vite 无需再经 esbuild 转译
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
