# 红果短剧桌面版（macOS · 无广告）

红果短剧的 macOS 桌面客户端（非官方，个人学习项目）：**全集免费播放、全程零广告、零会员**。

## 一键下载 · 拖动安装

👉 **[下载 红果短剧-1.2.0-mac-arm64.dmg](https://github.com/xu-jin-cs/hongguo-desktop-mac/releases/latest)**（Apple Silicon）

1. 打开 dmg → 把「红果短剧.app」**拖进 Applications** 文件夹（一键拖动安装）
2. 首次打开如提示「无法验证开发者」：右键点应用 → 打开（只需一次）

> 依赖：全集解密通道需要系统有 ffmpeg（`brew install ffmpeg`），无则仅前 3 集可播（官网公开通道）。

## 功能一览

![首页](docs/screenshots/01-home.png)

- **首页/分类/排行/搜索**：实时搜索（输入即搜，无需回车），剧名可选中复制
- **详情页**：全集选集（看过的集数自动置灰，进度一目了然），收藏/返回

![详情页](docs/screenshots/02-detail.png)

- **播放器**：横竖屏切换（连播保持）、真全屏（跨集保持）、剧名·集数常驻显示、自动连播下一集、本季播完自动跳下一季第 1 集、进度记忆续播
- **收藏/历史**：纯本地存储（SQLite），无账号无同步无上报

![播放器](docs/screenshots/03-player.png)

## 零广告声明

架构级无广告：数据层只取正片与元数据，不接入任何广告 SDK/激励视频/埋点上报接口——广告路径在代码里不存在，不是"拦截"是"没有"。

## 技术栈与本地开发

Electron + React 18 + TypeScript + better-sqlite3；本地数据层（127.0.0.1 随机端口）隔离上游；官网 SSR 明文通道（前 3 集）+ App 端签名通道（全集，CENC 解密）。

```bash
pnpm install
pnpm dev        # 开发
pnpm test       # 单测
pnpm dist:mac   # 打包
```

## 合规声明

仅供个人学习交流，禁止商用与传播。内容版权归红果短剧及版权方所有。
