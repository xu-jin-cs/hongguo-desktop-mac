import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { startDataLayer } from './server';

/**
 * hongguo-desktop 主进程（T-001 最小窗口引导）
 * 职责：创建 1280×800（min 1100×700）单窗口 + 加载渲染层 + 向渲染层注入本地数据层端口。
 *
 * 数据层接线（审查 P0 修复）：静态 import startDataLayer，electron-vite 打包时
 * server/upstream/store 模块链一并进入 out/main（better-sqlite3 原生模块经
 * externalizeDepsPlugin 保持外部依赖，运行时 require，ABI 由 electron-rebuild 重建）。
 * 禁止改回运行时动态 require——动态探测路径在打包产物中不存在，数据层将永不启动。
 */

/**
 * 读取 .hg-port 端口文件（be 数据层启动后写入）。
 * 查找位置：userData 目录与项目根（dev）；读不到/非法 → 0。
 */
function readPortFile(): number {
  const candidates = [
    path.join(app.getPath('userData'), '.hg-port'),
    path.join(app.getAppPath(), '.hg-port'),
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      const port = Number.parseInt(raw, 10);
      if (Number.isFinite(port) && port > 0 && port < 65536) return port;
    } catch {
      /* 文件不存在或不可读：继续下一个候选 */
    }
  }
  return 0;
}

async function resolveDataLayerPort(): Promise<number> {
  // 路径一（主路径）：主进程内拉起本地数据层（静态打包进 out/main，端口注入渲染层）
  try {
    const port = await startDataLayer({
      dbPath: path.join(app.getPath('userData'), 'hongguo.db'),
      // dev 写项目根 .hg-port（便于外部冒烟脚本/人工核查）；打包后 app 包内只读，改写 userData
      portFile: app.isPackaged
        ? path.join(app.getPath('userData'), '.hg-port')
        : path.join(app.getAppPath(), '.hg-port'),
    });
    if (typeof port === 'number' && port > 0) {
      console.log(`[main] data layer listening on 127.0.0.1:${port}`);
      return port;
    }
  } catch (err) {
    console.warn('[main] data layer start failed, trying .hg-port file:', err);
  }
  // 路径二（兜底）：读取数据层已写下的 .hg-port 端口文件；读不到则注入 0（渲染层回落 mock）
  return readPortFile();
}

async function createWindow(): Promise<void> {
  const port = await resolveDataLayerPort();
  console.log(`[main] injecting window.__HG_PORT__=${port}`);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: '红果短剧',
    backgroundColor: '#0C0E12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 竖屏短剧自动起播（失败时播放器回落暂停态，由用户点击起播）
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [`--hg-port=${port}`],
    },
  });

  win.once('ready-to-show', () => win.show());

  // 单窗口约束（交互稿 §2）：禁止新开窗口/Tab
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer', 'index.html'));
  }
}

void app.whenReady().then(() => {
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
