import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-vite 三端构建配置：
// - main:    src/main/index.ts    -> out/main/index.js   (CJS)
// - preload: src/preload/index.ts -> out/preload/index.js (CJS)
// - renderer: src/renderer/       -> out/renderer/       (Vite + React)
// main/preload 必须 externalizeDepsPlugin：better-sqlite3 是原生模块（bindings 动态加载 .node），
// 保持 package.json dependencies 为运行时外部 require，随应用安装并由 electron-rebuild 重建 ABI；
// 项目自有源码（server/upstream/store）不受 external 影响，仍被打包进 out/main。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
