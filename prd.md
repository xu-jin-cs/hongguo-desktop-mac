# 《总需求PRD》hongguo-desktop · 红果短剧桌面版 v1.0

> 方向（停点1 用户已确认 2026-10-06）：方案B 自建全功能客户端；macOS 优先（Windows 打包配置预留）；MVP 含搜索 + 本地收藏/历史。
> 合规边界：仅个人本地使用，不分发；不绕过任何付费机制（红果为免费模式）；不 Hook/修改官方 App；数据接口仅限读取公开正片与元数据。

## 1 业务概述
将红果短剧的看剧体验搬到 macOS 桌面：自建 Electron 客户端，本地数据层直连官方公开数据接口获取剧集元数据与正片播放地址，UI 全量自建对齐 App 信息架构。**不接入了任何广告 SDK / 广告接口 / 激励解锁逻辑——广告在架构上不存在**（区别于"拦截广告"的补丁式方案）。

### 1.1 目标（KANO+ROI）
| 需求 | KANO | ROI | 优先级 |
|---|---|---|---|
| 首页推荐浏览 | 基本型 | 高 | P0 |
| 分类（真人剧/漫剧/AI剧/漫画）+ 排行榜 | 基本型 | 高 | P0 |
| 剧集详情 + 全集选集 | 基本型 | 高 | P0 |
| 竖屏播放器（HLS，连续播放/选集切换/倍速/进度记忆） | 基本型 | 高 | P0 |
| 架构级零广告 | 兴奋型 | 高 | P0 |
| 搜索（官方网页版没有，本端补齐） | 期望型 | 中 | P1 |
| 本地收藏 + 观看历史（纯本地） | 期望型 | 中 | P1 |
| 设置（清晰度偏好/倍速记忆/老板键） | 兴奋型 | 低 | P2 |
| Windows 打包 | 期望型 | 低 | P2 |

## 2 用户角色与使用场景
- 单角色：本地个人用户，无账号体系、无登录、无同步。
- 场景：打开应用 → 首页/分类/排行/搜索找剧 → 详情页选集 → 竖屏播放 → 下次打开从进度记忆续播。

## 3 功能主流程
1. 启动 → 主进程起本地数据层 → 渲染进程加载首页（推荐 feed）。
2. 浏览：首页 / 分类tab / 排行tab / 搜索页，点击卡片 → 详情页。
3. 详情页：元数据（封面/热度/评分/简介）+ 全集选集栅格 → 点集数 → 播放页。
4. 播放页：竖屏 9:16 播放器，HLS 流，上/下集切换，倍速，进度条，退出自动记录进度。
5. 历史/收藏页：本地列表，可从历史一键续播。

## 4 项目结构（六要素之项目结构）
```
hongguo-desktop/
├── package.json / electron.vite.config.ts
├── src/main/            # Electron 主进程：窗口、本地数据层 HTTP 服务(127.0.0.1 随机端口)、数据请求
│   ├── server/          # 本地 API：/api/home /api/category /api/rank /api/search /api/series /api/play
│   ├── upstream/        # 官方数据接口适配层（签名/headers/重试/缓存）
│   └── store/           # better-sqlite3：favorites / history / settings
├── src/renderer/        # React + TS：页面与组件
│   ├── pages/           # Home / Category / Rank / Search / Detail / Player / Library
│   └── components/      # VideoCard / EpisodeGrid / PlayerCore(hls.js) ...
└── test/                # vitest 单测 + playwright 冒烟
```
技术栈：Electron + electron-vite + React 18 + TypeScript + hls.js + better-sqlite3。代码风格：ESLint+Prettier，函数式组件，严格 TS。

## 5 本地接口设计（渲染进程 ↔ 本地数据层；入参/出参/枚举/异常码）
统一约定：`GET http://127.0.0.1:<port>/api/*`；响应包 `{code:0|400|404|502|504, msg:string, data:any}`；`code=0` 成功；502=上游接口异常；504=上游超时（默认 8s，重试 1 次）；分页统一 `page`(从1) + `size`(默认20，max 50)。

| 接口 | 入参 | 出参 data |
|---|---|---|
| /api/home | page,size | `{list:[{series_id,title,cover,hot,score,total_episodes,latest_episode}],has_more}` |
| /api/category | type∈{real,comic,ai,manga},page,size | 同上 |
| /api/rank | board∈{hot,new,real,comic},size≤50 | `{list:[同上+rank]}` |
| /api/search | q(1-50字,必填),page,size | `{list:[同上],has_more}` |
| /api/series | series_id(必填) | `{series_id,title,cover,desc,hot,score,total_episodes,episodes:[{ep,seq,title,duration}]}` |
| /api/play | series_id,ep(≥1,≤total_episodes) | `{play_url(hls),duration,next_ep,prev_ep}` |
| /api/favorites | GET 列表 / POST {series_id} / DELETE {series_id} | `{list:[...]}` |
| /api/history | GET 列表 / POST {series_id,ep,progress_sec} / DELETE {series_id} | `{list:[{series_id,title,cover,ep,progress_sec,updated_at}]}` |

异常兜底：上游 502/504 → 页面级错误态（重试按钮）；搜索 q 为空/超长 → 400 + 前端拦截；ep 越界 → 400；播放地址为空 → 详情页该集置灰标「暂不可播」。

## 6 数据库字段定义（better-sqlite3，本地）
- `favorites(series_id TEXT PK, title, cover, total_episodes INT, created_at INT)`
- `history(series_id TEXT PK, title, cover, ep INT, progress_sec INT DEFAULT 0, updated_at INT)`；索引 `idx_history_updated(updated_at DESC)`
- `settings(key TEXT PK, value TEXT)`（清晰度偏好/倍速/端口等）

## 7 分支逻辑 & 异常兜底
- 上游接口字段变更 → 适配层 zod 校验失败记日志并返回 502，不渲染脏数据。
- 无网 → 首页/搜索显示离线态，历史/收藏页可用（纯本地）。
- 播放失败 → 自动重试 1 次 → 仍失败提示「该片源暂不可用」并可切集。
- 进度记忆：播放中每 5s 落库一次，退出落库；progress_sec ≥ duration*0.95 视为看完，下次进入自动定位下一集。

## 8 兼容拓展设计
- upstream 适配层为独立目录+接口签名配置化，上游改版只动该层。
- 预留 Windows 打包（electron-builder win target 配置预留，不在本期验证范围）。
- 预留「下载」扩展点（本期不实现）。

## 9 测试策略（六要素之测试策略）
> **v1.1 变更（2026-10-06 用户裁定）**：三路测试收敛为**仅白盒测试一路**，且为**前后端整合白盒**——通过触发前端按钮/交互驱动后端逻辑执行，验证白盒测试的分支覆盖能力。接口路、纯 UI 路取消。执行时点=前后端整合完成后（pm_quality_gate/test_lead_full 阶段），设计阶段只产出用例设计。
- 单测：upstream 适配层解析/重试/异常码映射；历史/收藏 store。
- 整合白盒：每个用例 = 前端交互触发（点击按钮/提交表单/路由切换）→ 后端分支断言（覆盖判定：source_node/source_branch 实际命中）。分支覆盖目标：关键模块（upstream 适配/本地服务路由/store 读写）分支覆盖 ≥80%。
- 冒烟（P0 5-8 条，同样走整合白盒形态）：启动出首页；搜索提交触发 /api/search；详情选集触发 /api/series；播放触发 /api/play 起播；收藏增删触发 favorites 写；历史续播触发 history 读。
- 验收标准示例（P0 可测试）：① 首页首屏 ≤3s 出卡片（本地数据层缓存命中 ≤500ms）；② 任一 P0 页面无广告元素/广告请求（网络面板零广告域名）；③ 选集切换成功率 100%（冒烟集合内）；④ 退出重进后续播进度误差 ≤5s。
- 播放完整性硬验收（v1.2 用户裁定 2026-10-06）：⑤ 播放有声音（audio track 存在且音量非 0）⑥ 有画面（video 帧渲染，非黑屏）⑦ 有字幕（上游为烧录内嵌字幕，画面可见字幕条带即算通过；无独立字幕轨可接）⑧ 支持横竖屏播放（播放器可切换 9:16 竖屏与 16:9 横屏全屏两种模式，切换不中断播放）。

## 9.1 版本记录
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-06 | 初版（sv APPROVED） |
| v1.1 | 2026-10-06 | 用户裁定：三路测试→仅整合白盒（前端触发后端，验证分支覆盖） |

## 10 边界约定（六要素之边界约定）
- 不做：账号/登录/同步、评论/剧评发布、金币/任务体系、下载、投屏、Windows 实机验证。
- 不做任何广告相关代码（无拦截规则、无广告接口——广告路径不存在）。
- 不分发安装包给第三方；README 注明个人学习用途。
- 合规自限（A07-E13）：upstream 层强制请求节流（单接口 ≥300ms 间隔）+ 首页/详情元数据内存缓存（TTL 10min），不给官方服务造成压力；不采集、不外发任何本地用户数据。
- 架构边界（A04-E05）：数据层三域分离——upstream 适配域 / 本地存储域 / 本地服务暴露域；**渲染进程禁止直连上游接口**，一切数据只能经本地服务层。
- 契约纪律（A02-E01）：本地 9 接口以 dpm 节点产出的 api_contract.json 为唯一基线，先定契约再实现，后续变更契约先行。
- 命令（六要素之命令）：`pnpm dev` 开发、`pnpm build` 构建、`pnpm test` 单测、`pnpm smoke` 冒烟、`pnpm dist:mac` 出包。
