// PDF出力: node build/pdf.cjs  （先に node build/build.mjs を実行）
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = 'file://' + path.join(ROOT, 'dist', 'index.html') + '?print=1';
const OUT = path.join(ROOT, 'dist', '投資のなぜがわかる本.pdf');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(SRC);
  await page.waitForFunction(() => window.__printReady === true, null, { timeout: 120000 });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.pdf({
    path: OUT,
    format: 'A5',
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#666;text-align:center;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await browser.close();
  console.log('出力:', OUT);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
})();
