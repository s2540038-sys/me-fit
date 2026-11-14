'use strict';
const snapshot = require('../data/catalog.json');
const publicConfig = require('../data/supabase-public.json');
const selections = {
  brands: 'id,name,official_url',
  products: 'id,brand_id,name,category,product_type,price_tier,price_jpy,price_basis,release_date_jp,sales_status,cosme_product_id,source_url,verified_at',
  shades: 'id,product_id,shade_code,name,release_date_jp,is_limited,finish,source_url,verified_at',
  shade_colors: 'id,shade_id,position,color_hex,color_source_url,color_method,opacity',
  popularity_evidence: 'id,product_id,source_name,evidence_type,list_name,source_category,rank,award_name,period_label,period_start,period_end,source_url,observed_at',
};
function connection(env) {
  const url = env.SUPABASE_URL || publicConfig.url;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || publicConfig.publishableKey;
  if (!url && !key) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password) throw new Error('Invalid Supabase URL');
  if (typeof key !== 'string') throw new Error('Missing public key');
  if (!key.startsWith('sb_publishable_')) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Reject unknown keys. */ }
    if (role !== 'anon') throw new Error('Only public read keys are allowed');
  }
  return { url: parsed.origin, key };
}
async function loadTables(config, request = fetch) {
  return Object.fromEntries(await Promise.all(Object.entries(selections).map(async ([name, select]) => {
    const rows = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const res = await request(`${config.url}/rest/v1/${name}?select=${select}&order=id.asc`, {
        headers: { apikey: config.key, 'Range-Unit': 'items', Range: `${offset}-${offset + 999}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error('Catalog request failed');
      const part = await res.json();
      if (!Array.isArray(part)) throw new Error('Invalid table response');
      rows.push(...part);
      if (part.length < 1000) return [name, rows];
    }
    throw new Error('Catalog exceeds page limit');
  })));
}
async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; return res.end(); }
  let body;
  try {
    const config = connection(process.env);
    if (!config) body = { ...snapshot, source: 'snapshot' };
    else {
      const tables = await loadTables(config);
      if (!tables.products.length || !tables.shades.length || !tables.brands.length) throw new Error('Empty catalog');
      body = { version: 1, source: 'supabase', tables };
    }
  } catch {
    // Keep the last published workbook available without exposing connection details.
    body = { ...snapshot, source: 'snapshot', degraded: true };
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', body.degraded ? 'no-store' : 'public, max-age=60, s-maxage=60');
  res.end(JSON.stringify(body));
}
module.exports = handler;
module.exports.connection = connection;
module.exports.loadTables = loadTables;
