# 详细交互设计文档 · hongguo-desktop v1.0

## 0 术语表
| 术语 | 定义 |
|---|---|
| 剧集/series | 一部短剧，唯一标识 series_id（字符串） |
| 集/ep | 剧集的第 N 集，整数，1 ≤ ep ≤ total_episodes |
| 本地数据层 | Electron 主进程内 127.0.0.1 HTTP 服务，渲染进程唯一数据来源 |
| upstream | 官方公开数据接口（只读正片+元数据，不含广告接口） |
| 卡片 | 剧集封面+标题+热度/评分的栅格项 |
| 选集栅格 | 详情页 1..total_episodes 的集数按钮矩阵 |
| 进度记忆 | history 表 (series_id,ep,progress_sec) 的自动落库与续播 |

## 1 功能总览
7 页：Home（推荐）/ Category（四类）/ Rank（四榜）/ Search / Detail / Player / Library（收藏+历史）。窗口固定骨架：左侧导航栏(200px) + 右侧内容区。目标应用类型：macOS 桌面客户端（Electron）。

## 2 流程图
```
启动 → Home(推荐feed)
 ├─ 侧栏: Home/Category/Rank/Search/Library 互斥单选高亮
 ├─ 卡片点击 → Detail(series_id) → 选集(ep) → Player(series_id,ep)
 ├─ Search 提交q → 结果栅格 → Detail
 ├─ Library: 收藏列表/历史列表 → 点击 → Detail(历史带 ep+progress 续播)
 └─ Player: 退出 → 返回来源页（进度已落库）
```
跳转硬约束：单窗口单路由，禁止新开 Tab/窗口；详情/播放为路由内切换。

## 3 页面布局（px，左上原点，窗口 1280×800，min 1100×700）
- 全局：侧栏 x0 y0 w200 h100%；内容区 x200 y0 w1080（min 900）；内容区内边距 24。
- 卡片栅格：内容区 grid，列宽 168，间距 16，行高自适应（封面 168×224 + 标题 2 行 + 元信息 1 行）。
- Home：顶部搜索框占位入口（点击跳 Search）h40；其下推荐栅格，滚动分页。
- Category：顶部 tab 条（真人剧/漫剧/AI剧/漫画）h44，tab 项 w96 间距 8。
- Rank：顶部榜选择（热度/新剧/真人/漫剧）h44；列表式排名行 h88（名次 w40 + 封面 64×88 + 信息）。
- Search：搜索框 h44（圆角 22，w 560 居中），结果栅格同 Home；历史搜索 chips 行 h36。
- Detail：左封面 240×320 (x224 y24)，右侧元数据列 x488 w616：标题 28px/热度/评分/简介（max 4 行）；选集栅格 y≥380，集数按钮 64×36 间距 8，每行 ≤13 个，滚动区。
- Player：居中竖屏视口 405×720（9:16，窗口高度内居中），下方控制条 h48（播放/暂停、上集、下集、倍速 0.75/1/1.25/1.5/2、进度条、时间），右上关闭返回。
- Library：顶部 tab（收藏/历史）h44；历史行显示「看到第N集 · xx%」。

## 4 状态同步
- 路由即状态：`#/home|category|rank|search|detail/:id|player/:id/:ep|library`，刷新/返回不丢上下文（URL Hash 持久化）。
- 播放进度：播放中每 5s + 暂停/退出/切集时 POST /api/history。
- 收藏：Detail 页收藏按钮 ↔ POST/DELETE /api/favorites，按钮态即时切换。
- 倍速/清晰度偏好：settings 本地记忆，下次播放沿用。

## 5 状态枚举（页面级状态机，全页通用）
| 状态 | 触发 | UI 表现 | 出口 |
|---|---|---|---|
| 空态 EMPTY | 列表 data.list=[] | 插画占位+文案「暂无内容」 | 数据到达→NORMAL |
| 加载中 LOADING | 请求发出 | 骨架屏（栅格占位块呼吸） | 成功→NORMAL；失败→ERROR |
| 正常 NORMAL | code=0 且非空 | 内容渲染 | 翻页→LOADING(追加) |
| 执行中 ACTING | 收藏/搜索提交等写操作 | 按钮 spinner+禁用 | 成功→NORMAL；失败→ERROR(轻提示) |
| 失败 ERROR | code≠0 或网络断 | 错误插画+「重试」按钮；502→「片源异常」504→「网络超时」 | 重试→LOADING |
| 离线 OFFLINE | navigator.onLine=false | 顶部横幅「已离线，可查看本地收藏/历史」；仅 Library 可用 | 恢复→LOADING |
播放器附加状态：BUFFERING（缓冲圈）/ ENDED（自动跳下一集，末集则显示「已看完」）/ UNPLAYABLE（该集置灰标注「暂不可播」）。

## 6 异常场景
| 场景 | 处理 |
|---|---|
| 搜索 q 空/超 50 字 | 前端拦截不发请求，输入框红描边+提示 |
| ep 越界请求 | 本地数据层返回 400，Player 显示「集数不存在」并回 Detail |
| 上游 502/504 | 页面 ERROR 态+重试；连续 3 次失败提示「稍后再试」 |
| 播放地址为空 | 该集按钮置灰+tooltip「暂不可播」 |
| 无网 | OFFLINE 横幅，Library 可用，其余页 ERROR 态 |
| 窗口缩至 min 以下 | 禁止继续缩小（min 1100×700） |
| 进度≥95% 再进入 | 自动定位下一集（PRD §7） |

## 7 UI 需求清单（组件 7 状态：默认/悬浮/选中/禁用/加载中/空/异常）
| 组件 | testid | 说明 |
|---|---|---|
| 侧栏导航项 | nav-home/nav-category/nav-rank/nav-search/nav-library | 选中态高亮+左侧 3px 指示条 |
| 搜索框 | search-input / search-submit | 悬浮描边；提交中 spinner |
| 剧集卡片 | series-card | 悬浮上浮 2px+阴影；封面加载中骨架 |
| 集数按钮 | ep-btn | 当前集选中态；不可播禁用置灰 |
| 收藏按钮 | fav-btn | 已收藏实心；执行中 spinner |
| 播放器 | player-core / player-prev / player-next / player-rate / player-progress / player-close | 控制条悬浮显现，3s 无操作隐藏 |
| 重试按钮 | retry-btn | ERROR 态专用 |
| 历史行 | history-item | 悬浮显示「续播」 |

## 8 前后端对齐
- 渲染进程禁止直连 upstream；一切数据经本地数据层（PRD §5 契约，api_contract.json 为唯一基线）。
- 调用时机：进入页面→GET 列表；Detail 挂载→/api/series；点集→/api/play；每5s→POST /api/history；收藏点击→POST/DELETE /api/favorites。
- 错误码映射：400→前端表单提示；404→EMPTY；502/504→ERROR+重试。
- 响应包统一 `{code,msg,data}`，渲染层只读 data。

## 9 版本记录
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-06 | 初版（基于 prd.md v1.0，sv APPROVED） |

## 10 字段约束表（UI自动化测试契约）
| 字段 | testid | 类型 | min长度 | max长度 | 必填 | 校验提示 |
|---|---|---|---|---|---|---|
| 搜索关键词 | search-input | string | 1 | 50 | 是 | 「请输入 1-50 字关键词」 |
| 分页页码 | (接口)page | int | 1 | 10000 | 否(默认1) | 越界返回 400 |
| 每页条数 | (接口)size | int | 1 | 50 | 否(默认20) | 越界返回 400 |
| 集数 | (接口)ep | int | 1 | total_episodes | 是 | 越界返回 400 |
| 进度秒数 | (接口)progress_sec | int | 0 | 86400 | 是 | 越界截断至 [0,duration] |
| 分类枚举 | (接口)type | enum | real/comic/ai/manga | — | 是 | 非法枚举 400 |
| 榜单枚举 | (接口)board | enum | hot/new/real/comic | — | 是 | 非法枚举 400 |
