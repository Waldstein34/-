// サンプルで生成した dist を Playwright で撮影する: node build/shots.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const DIST = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function page(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: 844 }, deviceScaleFactor: 2, colorScheme: opts.dark ? 'dark' : 'light', hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    return p;
  }
  async function overflow(p, label) {
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (r.sw > r.cw) errors.push(`${label}: 横はみ出し ${r.sw} > ${r.cw}`);
  }
  const shot = async (p, name, full = false) => { await p.waitForTimeout(250); await overflow(p, name); await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); };

  let p = await page();
  await p.goto(DIST);
  await shot(p, '01-cover');
  await p.goto(DIST + '#/toc'); await shot(p, '02-toc', true);
  await p.goto(DIST + '#/ep/4'); await shot(p, '03-ep4-top');
  await shot(p, '04-ep4-full', true);
  await p.click('.term >> nth=0'); await shot(p, '05-term-sheet');
  await p.click('.sheet [data-act="sheet-close"]');
  await p.locator('.choice').nth(0).click();
  await p.locator('.quiz-item').scrollIntoViewIfNeeded();
  await shot(p, '06-quiz-wrong');
  await p.goto(DIST + '#/ep/5'); await p.locator('.choice[data-c]').click(); await p.locator('.quiz-item').scrollIntoViewIfNeeded(); await shot(p, '07-quiz-ok');
  await p.click('[data-act="mark"]'); await p.waitForTimeout(100);
  await p.goto(DIST + '#/ep/1'); await shot(p, '08-ep1-full', true);
  await p.goto(DIST + '#/toc'); console.log('storage', await p.evaluate(() => localStorage.getItem('investbook:v1'))); await shot(p, '09-toc-after', true);
  await p.goto(DIST + '#/glossary'); await shot(p, '10-glossary', true);
  await p.goto(DIST + '#/search'); await p.fill('#q', '金利'); await p.waitForTimeout(300); await shot(p, '11-search');
  await p.click('.s-hit >> nth=-1'); await shot(p, '12-search-jump');
  await p.goto(DIST + '#/'); await shot(p, '13-cover-resume');
  await p.click('[data-act="font"]'); await p.goto(DIST + '#/ep/4'); await shot(p, '14-ep4-large');

  p = await page({ dark: true });
  await p.goto(DIST + '#/ep/4'); await shot(p, '20-dark-ep4', true);
  await p.goto(DIST + '#/toc'); await shot(p, '21-dark-toc');

  p = await page({ w: 360 });
  await p.goto(DIST + '#/ep/5'); await shot(p, '30-w360-ep5', true);
  await p.goto(DIST + '#/ep/1'); await shot(p, '31-w360-ep1', true);
  await p.goto(DIST + '#/glossary'); await shot(p, '32-w360-glossary');

  p = await page();
  await p.goto(DIST + '?print=1'); await shot(p, '40-printmode', true);
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: path.join(OUT, 'print-sample.pdf'), format: 'A5', printBackground: true, preferCSSPageSize: true });

  // localStorage 不可の環境
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const q = await ctx.newPage();
  q.on('pageerror', (e) => errors.push('nols: ' + e));
  await q.goto(DIST); await q.goto(DIST + '#/ep/4'); await q.click('[data-act="mark"]'); await shot(q, '50-no-storage');

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
})();
