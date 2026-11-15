const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const payload = require('../data/catalog.json');
const root = path.join(__dirname, '..');
let mode = 'normal';
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/api/catalog' && mode === 'normal') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ...payload, source: 'snapshot' })); }
  const filename = ({ '/': 'index.html', '/catalog.js': 'catalog.js', '/data/catalog.json': 'data/catalog.json' })[req.url];
  if (filename && !(mode === 'offline' && filename.endsWith('.json'))) {
    res.writeHead(200, { 'Content-Type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(root, filename)));
  }
  res.writeHead(404); res.end();
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const ready = async () => { await page.goto(url); await page.waitForFunction(() => window.catalogReady === true); };
    await ready();
    assert.match(await page.locator('#catalog-status').innerText(), /121商品・839色番/);
    assert.equal(await page.locator('#recV .li').count(), 121);
    await page.locator('#catalog-search').fill('フィットスタイラーアイブロウ');
    assert.equal(await page.locator('#recV .li').count(), 1);
    await page.locator('#recV .li').click();
    assert.match(await page.locator('#info').innerText(), /公式色見本から採った推定色/);
    assert.match(await page.evaluate(() => S.ap.brow), /^#[0-9A-F]{6}$/);
    assert.equal(await page.locator('[data-color-source]').getAttribute('href'), payload.tables.shade_colors.find(c => c.shade_id === 'p0001_01').color_source_url);
    await page.getByRole('button', { name: '♡ お気に入りに保存', exact: true }).click();
    await ready();
    await page.locator('#nav').getByRole('button', { name: 'お気に入り', exact: true }).click();
    assert.equal(await page.locator('.favorite-card').count(), 1, 'Imported favorites survive reload');
    assert.match(await page.locator('.favorite-card').innerText(), /フィットスタイラー/);
    await page.locator('#nav').getByRole('button', { name: 'おすすめ', exact: true }).click();
    await page.locator('#catalog-search').fill('水彩チーク');
    await page.locator('#recV .li').click();
    assert.match(await page.locator('#info').innerText(), /顔への色の反映にはまだ対応していません/);
    assert.equal(await page.evaluate(() => S.ap.cheek), undefined);
    await page.locator('#nav').getByRole('button', { name: 'おすすめ', exact: true }).click();
    await page.locator('#catalog-search').fill('ジュ コントゥラスト アンタンス');
    await page.locator('#recV .li').click();
    assert.equal(await page.locator('#shades .sh').count(), 5);
    assert.ok(!(await page.locator('#shades').innerText()).includes('@p0049'));
    await page.locator('#shades .sh').nth(1).click();
    await page.getByRole('button', { name: '♡ お気に入りに保存', exact: true }).click();
    await page.locator('#nav').getByRole('button', { name: 'お気に入り', exact: true }).click();
    const card = page.locator('.favorite-card').filter({ hasText: 'CHANEL' });
    const search = new URL(await card.getByRole('link', { name: '購入先を探す' }).getAttribute('href')).searchParams.get('q');
    assert.ok(!search.includes('@p0049'));
    await page.locator('#nav').getByRole('button', { name: 'おすすめ', exact: true }).click();
    await page.locator('#catalog-search').fill('');
    for (const [sort, direction] of [['priceAsc', 1], ['priceDesc', -1]]) {
      await page.locator('#catalog-sort').selectOption(sort);
      const values = await page.evaluate(() => [...document.querySelectorAll('#recV .li')].map(el => allProducts().find(({ p }) => p.id === el.dataset.pid).p.priceValue));
      let unknown = false, previous;
      for (const value of values) {
        if (value == null) { unknown = true; continue; }
        assert.equal(unknown, false, 'Unknown prices must be last');
        if (previous !== undefined) assert.ok(direction * (value - previous) >= 0);
        previous = value;
      }
    }
    await page.locator('#catalog-sort').selectOption('new');
    assert.match(await page.locator('#recV').innerText(), /発売日未登録/);
    await page.locator('#catalog-search').fill('超細芯アイブロウ');
    await page.locator('#recV .li').click();
    await page.locator('#info summary').click();
    assert.match(await page.locator('#info details').innerText(), /2025\/11\/01.*2026\/01\/31/);
    assert.match(await page.locator('#info details').innerText(), /現在の順位ではありません/);
    await page.screenshot({ path: '/tmp/mefit-imported-product.png', fullPage: true });
    // Render untrusted uploaded content as text, including names containing quotes.
    const hostile = structuredClone(payload);
    hostile.tables.products[0].name = '<img src=x onerror="window.pwned=1">';
    hostile.tables.products[0].source_url = 'javascript:window.pwned=1';
    hostile.tables.brands[0].name = 'Brand\'\"><img src=x onerror="window.pwned=1">';
    await page.route('**/api/catalog', route => route.fulfill({ json: { ...hostile, source: 'supabase' } }));
    await ready();
    assert.match(await page.locator('#catalog-status').innerText(), /取得済み/);
    await page.locator('#catalog-search').fill('<img');
    await page.locator('#recV .li').first().click();
    assert.equal(await page.locator('#info img, #brands img, #prods img').count(), 0);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator('#info a[href^="javascript:"]').count(), 0);
    await page.unroute('**/api/catalog');
    mode = 'static';
    await page.route('**/api/catalog', route => route.abort());
    await ready();
    assert.match(await page.locator('#catalog-status').innerText(), /121商品/);
    mode = 'offline';
    await page.route('**/data/catalog.json', route => route.abort());
    await ready();
    assert.match(await page.locator('#catalog-status').innerText(), /以前からの登録商品/);
    assert.equal(await page.locator('#recV .li').count(), 8);
    assert.deepEqual(errors, []);
    console.log('PASS: imported catalog, product search, unknown-color selection/favorites, name-only shades, price/date sorting, contextual awards, stored favorites after reload, HTML injection protection, static/offline fallback.');
  } finally { await b.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
