# 视觉规范文档 · hongguo-desktop v1.0（ui_spec）

> 输入基线：interaction_design.md v1.0（7 页布局 + §7 组件清单）。本文件为唯一视觉真源，全部数值化（hex/px），深色沉浸基调，无"大概/约"表述。窗口基准 1280×800，min 1100×700。

## 1 颜色系统（Color Tokens）

### 1.1 三层背景（ΔE 两两 ≥8，实测见备注）
| Token | Hex | 用途 |
|---|---|---|
| bg/L0-page | #0C0E12 | 页面底层底色（内容区、Player 页底） |
| bg/L1-surface | #161A22 | 侧栏、卡片、列表行、控制条载体 |
| bg/L2-overlay | #202633 | 弹窗、下拉、Tooltip、悬浮面板 |
| scrim/modal | rgba(6,8,12,0.64) | 弹窗蒙层 |
| scrim/player-top | linear-gradient(180deg, rgba(0,0,0,0.56) 0%, rgba(0,0,0,0) 100%) | 播放器顶部关闭区渐变罩，高 64px |
| scrim/player-bottom | linear-gradient(0deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 100%) | 播放器控制条渐变罩，高 96px |

备注：L0(#0C0E12)↔L1(#161A22) RGB 差值 (10,12,16)，ΔE≈22；L1↔L2(#202633) 差值 (10,12,17)，ΔE≈22，均 ≥8 达标。

### 1.2 文本色（3 级 + 反色）
| Token | Hex | 对比度（on L0） | 用途 |
|---|---|---|---|
| text/primary | #F3F5F9 | 15.8:1 | 标题、剧名、名次、正文主文案 |
| text/secondary | #A7AEBE | 8.0:1 | 元信息、简介、时间、辅助说明（≥12px 可用） |
| text/tertiary | #6E7686 | 3.9:1 | 占位符、禁用文案、极次要标注（仅限 ≥12px 辅助文本/图标，禁止用于正文） |
| text/inverse | #14161B | — | accent 浅色面上的深字（备用） |
| text/on-accent | #FFFFFF | 4.5:1（on accent-fill） | 主按钮/选中态文字 |

### 1.3 品牌与业务色
| Token | Hex | 用途 |
|---|---|---|
| accent/fill | #E03050 | 承载白字的填充面（主按钮、选中集数、收藏已选、Tab 选中下划条） |
| accent/fill-hover | #F03A5B | accent/fill 悬浮 |
| accent/fill-pressed | #C42444 | accent/fill 按下 |
| accent/fill-disabled | #4A2129 | accent 禁用底（文字 #8A6A72） |
| accent/bright | #FF4D6A | 不承载文字的强调：侧栏 3px 指示条、进度条已播段、热度值、收藏心形已选图标 |
| heat/orange | #FF8A3D | 热度/榜单火焰图标、热度数值（Rank 页） |
| rating/gold | #FFC24B | 评分星形与分值 |
| state/success | #34D399 | 操作成功 Toast、已看完标记 |
| state/warning | #FBBF24 | 离线横幅、缓冲提示 |
| state/error | #FF5C5C | 错误文案、输入红描边、异常图标 |
| state/info | #5CA8FF | 信息提示、链接色 |
| focus/ring | #FF4D6A | 键盘焦点环：2px 实线，外偏移 2px |

### 1.4 描边与分割线
| Token | 值 | 用途 |
|---|---|---|
| border/hairline | 1px rgba(255,255,255,0.06) | 卡片描边、列表行分割线 |
| border/strong | 1px rgba(255,255,255,0.12) | 输入框默认描边、弹窗描边 |
| border/accent | 1px #E03050 | 选中卡片/选中 Tab 描边 |
| border/error | 1px #FF5C5C | 表单校验失败描边 |

### 1.5 骨架屏与遮罩
| Token | 值 |
|---|---|
| skeleton/base | #1A1F28 |
| skeleton/shimmer | linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)，扫动周期 1200ms |
| skeleton/breath | opacity 0.6 ↔ 1.0，1200ms ease-in-out 无限循环 |

## 2 字体系统（Typography）

字体栈（全局唯一）：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif`。等宽数字：`font-variant-numeric: tabular-nums`（时间、进度、页码、名次强制启用）。

| 级别 | 字号/行高(px) | 字重 | 字距 | 用途 |
|---|---|---|---|---|
| display | 28/36 | 700 | 0 | Detail 剧名 |
| h1 | 24/32 | 700 | 0 | 页面大标题（本 7 页无独立大标题，备用） |
| h2 | 20/28 | 600 | 0 | 模块标题（"选集""为你推荐"） |
| h3 | 18/26 | 600 | 0 | 弹窗标题 |
| title | 16/24 | 600 | 0 | 卡片标题、Tab、列表行主文案 |
| body | 14/21 | 400 | 0 | 正文、简介、按钮文案 |
| body-strong | 14/21 | 500 | 0 | 强调正文、搜索框输入文字 |
| caption | 13/19 | 400 | 0 | 元信息行（热度/评分）、历史行副文案 |
| small | 12/17 | 400 | 0.2 | 标签、chips、倍速按钮、角标 |
| tiny | 11/15 | 400 | 0.2 | 播放器时间码（配 tabular-nums） |

## 3 间距系统（Spacing，4px 栅格）

| Token | px | 典型用途 |
|---|---|---|
| space-1 | 4 | 图标与文字内距、chips 内边距纵向 |
| space-2 | 8 | 卡片内元素间距、Tab 项间距、ep-btn 间距、控制条按钮间距 |
| space-3 | 12 | 卡片内边距、输入框水平内边距、控制条水平内边距 |
| space-4 | 16 | 卡片栅格 gap、模块内分组间距、弹窗内边距 |
| space-5 | 20 | 区块标题与内容间距 |
| space-6 | 24 | 内容区页面内边距（四边）、Detail 顶部偏移 |
| space-7 | 32 | 模块与模块间距 |
| space-8 | 40 | 页面大区块分隔 |
| space-9 | 48 | 空态/异常页插画与文案组间距上限 |

页面级固定值（与 interaction_design.md §3 对齐）：侧栏宽 200；内容区 x=200、宽 1080（min 900）、内边距 24；卡片栅格列宽 168、gap 16；封面 168×224；Detail 封面 240×320、位于内容区 x=24 y=24（相对内容区），元数据列 x=288 宽 616（相对内容区，即窗口 x=488）；选集区 y≥380；ep-btn 64×36、间距 8、每行 ≤13。

## 4 圆角系统（Radius）

| Token | px | 用途 |
|---|---|---|
| radius-1 | 4 | 小标签、名次角标、进度条（h4 → radius 2 特例见 §8.5） |
| radius-2 | 6 | ep-btn、倍速按钮、chips |
| radius-3 | 8 | 剧集卡片、历史行、Rank 行、输入框（非胶囊）、小弹层 |
| radius-4 | 12 | 大卡片、Detail 封面、Toast |
| radius-5 | 16 | 模态弹窗 |
| radius-pill-22 | 22 | 搜索框（h44 全圆角） |
| radius-full | 999 | 头像、播放旋钮、圆形图标按钮 |

## 5 阴影系统（Elevation，深色基调压暗不发光）

| Token | 值 | 用途 |
|---|---|---|
| shadow-1 | 0 1px 2px 0 rgba(0,0,0,0.32) | 卡片默认、进度条旋钮 |
| shadow-2 | 0 4px 12px 0 rgba(0,0,0,0.40) | 卡片悬浮（配合上浮 2px）、控制条 |
| shadow-3 | 0 8px 24px 0 rgba(0,0,0,0.48) | 下拉、Tooltip、粘顶条 |
| shadow-4 | 0 16px 48px 0 rgba(0,0,0,0.56) | 模态弹窗、播放器悬浮控制层 |

Z-index 字典（全局固定不冲突）：页面内容 0；粘顶条/Tab 条 100；下拉/Tooltip 200；播放器控制层 300；模态弹窗 400；Toast 500；离线横幅 550；最高 999 禁用。

动效标准（阶段3参数表并入此处）：微交互/hover 150ms ease-out；浮层显隐 200ms ease-out（播放器控制条）；折叠/展开 250ms ease-in-out；页面转场 300ms ease-in-out；复杂动画上限 1000ms；骨架呼吸 1200ms 循环。

## 6 组件 7 状态规范（§7 清单全覆盖）

状态口径：默认 / 悬浮 / 选中 / 禁用 / 加载中 / 空 / 异常。组件无独立"选中"语义的，选中列给该组件的激活/已选等价态；无独立"空"语义的，空态定义为占位/无内容呈现，均数值化。

### 6.1 侧栏导航项（nav-home / nav-category / nav-rank / nav-search / nav-library）
容器：宽 200，项高 44，水平内边距 16，图标 18×18，图标-文字间距 12，文字 14px/500。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 底 transparent；文字 text/secondary #A7AEBE；图标同文字色；无指示条；cursor pointer |
| 悬浮 | 底 rgba(255,255,255,0.05)；文字 text/primary #F3F5F9；过渡 150ms |
| 选中 | 底 rgba(224,48,80,0.12)；左侧 3px 宽、高 24、radius-full 指示条 accent/bright #FF4D6A（x=0 垂直居中）；文字 #FFFFFF 14px/600；图标 accent/bright |
| 禁用 | 整体 opacity 0.4；cursor not-allowed；无 hover 反馈（本 7 页侧栏常可用，仅 OFFLINE 时非 Library 项置此态） |
| 加载中 | 图标位替换为 16×16 spinner（2px 描边 accent/bright，透明缺口 90°，旋转 800ms 线性无限）；文字 text/secondary；点击禁用 |
| 空 | 不适用固定导航，定义兜底：图标位显示 18×18 占位块 skeleton/base radius-1，文字显示 "—"（text/tertiary） |
| 异常 | 文字 text/secondary 不变；图标右侧叠加 6×6 圆点 state/error #FF5C5C（x 偏移 +12）；tooltip 显示异常文案 |

### 6.2 搜索框（search-input / search-submit）
容器：h44、w560 居中、radius-pill-22；输入区水平内边距 16；图标 16×16；提交按钮内嵌右侧 w64 h32 radius-full 居中于右 6px。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 底 bg/L1 #161A22；描边 border/strong；占位符 "搜索剧集" text/tertiary 14px；输入文字 text/primary 14px/500 |
| 悬浮 | 描边 rgba(255,255,255,0.24)；底不变；过渡 150ms |
| 选中（聚焦） | 描边 2px accent/fill #E03050；外环 focus/ring 2px 偏移 2px；占位符隐藏 |
| 禁用 | 底 #12151B；描边 border/hairline；文字 text/tertiary；cursor not-allowed（OFFLINE 且非 Library 页时） |
| 加载中（提交中） | search-submit 文案替换为 14×14 spinner（2px accent/bright）；submit 禁用；输入框保持可编辑 |
| 空（q=""） | 占位符可见；search-submit 底 accent/fill-disabled #4A2129、文字 #8A6A72、不可点；下方历史搜索 chips 行 h36 正常展示 |
| 异常（q 超 50 字/空提交拦截） | 描边 2px state/error #FF5C5C；下方 4px 处提示文案 "请输入 1-50 字关键词" 12px state/error；抖动动画 300ms（translateX ±4px ×3） |

### 6.3 剧集卡片（series-card）
容器：w168；封面 168×224 radius-3 8px；标题区 2 行 14px/600 行高 21，meta 行 1 行 13px text/secondary；封面与标题间距 8。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 封面底 skeleton/base；描边 border/hairline；shadow-1；标题 text/primary；热度 accent/bright、评分 rating/gold |
| 悬浮 | 整卡 translateY(-2px)；shadow-2；封面叠加 rgba(0,0,0,0.08)；过渡 150ms；cursor pointer |
| 选中（点击/路由进入 Detail 的回链高亮） | 描边 2px accent/fill #E03050；shadow-2 |
| 禁用 | 整体 opacity 0.4；无 hover；cursor not-allowed（版权下架占位场景） |
| 加载中（封面未就绪） | 封面区 skeleton/base + skeleton/shimmer 扫动；标题区显示 2 条骨架条（w168 h14 / w104 h14，radius-1，间距 6）；meta 区 1 条（w72 h12） |
| 空（封面 URL 为空） | 封面区 bg/L2 #202633 + 居中 32×32 占位图标 text/tertiary + 底部 "暂无封面" 11px text/tertiary；标题/meta 正常渲染 |
| 异常（封面加载失败） | 封面区 bg/L2 + 居中 24×24 state/error 断图图标 + "加载失败" 11px state/error；点击封面区重试（cursor pointer）；标题/meta 正常渲染 |

### 6.4 集数按钮（ep-btn）
容器：64×36，radius-2 6px，文字 14px/500 tabular-nums，栅格间距 8。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 底 bg/L1 #161A22；描边 border/hairline；文字 text/secondary #A7AEBE；cursor pointer |
| 悬浮 | 底 #1C212B；描边 rgba(224,48,80,0.5)；文字 text/primary；过渡 150ms |
| 选中（当前播放集） | 底 accent/fill #E03050；描边 accent/fill；文字 #FFFFFF 14px/600；shadow-1 |
| 禁用（该集地址为空，UNPLAYABLE） | 底 #12151B；文字 text/tertiary #6E7686 加删除线（1px text/tertiary）；cursor not-allowed；tooltip "暂不可播"（底 bg/L2、文字 12px text/primary、radius-1、padding 4 8、shadow-3） |
| 加载中（点击后等 /api/play） | 文字替换为 14×14 spinner（2px accent/bright）；按钮禁用；其余集不变 |
| 空（total_episodes=0） | 选集区整体替换为空态：64×36 不渲染，区域显示 "暂无可选集数" 13px text/tertiary 居中，区高 88 |
| 异常（/api/play 返回非 0） | 该集按钮描边 2px state/error 持续 1200ms 后回默认；同时触发 ERROR Toast（h40、radius-4、底 bg/L2、左图标 16×16 state/error、文字 13px text/primary、shadow-3） |

### 6.5 收藏按钮（fav-btn）
容器：w96 h36，radius-full，图标心形 16×16 + 文字 13px/500，图标-文字间距 6（Detail 元数据区使用）。
| 状态 | 视觉定义 |
|---|---|
| 默认（未收藏） | 底 transparent；描边 border/strong；图标/文字 text/secondary；cursor pointer |
| 悬浮 | 描边 rgba(224,48,80,0.6)；图标/文字 accent/bright #FF4D6A；底 rgba(224,48,80,0.08)；过渡 150ms |
| 选中（已收藏） | 底 accent/fill #E03050；描边 accent/fill；图标实心 #FFFFFF；文字 #FFFFFF "已收藏" |
| 禁用 | 整体 opacity 0.4；cursor not-allowed |
| 加载中（ACTING，POST/DELETE 途中） | 图标替换为 14×14 spinner（当前文字色）；文案固定 "处理中"；按钮禁用防重复提交 |
| 空（未登录/无收藏上下文的兜底展示） | 图标空心 text/tertiary；文字 text/tertiary "收藏"；点击触发引导 Toast |
| 异常（写操作失败） | 按钮回滚至操作前态；右侧 8px 处浮 ERROR 轻提示（同 6.4 Toast 规格，文案 "操作失败，请重试"），2000ms 自动消失 |

### 6.6 播放器组件组（player-core / player-prev / player-next / player-rate / player-progress / player-close）
完整规格见 §8。状态总表：
| 状态 | 视觉定义 |
|---|---|
| 默认 | 控制层显现：底 scrim/player-bottom 96px 渐变 + 控制条 h48（§8.4）；图标 #FFFFFF 不透明 |
| 悬浮 | 单按钮底 rgba(255,255,255,0.12) radius-full；scale 1.05；过渡 150ms |
| 选中（倍速已选/播放中） | player-rate 当前档文字 accent/bright #FF4D6A 12px/600；play/pause 图标随播放态切换 |
| 禁用（首集禁用 prev / 末集禁用 next） | 图标 opacity 0.32；cursor not-allowed；无 hover |
| 加载中（BUFFERING） | 视口中心 40×40 缓冲圈（3px 描边 rgba(255,255,255,0.24) 底 + accent/bright 弧 90°，旋转 800ms）；控制条保留可用 |
| 空（无播放源进入页） | 视口底 #000000；中心 "该集暂不可播" 14px text/secondary + 下方 12px text/tertiary "返回详情选择其他集"；控制条仅 close 可用 |
| 异常（UNPLAYABLE/拉流失败） | 视口底 #000000；中心 32×32 state/error 图标 + "片源异常，请稍后重试" 14px text/primary + retry-btn（§6.7）居中下方间距 16；ENDED 末集显示 "已看完" state/success 14px |

### 6.7 重试按钮（retry-btn，ERROR 态专用）
容器：w96 h36，radius-2 6px，文字 14px/500。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 底 accent/fill #E03050；文字 #FFFFFF；shadow-1；cursor pointer |
| 悬浮 | 底 accent/fill-hover #F03A5B；translateY(-1px)；shadow-2；过渡 150ms |
| 选中（按下） | 底 accent/fill-pressed #C42444；translateY(0)；shadow-1 |
| 禁用（重试请求途中） | 底 accent/fill-disabled #4A2129；文字 #8A6A72；cursor not-allowed |
| 加载中 | 文字左侧 8px 处 14×14 spinner（2px #FFFFFF）；文案 "重试中"；禁用 |
| 空（无可重试上下文） | 不渲染；原位显示 "请返回上一页" 13px text/tertiary 纯文本 |
| 异常（连续 3 次失败） | 按钮替换为静态文案 "稍后再试" 14px state/warning #FBBF24 + 左侧 16×16 warning 图标；不再可点，引导返回 |

### 6.8 历史行（history-item）
容器：w 满内容区（1080-48=1032），h72，水平内边距 16，封面 40×56 radius-2 居左，右信息列；行间距 0（hairline 分割线）。
| 状态 | 视觉定义 |
|---|---|
| 默认 | 底 transparent；底部 border/hairline 1px；标题 14px/500 text/primary；副文案 "看到第N集 · xx%" 13px text/secondary；cursor pointer |
| 悬浮 | 底 rgba(255,255,255,0.05)；右侧浮出 "续播" 按钮（w64 h28 radius-full、底 accent/fill、文字 12px #FFFFFF）；过渡 150ms |
| 选中（点击行） | 底 rgba(224,48,80,0.10)；标题 text/primary/600 |
| 禁用（剧集已下架） | 封面/文字 opacity 0.4；副文案改 "已下架" 13px text/tertiary；cursor not-allowed |
| 加载中（列表请求中） | 行渲染骨架：封面 40×56 skeleton/base；标题条 w240 h14；副文案条 w160 h12；skeleton/shimmer 扫动 |
| 空（history 为空） | 列表区空态：居中 64×64 占位图标 text/tertiary + "暂无观看历史" 14px text/secondary + "去看看" 链接 13px state/info，纵向间距 12，区高 320 |
| 异常（进度数据缺失 progress_sec=null） | 副文案显示 "进度异常" 13px state/warning；点击行按 ep=1、progress=0 进入；标题前加 6×6 warning 圆点 |

## 7 页面级状态页规格（EMPTY / LOADING / ERROR / OFFLINE）

| 状态 | 规格 |
|---|---|
| EMPTY | 内容区垂直居中：64×64 占位图标（text/tertiary）+ "暂无内容" 14px text/secondary，间距 12；区高 ≥320 |
| LOADING | 骨架屏：栅格占位块 168×224 ×N（N=首屏容量 12），skeleton/base + shimmer；列表页骨架行 h72 ×6 |
| ERROR | 内容区垂直居中：48×48 state/error 图标 + 文案（502→"片源异常" / 504→"网络超时" / 其他→"加载失败"）14px text/primary + retry-btn（§6.7）下方间距 16 |
| OFFLINE | 顶部横幅 h40 全宽：底 rgba(251,191,36,0.12)、左 16×16 warning 图标 state/warning、文字 "已离线，可查看本地收藏/历史" 13px #FBBF24、水平内边距 24；z-index 550；其余页面叠 ERROR 态，Library 页正常 |

## 8 竖屏播放页完整规格（Player，视口 405×720）

### 8.1 页面骨架
- 页面底：bg/L0 #0C0E12 全铺。
- 视口：405×720（9:16），水平居中于内容区：x = 200 + (1080-405)/2 = 537（取整 537，min 窗口 x = 200 + (900-405)/2 = 447）；垂直居中于窗口：y = (800-720)/2 = 40（min 窗口 700 高时 y = 0，视口高不变，控制层转纯悬浮）。
- 视口底：#000000；radius-4 12px 裁切；shadow-4。
- 视频画面：object-fit contain，居中，禁止拉伸。

### 8.2 关闭返回（player-close）
- 位置：视口右上，x = 视口右 - 12 - 32，y = 12；尺寸 32×32 radius-full。
- 底 rgba(0,0,0,0.48)，图标 × 16×16 #FFFFFF；悬浮底 rgba(255,255,255,0.16)；z-index 300；随控制层同显隐。
- 顶部渐变罩 scrim/player-top 高 64。

### 8.3 控制层显隐
- 鼠标进入视口/移动 → 显现（200ms ease-out）；静止 3000ms → 隐藏（200ms）；播放中隐藏时 cursor: none。
- 暂停/BUFFERING/异常态强制常显。

### 8.4 控制条（h48）
- 位置：视口内底部，bottom 0，宽 405，高 48；底 scrim/player-bottom（96px 渐变覆盖控制条及其上方 48px 过渡区）。
- 布局（左→右，水平内边距 12，元素间距 8，垂直居中）：
  - player-prev：28×28，图标上一集 16×16 #FFFFFF。
  - player-core（播放/暂停）：32×32 radius-full，底 rgba(255,255,255,0.16)，图标 18×18 #FFFFFF；悬浮底 rgba(255,255,255,0.28)。
  - player-next：28×28，图标下一集 16×16 #FFFFFF。
  - player-rate：w44 h24 radius-2，文字 12px/500（档位 0.75/1/1.25/1.5/2，点击循环或下拉，下拉面板 w72、item h28、底 bg/L2、选中项 accent/bright、shadow-3、z-index 200）。
  - 时间码：当前时间 tiny 11px #C7CDDA tabular-nums，" / " 分隔，总时长 11px text/tertiary。
  - player-progress：占据剩余宽度（≈405-24-28-8-32-8-28-8-44-8-96-8-8≈113，min 60），见 §8.5。
- 禁用规则：ep=1 时 prev 禁用；ep=total_episodes 时 next 禁用（§6.6 禁用态）。

### 8.5 进度条（player-progress）
- 轨道：h4，radius 2，底 rgba(255,255,255,0.16)，全长。
- 缓冲段：rgba(255,255,255,0.28)，h4 radius 2。
- 已播段：accent/bright #FF4D6A，h4 radius 2。
- 旋钮：12×12 圆形 #FFFFFF shadow-1 radius-full，默认隐藏；悬浮进度条/拖拽时显示并放大至 14×14（150ms）。
- 命中区：h16 透明热区（上下各 6px 扩展），cursor pointer。
- 拖拽中：已播段色不变，旋钮 14×14，时间码跟随显示预览值。

### 8.6 播放器附加态
- BUFFERING：§6.6 加载中规格，中心缓冲圈 40×40。
- ENDED：非末集自动跳下一集（转场 300ms 黑场淡入淡出）；末集视口中心 "已看完" 14px state/success + 副文案 "返回详情" 链接 13px state/info。
- UNPLAYABLE / 拉流异常：§6.6 异常态规格。
- 集数不存在（400）：Toast "集数不存在"（§6.4 Toast 规格）后 300ms 路由回 Detail。

## 9 无障碍与一致性约束
1. 正文文本对比度 ≥4.5:1（text/primary、text/secondary 达标）；text/tertiary 3.9:1 仅限辅助/装饰用途；UI 组件与图标 ≥3:1。
2. 状态禁止仅靠单色传递：error 必配图标或文案，选中必配指示条/填充+字重变化。
3. 全部可点元素键盘可聚焦，焦点环 focus/ring 2px 偏移 2px 不裁剪。
4. 全部样式引用本文件 Token，禁止硬编码新色值；新增 Token 必须回写本文件 §1-§5。
5. 间距值必须为 4 的倍数；本文件出现的 3px（指示条）、22px（搜索框圆角）为已登记特例，不得新增特例。

## 10 版本记录
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-06 | 初版（基于 interaction_design.md v1.0）：5 系统 Token 化 + §7 组件 7 状态全量数值化 + Player 405×720 完整规格 |
