/**
 * upstream 响应 zod 校验（PRD §7：上游字段变更 → 校验失败记日志返回 502，不落脏数据）。
 * schema 只约束我们实际消费的字段，其余字段 passthrough 容忍。
 * 字段名以 2026-10-06 实测为准（见 NOTES.md）。
 */
import { z } from 'zod';

const hotScoreSchema = z
  .object({
    score: z.number().optional(),
    text: z.string().optional(),
  })
  .passthrough()
  .optional();

/** 卡片原始结构：home 用 series_title，category 用 series_name，两者都可能有。 */
export const rawCardSchema = z
  .object({
    series_id: z.string().min(1),
    series_title: z.string().optional(),
    series_name: z.string().optional(),
    series_cover: z.string().default(''),
    series_intro: z.string().optional(),
    episode_cnt: z.number().int().nonnegative(),
    rank: z.number().int().optional(),
    create_time: z.string().optional(),
    hot_score_data: hotScoreSchema,
  })
  .passthrough();

export const homeDataSchema = z
  .object({
    loaderData: z
      .object({
        page: z
          .object({
            homeSections: z.array(
              z
                .object({
                  tab_type: z.string(),
                  tab_name: z.string().optional(),
                  video_list: z.array(rawCardSchema).default([]),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const categoryDataSchema = z
  .object({
    loaderData: z
      .object({
        category_$: z
          .object({
            recommendList: z.array(rawCardSchema).default([]),
            pagination: z
              .object({
                total: z.number().int().nonnegative().default(0),
                pageNum: z.number().int().default(1),
                pageSize: z.number().int().default(24),
                totalPages: z.number().int().default(0),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const searchItemSchema = z
  .object({
    keyword: z.string().optional(),
    name: z.string().optional(),
    video_data: rawCardSchema,
  })
  .passthrough();

export const searchDataSchema = z
  .object({
    loaderData: z
      .object({
        'search_(keyword)/page': z
          .object({
            searchList: z.array(searchItemSchema).default([]),
            // 实测 totalCount 为字符串（"30"），兼容数字与字符串
            totalCount: z
              .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)])
              .default(0),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export const detailDataSchema = z
  .object({
    loaderData: z
      .object({
        detail_page: z
          .object({
            seriesDetail: z
              .object({
                series_id: z.string().min(1),
                series_name: z.string().default(''),
                series_cover: z.string().default(''),
                series_intro: z.string().default(''),
                episode_cnt: z.number().int().nonnegative(),
                accessible_episode_cnt: z.number().int().nonnegative().optional(),
                vid_list: z.array(z.string()).default([]),
                tags: z.array(z.string()).optional(),
              })
              .passthrough(),
            seriesSocialInfo: z
              .object({
                rating: z.number().optional(),
                hot_score_data: hotScoreSchema,
                rank_label: z.string().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export const playerDataSchema = z
  .object({
    loaderData: z
      .object({
        'player_(series_id)/(vid)/page': z
          .object({
            video_player_info: z
              .object({
                duration: z.number().nonnegative().default(0),
                main_url: z.string().default(''),
                poster_url: z.string().optional(),
                width: z.string().optional(),
                height: z.string().optional(),
              })
              .passthrough()
              .nullable(),
            seriesDetail: z
              .object({
                episode_cnt: z.number().int().nonnegative().default(0),
                vid_list: z.array(z.string()).default([]),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export type RawCard = z.infer<typeof rawCardSchema>;
export type HomeData = z.infer<typeof homeDataSchema>;
export type CategoryData = z.infer<typeof categoryDataSchema>;
export type SearchData = z.infer<typeof searchDataSchema>;
export type DetailData = z.infer<typeof detailDataSchema>;
export type PlayerData = z.infer<typeof playerDataSchema>;
