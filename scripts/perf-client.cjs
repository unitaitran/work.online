// Đo hiệu năng client (Phase 7): tải ban đầu với CPU chậm 4 lần, kích thước JS tải về,
// draw call, bộ nhớ sau một phiên chơi dài (đi lại, mở/đóng cửa sổ, chuyển phòng, sửa thẻ).
//
//   node scripts/perf-client.cjs [url=http://localhost:4173] [phút=3]
//
// Cần Playwright (npx playwright install chromium nếu máy chưa có) và server + client đang chạy.
const { chromium } = require('playwright');

const URL_BASE = process.argv[2] ?? 'http://localhost:4173';
const MINUTES = Number(process.argv[3] ?? 3);

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let jsBytes = 0;
  let cssBytes = 0;
  const lazyChunks = new Set();
  page.on('response', async (res) => {
    const url = res.url();
    const type = res.headers()['content-type'] ?? '';
    try {
      const len = (await res.body()).length;
      if (type.includes('javascript')) {
        jsBytes += len;
        lazyChunks.add(url.split('/').pop());
      }
      if (type.includes('css')) cssBytes += len;
    } catch {
      // bỏ qua
    }
  });
  const t0 = Date.now();
  await page.goto(`${URL_BASE}/?debug`);
  await page.waitForSelector('.creator-enter', { timeout: 60000 });
  const loadMs = Date.now() - t0;
  const initialJs = jsBytes;
  await page.click('.creator-enter');
  await page.waitForSelector('.office-badge', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.click('.modal .button-primary').catch(() => undefined);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const stats = async () =>
    page.evaluate(() => ({
      ...window.__dilam.stats(),
      mem: window.__dilam.memory(),
      heapMb: Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10,
      domNodes: document.getElementsByTagName('*').length,
    }));
  const start = await stats();
  // Phiên chơi dài: lặp các thao tác hay gây rò rỉ.
  const until = Date.now() + MINUTES * 60_000;
  let loops = 0;
  while (Date.now() < until) {
    loops += 1;
    for (const key of ['w', 'd', 's', 'a']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
    }
    for (const button of ['.shop-button', '.social-button', '.more-button']) {
      await page.click(button).catch(() => undefined);
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
    }
    await page.click('.office-badge').catch(() => undefined);
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    if (loops % 3 === 0) {
      // Sửa thẻ rồi vào lại văn phòng (dựng lại cả cảnh).
      await page.click('button:has-text("Sửa thẻ")').catch(() => undefined);
      await page.waitForTimeout(800);
      await page.click('.creator-enter').catch(() => undefined);
      await page.waitForTimeout(1500);
    }
  }
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const end = await stats();
  console.log(
    JSON.stringify(
      {
        loadMsCpu4x: loadMs,
        initialJsKB: Math.round(initialJs / 1024),
        totalJsKB: Math.round(jsBytes / 1024),
        cssKB: Math.round(cssBytes / 1024),
        chunks: [...lazyChunks],
        start: {
          drawCalls: start.drawCalls,
          geometries: start.mem.geometries,
          textures: start.mem.textures,
          heapMb: start.heapMb,
          domNodes: start.domNodes,
        },
        end: {
          drawCalls: end.drawCalls,
          geometries: end.mem.geometries,
          textures: end.mem.textures,
          heapMb: end.heapMb,
          domNodes: end.domNodes,
        },
        minutes: MINUTES,
        loops,
      },
      null,
      2,
    ),
  );
  await browser.close();
})();
