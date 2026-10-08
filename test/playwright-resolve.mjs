// 本地开发解析：export HG_PLAYWRIGHT_PATH=<playwright 包路径> 或 pnpm i -D playwright
const p = process.env.HG_PLAYWRIGHT_PATH || 'playwright';
export const { chromium, _electron } = await import(p);
