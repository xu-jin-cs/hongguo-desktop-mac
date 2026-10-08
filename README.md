# hongguo-desktop · 红果短剧桌面版 v1.0

> 个人本地学习用途，不分发。架构级零广告：无任何广告 SDK / 广告域名 / 追踪脚本；渲染层不直连上游站点，全部数据经本地数据层中转。

技术栈：Electron + electron-vite + React 18 + TypeScript + hls.js + better-sqlite3（本地数据层已真实接线，随主进程打包）。

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发模式起窗口（HMR）；启动后主进程拉起本地数据层并把端口写入项目根 `.hg-port` |
| `pnpm build` | 构建到 out/（server/upstream/store 一并打入 out/main） |
| `pnpm typecheck` | TS 严格类型检查 |
| `pnpm test` | vitest 单测（pretest 自动执行 ensure-test-native.mjs 对齐 better-sqlite3 ABI） |
| `pnpm lint` | ESLint |
| `pnpm smoke` | 冒烟脚本（读取 .hg-port） |
| `pnpm rebuild:electron` | electron-rebuild 重建 better-sqlite3 原生 ABI |
| `pnpm dist:mac` | electron-builder macOS 出包（T-010） |

## 架构

```
src/main/     Electron 主进程：index.ts = 窗口引导（1280×800 / min 1100×700）+ 拉起本地数据层
  server/     本地数据层 HTTP 服务（127.0.0.1 随机端口，/api/*，node:http 自研路由）
  upstream/   官方数据接口适配层（zod 响应校验 + 节流 + 缓存；实测上游为渐进式 MP4 直链）
  store/      better-sqlite3：favorites / history / settings 三表
src/preload/  注入 window.__HG_PORT__（本地数据层端口；0 = 未就绪）
src/renderer/ React + TS 渲染层（7 页 + dataSource 适配层）
test/         vitest 单测 + 冒烟
```

## 数据层接线（已落地）

1. **静态接线**：`src/main/index.ts` 静态 `import { startDataLayer } from './server'`，
   electron-vite 打包时 server/upstream/store 模块链一并进入 `out/main`；
   better-sqlite3 原生模块经 `externalizeDepsPlugin` 保持外部 require，运行时加载（ABI 由 electron-rebuild 重建）。
   主进程启动日志 `[main] data layer listening on 127.0.0.1:<port>` + `[main] injecting window.__HG_PORT__=<port>`。
2. **端口文件兜底**：数据层启动成功写入 `.hg-port`（dev 写项目根，打包后写 userData）；
   主路径失败时主进程回读该文件；读不到则注入 0，渲染层回落 mock。
3. **接口契约**：`api_contract.json` 为唯一基线（9 端点，统一响应包 `{code,msg,data}`）。
4. **渲染层数据访问**：只允许经 `src/renderer/src/api/dataSource.ts`，禁止散落 fetch。
5. **写操作元数据**：`addFavorite`/`postHistory` 调用方必须携带 `title`/`cover`（+`total_episodes`），
   store 落库依赖渲染层传入；缺失会导致收藏卡片/历史行无封面无标题。

## 数据源切换（mock 适配开关）

- `window.__HG_PORT__ > 0` 且探活成功 → 真实本地数据层。
- **仅网络层失败才回落 mock**：端口为 0、fetch 抛异常（连接拒绝/超时中止）。
- **探活只看网络可达性**：拿到任意 HTTP 响应即视为可达。502/504 属"服务可达、上游故障"，
  按契约抛 `ApiError` 让页面进 ERROR 态 + 重试，**不会**误判不可达、**不会**静默回落 mock。
- 不可达判定带 30s TTL，到期自动重探测，数据层恢复后可切回真实服务。
- mock 数据形态严格按 api_contract.json；收藏/历史落 localStorage；play_url 双形态
  （偶数编号剧集 MP4 直链样本=生产主路径，奇数 HLS 测试流），两条播放分支都被自测覆盖。
- 切换对页面完全透明，页面不感知数据来源。

## vitest 双轨 ABI 说明

better-sqlite3 是原生模块：运行走 Electron ABI（`pnpm rebuild:electron` 重建），单测走 Node ABI。
`pretest` 钩子执行 `scripts/ensure-test-native.mjs`，把测试用 Node ABI 构建产物放入 `test/vendor-node/`，
vitest 配置 alias 将测试进程内的 `better-sqlite3` 指向该目录，与 Electron 产物互不污染。
