# upstream NOTES — 官方公开数据接口实测结论（2026-10-06 实测，be 分身）

## 总述：官方没有公开 JSON REST API，数据载体是 SSR HTML 内联 `_ROUTER_DATA`

hongguoduanju.com 是 Modern.js SSR 站。所有公开页面（首页/分类/搜索/详情/播放）服务端直出，
页面内联 `_ROUTER_DATA = {...}` JSON（后随 `; function runWindowFn()...`，需括号配平扫描提取）。
本适配层 = 抓取 SSR 页面 + 提取 `_ROUTER_DATA` + zod 校验 + 字段映射。
（JS chunk 中未发现可直接复用的公开 JSON API；App 私有 API 带签名，合规上不碰。）

## 端点映射（实测）

| 本地端点 | 上游页面 | 数据路径（_ROUTER_DATA.loaderData.*） | 实测备注 |
|---|---|---|---|
| /api/home | `GET /` | `page.homeSections[4]` | 4 个 section：`all`热播短剧/`human`热播真人剧/`comic`热播漫剧/`ai`热播AI剧，各 9 条，合并去重 ≤36 条，本地切片分页 |
| /api/category | `GET /category/{route}?page=N` | `category_$.recommendList` + `pagination{total,pageNum,pageSize=24,totalPages}` | type 映射：real→real-drama，comic→comic-drama（漫剧），ai→ai-drama，manga→comic（漫画）。上游页固定 24 条，本地 size(1-50) 映射为上游页区间后切片 |
| /api/rank | hot/real/comic → `GET /` 的 homeSections | 同上 | rank 站页（/rank/hot-*）SSR 的 `content` 实测为空 `{}`（榜单不走 SSR），故用首页 section 的 rank 字段；board=new 无上游新剧榜，用四分类首页按 `create_time` 倒序合成 |
| /api/search | `GET /search/{encodeURIComponent(q)}` | `search_(keyword)/page.{searchList,totalCount}` | 实测 `?page=2` 不改变结果（上游搜索 SSR 只回前 10 条），故 has_more 恒 false；结果在 `searchList[].video_data`；**totalCount 实测为字符串（"30"），schema 已兼容 string\|number** |
| /api/series | `GET /detail?series_id=` | `detail_page.{seriesDetail,seriesSocialInfo}` | seriesDetail：episode_cnt/series_name/series_cover/series_intro/tags/**vid_list（长度=episode_cnt，第 i 个 vid 即第 i+1 集）**；seriesSocialInfo：rating（评分）/hot_score_data.score（热度）/rank_label |
| /api/play | `GET /player/{series_id}/{vid}` | `player_(series_id)/(vid)/page.video_player_info` | `{duration(秒,float),width,height,poster_url,main_url}` |

## 关键偏差（以实测为准）

1. **播放地址是渐进式 MP4 直链，不是 HLS**。`video_player_info.main_url` 实测 `mime_type=video_mp4`
   （v11-hgweb.qznovelvod.com 签名链接，x-expires 约 1 小时）。全站 HTML 无 m3u8 字样。
   契约字段仍叫 `play_url`；渲染层用 `<video src>` 原生即可播，hls.js 对本站点实际用不上（fe 已知会）。
2. **单集时长不在详情页**：只有播放页 video_player_info.duration 有单集时长。
   /api/series 的 episodes[].duration 返回 0，起播后由 /api/play 的 duration 提供。
3. **episodes[].title**：上游无单集标题，统一生成 `第N集`；seq=ep。
4. **列表卡片无评分**：score 字段仅详情页有（seriesSocialInfo.rating）；列表卡片 score=0。
   hot 取 hot_score_data.score（首页 section 卡片该字段可能为空对象 → 0）。
5. **latest_episode**：上游无单独字段，取 episode_cnt（全 N 集）。
6. **搜索 Referer**：首次不带 Referer 实测过一次 500（后复测 200，疑临时抖动）；
   适配层固定带 `Referer: https://hongguoduanju.com/` 礼貌头。
7. **accessible_episode_cnt=3**：详情页有此字段（网页版播放页高亮前 3 集免费引导），
   但 vid_list 给全 80 集且播放页任意 vid 均能取到播放地址——按 vid_list 为准。

## 合规

- 只读取上述公开 SSR 页面；全链路无任何广告/激励/金币/tracking 域名与代码（grep 可证）。
- 单接口 ≥300ms 令牌桶节流；元数据内存缓存 TTL 10min；播放地址为时效签名链接不缓存。
- UA 诚实标识：`hongguo-desktop/1.0 (Electron main-process local data layer; personal non-distributed use)`。
- 页面 req 块中观察到 `isCrawler` 字段：官方对爬虫有识别，若未来 SSR 对非浏览器 UA 返回空数据，
  表现为 502（zod 校验失败）而非脏数据，符合 PRD §7 兜底。
