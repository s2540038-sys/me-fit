'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Catalog = require('../catalog');
const api = require('../api/catalog');
const payload = require('../data/catalog.json');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const base = vm.runInNewContext(html.slice(html.indexOf('const D='), html.indexOf('const S=')) + ';D');
const result = Catalog.merge(payload.tables, base);
const products = Object.values(result.data).flatMap(d => d.items).filter(p => p.id !== 'cu');
assert.equal(products.length, 121);
assert.equal(products.reduce((n, p) => n + p.sh.length, 0), 839);
assert.equal(products.reduce((n, p) => n + p.sh.filter(s => Catalog.isColor(s[2])).length, 0), 819);
assert.equal(Object.values(base).flatMap(d => d.items).filter(p => p.id !== 'cu').length, 8, 'Merge must not mutate the original');
const again = Catalog.merge(payload.tables, result.data);
assert.deepEqual(again.data, result.data, 'Reimport must not duplicate shades');
assert.ok(products.find(p => p.id === 'rj'), 'Keep the old product omitted from the workbook');
assert.ok(products.find(p => p.id === 'cc').sh.some(s => s[0] === '02'), 'Keep the old color omitted from the workbook');
assert.equal(products.find(p => p.id === 'p0052').sh[0][2], null, 'Unknown colors stay unknown');
assert.equal(products.find(p => p.id === 'p0049').sh.filter(s => s[0].startsWith('@')).length, 5, 'Name-only shades need distinct keys');
const references = require('../data/reference-colors.json');
assert.equal(references.entries.length, 767);
assert.equal(references.unresolved.length, 20);
for (const entry of references.entries) {
  const color = payload.tables.shade_colors.find(c => c.shade_id === entry.shade_id);
  assert.equal(color.color_hex, entry.color_hex);
  assert.ok(Catalog.safeUrl(color.color_source_url));
  assert.ok(['official_value', 'swatch_estimate'].includes(color.color_method));
}
for (const category of Object.keys(base)) for (const legacy of base[category].items) {
  if (legacy.id === 'cu') continue;
  const current = products.find(p => p.id === legacy.id);
  for (const shade of legacy.sh) assert.equal(current.sh.find(s => s[0] === shade[0])[2], shade[2], 'Preserve every legacy color');
}
assert.equal(products.find(p => p.id === 'p0001').shadeMeta['01'].colorMethod, 'swatch_estimate');
assert.equal(products.find(p => p.id === 'p0050').shadeMeta['905'].colorMethod, 'official_value');
const malformed = structuredClone(payload.tables);
malformed.shades[0].product_id = 'missing';
assert.throws(() => Catalog.merge(malformed, base));
const injection = structuredClone(payload.tables);
injection.products[0].name = '<img src=x onerror="window.pwned=1">';
injection.products[0].source_url = 'javascript:alert(1)';
const p = Catalog.merge(injection, base).data.brow.items.find(p => p.id === 'p0001');
assert.equal(p.sourceUrl, '');
assert.ok(!Catalog.escape(p.n).includes('<img'));
assert.equal(Catalog.safeUrl('https://user:pass@example.com'), '');
const anon = 'e30.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.signature';
const admin = 'e30.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
const configured = api.connection({});
assert.ok(!configured || configured.url.startsWith('https://'));
assert.ok(!configured || configured.key.startsWith('sb_publishable_'));
assert.equal(api.connection({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: anon }).key, anon);
assert.throws(() => api.connection({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: admin }));
assert.throws(() => api.connection({ SUPABASE_URL: 'http://localhost', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }));
(async () => {
  let requests = 0;
  const tables = await api.loadTables({ url: 'https://example.supabase.co', key: anon }, async (url, options) => {
    requests++;
    const name = new URL(url).pathname.split('/').pop();
    assert.equal(options.headers.apikey, anon);
    assert.ok(options.signal);
    // Test a multi-page shade table, beyond the default Supabase 1000-row limit.
    if (name === 'shades') return { ok: true, json: async () => options.headers.Range === '0-999' ? Array.from({ length: 1000 }, (_, id) => ({ id })) : [{ id: 1000 }] };
    return { ok: true, json: async () => payload.tables[name] };
  });
  assert.equal(tables.shades.length, 1001);
  assert.equal(requests, 6);
  await assert.rejects(api.loadTables({ url: 'https://example.supabase.co', key: anon }, async () => ({ ok: false })));
  const output = [];
  const res = { setHeader() {}, end(text) { output.push(JSON.parse(text)); } };
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('Simulated network failure'); };
    await api({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(output[0].source, 'snapshot');
    assert.equal(output[0].tables.products.length, 120);
    assert.equal(JSON.stringify(output).includes('SUPABASE_ACCESS_TOKEN'), false);
    if (configured) {
      assert.equal(output[0].degraded, true);
      global.fetch = async (url, options) => {
        assert.equal(new URL(url).origin, configured.url);
        assert.equal(options.headers.apikey, configured.key);
        const name = new URL(url).pathname.split('/').pop();
        return { ok: true, json: async () => payload.tables[name] };
      };
      await api({ method: 'GET' }, res);
      assert.equal(output[1].source, 'supabase');
      assert.equal(output[1].tables.products.length, 120);
      assert.equal(output[1].tables.shades.length, 827);
      assert.equal(JSON.stringify(output[1]).includes(configured.key), false);
    }
  } finally { global.fetch = originalFetch; }
  console.log('PASS: 120 imported + preserved legacy catalog, idempotence, unknown colors, name-only shades, referential integrity, HTML escaping, public-key restrictions, pagination, snapshot fallback.');
})().catch(e => { console.error(e); process.exitCode = 1; });
