import { _electron as electron } from './playwright-resolve.mjs';
import fs from 'node:fs';

const outDir = 'test/evidence/ui-baseline';
fs.mkdirSync(outDir, { recursive: true });

const app = await electron.launch({ args: ['.'], executablePath: 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron' });
const win = await app.firstWindow();
await win.waitForTimeout(3000);
const port = await win.evaluate(() => window.__HG_PORT__);
console.log('HG_PORT=', port);

const pages = [
  ['home', '#/home'],
  ['category', '#/category'],
  ['rank', '#/rank'],
  ['search', '#/search'],
  ['library', '#/library'],
];
for (const [name, hash] of pages) {
  await win.evaluate((h) => { location.hash = h; }, hash);
  await win.waitForTimeout(2500);
  await win.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
}
// detail: 点第一张卡片
await win.evaluate(() => { location.hash = '#/home'; });
await win.waitForTimeout(2000);
await win.locator('[data-testid="series-card"]').first().click();
await win.waitForTimeout(2500);
await win.screenshot({ path: `${outDir}/detail.png` });
console.log('shot detail');
// player: 点第一集
await win.locator('[data-testid="ep-btn"]').first().click();
await win.waitForTimeout(4000);
await win.screenshot({ path: `${outDir}/player.png` });
console.log('shot player');

await app.close();
console.log('DONE');
