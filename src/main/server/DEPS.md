# DEPS.md — backend (T-002/T-003/T-004) 新增依赖登记

> 并行约定：be 分身禁止改 package.json。以下依赖由 fe/ops 收口时合并进 package.json 并执行 pnpm install。
> 开发期我已将同名包手工放入 node_modules/（node_modules 已被 .gitignore，纯本地自测用途，不入库）。

## dependencies
| 包 | 版本（自测实测） | 用途 |
|---|---|---|
| zod | ^3.25.76 | upstream 响应结构校验（校验失败 → 502，不落脏数据） |
| better-sqlite3 | ^12.11.1 | 本地存储 favorites/history/settings 三表 |

## devDependencies
| 包 | 版本 | 用途 |
|---|---|---|
| @types/better-sqlite3 | ^7.6.13 | better-sqlite3 类型（安装后请删除 src/main/store/better-sqlite3.d.ts 这个临时手写声明，避免重复声明冲突） |

## 安装后必做（Electron 原生模块）
better-sqlite3 是原生模块，Electron ABI 与 Node 不同，打包/运行前必须重建：
```bash
pnpm add better-sqlite3 zod
pnpm add -D @types/better-sqlite3
# 二选一：
npx electron-rebuild -f -w better-sqlite3
# 或在 electron-builder 配置中开启 install-app-deps（electron-builder 默认会自动重建）
```

## 运行接线约定（fe 收口）
- `import { startServer } from './server'`（src/main/server/index.ts）
- `startServer(options?) => Promise<number>` 返回监听端口，并把端口写入 `.hg-port`（默认 `process.cwd()/.hg-port`，即项目根）。
- options: `{ dbPath?: string; portFile?: string; host?: string }`
  - 建议 fe 传入 `dbPath = path.join(app.getPath('userData'), 'hongguo.db')`；默认回退 `~/.hongguo-desktop/hongguo.db`。
- 服务只绑定 `127.0.0.1`，随机端口（port=0）。

## 技术栈偏离说明（已知情决策，非静默）
backend-engineer 技能固定栈写的是 Express；本项目本地数据层只有 9 个端点、跑在 Electron 主进程内，
为把新增依赖压缩到最小（仅 zod + better-sqlite3，均为 PRD 点名），HTTP 服务用 Node 内置 `node:http` 实现，
路由/参数校验/统一响应包均自研并经 vitest 正反边界覆盖。PRD §4 技术栈未要求 Express。
