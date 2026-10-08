/**
 * 服务入口：Electron 主进程内启动本地数据层。
 * 绑定 127.0.0.1 随机端口，启动成功把端口写入项目根 .hg-port。
 * fe 接线：import { startServer } from './server'; const port = await startServer({ dbPath });
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UpstreamClient, type UpstreamClientOptions } from '../upstream';
import { LocalStore } from '../store';
import { createRequestHandler } from './app';

export interface StartServerOptions {
  /** 默认 ~/.hongguo-desktop/hongguo.db；Electron 下建议传 app.getPath('userData')/hongguo.db */
  dbPath?: string;
  /** 默认 <process.cwd()>/.hg-port（项目根） */
  portFile?: string;
  host?: string;
  /** 测试可注入自定义 upstream（默认真实客户端） */
  upstream?: UpstreamClient;
  upstreamOptions?: UpstreamClientOptions;
}

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

export async function startServer(opts: StartServerOptions = {}): Promise<number> {
  const server = await startServerHandle(opts);
  return server.port;
}

export async function startServerHandle(opts: StartServerOptions = {}): Promise<RunningServer> {
  const host = opts.host ?? '127.0.0.1';
  const dbPath = opts.dbPath ?? path.join(os.homedir(), '.hongguo-desktop', 'hongguo.db');
  const portFile = opts.portFile ?? path.resolve(process.cwd(), '.hg-port');

  const store = new LocalStore(dbPath);
  const upstream = opts.upstream ?? new UpstreamClient(opts.upstreamOptions);
  const handler = createRequestHandler({ upstream, store });

  const server = http.createServer((req, res) => {
    handler(req, res).catch((e) => {
      // 兜底：handler 内部已捕获业务异常，这里只防流式异常
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ code: 502, msg: `internal: ${(e as Error).message}`, data: null }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });

  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('server address unavailable');
  }
  const port = addr.port;
  fs.writeFileSync(portFile, String(port), 'utf-8');

  return {
    port,
    close: () =>
      // 关闭顺序逆依赖方向（A02-E03）：先停 server 等在途连接排空，再关 store，
      // 避免在途请求处理器拿到已关闭的 db 句柄。
      new Promise<void>((resolve) => {
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}

export { createRequestHandler } from './app';
export type { ServerDeps } from './app';

// fe 接线别名：主进程 index.ts 约定调用 startDataLayer()（口径见 src/main/index.ts 注释）
export { startServer as startDataLayer };
