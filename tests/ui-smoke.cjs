// Run in the prepared Codex environment: node tests/ui-smoke.cjs
// Requires Playwright and Chromium; the application itself has no package dependencies.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const KEY = 'mefit.favorites.v1';
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    page.on('pageerror', e => errors.push(e.message));
    const nav = name => page.locator('#nav').getByRole('button', { name, exact: true });
    const part = name => page.locator('#tabs').getByRole('button', { name: new RegExp(name) });
    const save = () => page.locator('#info').getByRole('button', { name: /お気に入り/ });

    assert.equal((await page.goto(url)).status(), 200);
    assert.equal(await page.locator('#nav button').count(), 3);
    assert.equal(await page.locator('#myV, #buyV').count(), 0);
    assert.equal(await page.getByText('合う色', { exact: true }).count(), 0);
    await nav('お気に入り').click();
    assert.match(await page.locator('#favV').innerText(), /まだお気に入りはありません/);
    await page.getByRole('button', { name: 'メイクを試す', exact: true }).click();
    assert.ok(await save().isDisabled());

    // Start with brows, then jump freely. No preceding part is required.
    await part('アイブロウ').click();
    await page.locator('#shades .sh').nth(1).click();
    await save().click();
    await part('チーク').click();
    await page.locator('#prods .pc').filter({ hasText: 'クリームチーク' }).click();
    await page.locator('#shades .sh').nth(2).click();
    await save().click();
    await part('リップ').click();
    await page.locator('#brands').getByRole('button', { name: 'OPERA', exact: true }).click();
    await page.locator('#shades .sh').nth(1).click();
    await save().click();
    await part('アイシャドウ').click();
    await page.locator('#shades .sh').nth(3).click();
    assert.deepEqual(await page.evaluate(() => Object.keys(S.ap).sort()), ['brow', 'cheek', 'eye', 'lip']);
    await part('チーク').click();
    assert.match(await page.locator('#prods .pc.on').innerText(), /クリームチーク/);
    assert.match(await page.locator('#shades .on').innerText(), /05/);
    await part('リップ').click();
    assert.match(await page.locator('#brands .on').innerText(), /OPERA/);
    assert.match(await page.locator('#shades .on').innerText(), /06/);
    assert.equal(await save().getAttribute('aria-pressed'), 'true');
    // A second color of the same product is independently saved.
    await page.locator('#shades .sh').first().click();
    await save().click();
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, KEY), 4);

    // Selections survive uploading a photo; clear one part without clearing others.
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 500;
      const x = c.getContext('2d'); x.fillStyle = '#dba78d'; x.fillRect(0, 0, 400, 500);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#file').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.locator('#cv').waitFor();
    for (const position of [{ x: 100, y: 130 }, { x: 250, y: 130 }, { x: 175, y: 270 }]) await page.locator('#cv').click({ position });
    assert.equal(await page.evaluate(() => S.pts.length), 3);
    assert.equal(await page.evaluate(() => Object.keys(S.ap).length), 4);
    const before = await page.locator('#cv').evaluate(c => c.toDataURL());
    await page.getByRole('button', { name: 'このパーツのメイクを外す', exact: true }).click();
    assert.notEqual(await page.locator('#cv').evaluate(c => c.toDataURL()), before);
    assert.deepEqual(await page.evaluate(() => Object.keys(S.ap).sort()), ['brow', 'cheek', 'eye']);
    await page.getByRole('button', { name: '元の顔と比べる', exact: true }).click();
    assert.equal(await page.evaluate(() => S.cmp), true);

    await nav('お気に入り').click();
    assert.equal(await page.locator('.favorite-card').count(), 4);
    const cards = await page.locator('.favorite-card').all();
    for (const card of cards) {
      const link = card.getByRole('link', { name: '購入先を探す' });
      const href = new URL(await link.getAttribute('href'));
      assert.equal(href.origin, 'https://www.google.com');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.ok(href.searchParams.get('q').length > 5);
    }
    assert.match(new URL(await cards[0].getByRole('link').getAttribute('href')).searchParams.get('q'), /KATE.*アイブロウ.*06/);
    await page.screenshot({ path: '/tmp/mefit-favorites.png', fullPage: true });

    // Storage is shared across tabs; closing and reopening pages retains favorites.
    const other = await context.newPage();
    await other.goto(url);
    await other.locator('#nav').getByRole('button', { name: 'お気に入り', exact: true }).click();
    await page.locator('.favorite-card').first().getByRole('button', { name: /お気に入りから削除/ }).click();
    await other.waitForFunction(() => document.querySelectorAll('.favorite-card').length === 3);
    await page.reload();
    await nav('お気に入り').click();
    assert.equal(await page.locator('.favorite-card').count(), 3);
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.ok(stored.every(f => Object.keys(f).sort().join(',') === 'cat,code,pid'));

    // Restore a favorite with a different brand filter previously selected.
    await nav('試す').click();
    await page.locator('#brands').getByRole('button', { name: 'KATE', exact: true }).click();
    await nav('お気に入り').click();
    await page.locator('.favorite-card').filter({ hasText: 'OPERA' }).first().getByRole('button', { name: 'もう一度試す' }).click();
    assert.match(await page.locator('#prods .pc.on').innerText(), /リップティント N/);
    assert.equal(await page.locator('#brands .on').innerText(), 'すべて');
    assert.match(await page.locator('#shades .on').innerText(), /06/);
    // Recommendation links must also clear a stale filter.
    await page.locator('#brands').getByRole('button', { name: 'KATE', exact: true }).click();
    await nav('おすすめ').click();
    await page.locator('#recV .li').filter({ hasText: 'OPERA' }).first().click();
    assert.match(await page.locator('#prods .pc.on').innerText(), /リップティント N/);

    // Custom colors remain independent, but cannot be saved as a named product.
    await page.locator('#brands').getByRole('button', { name: '自分で指定', exact: true }).click();
    await page.locator('input[type=color]').fill('#112233');
    await part('チーク').click();
    await part('リップ').click();
    assert.equal(await page.locator('input[type=color]').inputValue(), '#112233');
    assert.equal(await page.locator('#info').getByRole('button', { name: /お気に入り/ }).count(), 0);
    for (const width of [320, 390, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.locator('#tabs button').count(), 4);
    }
    await page.screenshot({ path: '/tmp/mefit-try.png', fullPage: true });
    // Empty state after removing all entries.
    await nav('お気に入り').click();
    while (await page.locator('.favorite-card').count()) await page.locator('.favorite-card').first().getByRole('button', { name: /お気に入りから削除/ }).click();
    await page.reload(); await nav('お気に入り').click();
    assert.match(await page.locator('#favV').innerText(), /まだお気に入りはありません/);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: 3 screens, arbitrary part selection, per-part memory, photo rendering, selective removal, comparison, favorites by shade, persistence, removal, cross-tab sync, restore/search links, custom colors, mobile layout.');

    // Corrupt or stale storage cannot break startup or inject markup.
    const invalid = await browser.newContext();
    const bad = await invalid.newPage();
    await bad.goto(url);
    await bad.evaluate(key => localStorage.setItem(key, '{broken'), KEY);
    await bad.reload();
    assert.match(await bad.locator('#notice').innerText(), /読み込めませんでした/);
    assert.equal(await bad.locator('#nav button').count(), 3);
    await bad.evaluate(key => localStorage.setItem(key, JSON.stringify([
      { cat: '__proto__', pid: 'x', code: 'x' }, null,
      { cat: 'lip', pid: 'lm', code: '01' }, { cat: 'lip', pid: 'lm', code: '01' },
      { cat: 'lip', pid: 'removed', code: '01' },
    ])), KEY);
    await bad.reload();
    await bad.locator('#nav').getByRole('button', { name: 'お気に入り', exact: true }).click();
    assert.equal(await bad.locator('.favorite-card').count(), 1);
    await invalid.close();

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'QuotaExceededError'); };
    });
    const noSave = await blocked.newPage(); await noSave.goto(url);
    await noSave.locator('#recV .li').first().click();
    await noSave.locator('#info').getByRole('button', { name: '♡ お気に入りに保存' }).click();
    assert.match(await noSave.locator('#notice').innerText(), /保存できませんでした/);
    assert.equal(await noSave.locator('#info').getByRole('button', { name: '♡ お気に入りに保存' }).getAttribute('aria-pressed'), 'false');
    await blocked.close();
    console.log('PASS: malformed/duplicate/stale storage, unavailable storage feedback without false save confirmation.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
