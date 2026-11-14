(function (root) {
  'use strict';
  const categories = ['lip', 'cheek', 'eye', 'brow'];
  const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const id = value => typeof value === 'string' && /^[a-z0-9_]+$/i.test(value);
  const safeUrl = value => {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
    catch { return ''; }
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function merge(tables, previous) {
    if (!tables || !['brands', 'products', 'shades', 'shade_colors', 'popularity_evidence'].every(k => Array.isArray(tables[k]))) throw new Error('Invalid catalog tables');
    if (!tables.products.length || !tables.brands.length || !tables.shades.length) throw new Error('Empty catalog');
    const brands = new Map();
    for (const b of tables.brands) {
      if (!id(b.id) || typeof b.name !== 'string' || !b.name || brands.has(b.id)) throw new Error('Invalid brand');
      brands.set(b.id, b.name);
    }
    const products = new Map();
    for (const p of tables.products) {
      if (!id(p.id) || p.id === 'cu' || !categories.includes(p.category) || !brands.has(p.brand_id) || typeof p.name !== 'string' || !p.name || products.has(p.id)) throw new Error('Invalid product');
      if (p.price_jpy !== null && (!Number.isInteger(p.price_jpy) || p.price_jpy < 0)) throw new Error('Invalid price');
      products.set(p.id, p);
    }
    const shades = new Map();
    for (const s of tables.shades) {
      if (!id(s.id) || !products.has(s.product_id) || shades.has(s.id) || !(s.shade_code || s.name)) throw new Error('Invalid shade');
      shades.set(s.id, s);
    }
    const colors = new Map();
    for (const c of tables.shade_colors) {
      if (!shades.has(c.shade_id) || !Number.isInteger(c.position) || c.position < 0 || !isColor(c.color_hex)) throw new Error('Invalid shade color');
      // The current renderer uses one representative color, not a palette's multiple colors.
      if (c.position === 0) colors.set(c.shade_id, c.color_hex);
    }
    for (const e of tables.popularity_evidence) if (!products.has(e.product_id) || !['ranking', 'award'].includes(e.evidence_type)) throw new Error('Invalid popularity reference');
    const result = structuredClone(previous);
    let addedProducts = 0, addedShades = 0;
    for (const p of products.values()) {
      const list = result[p.category].items;
      let item = list.find(x => x.id === p.id);
      if (!item) {
        item = { id: p.id, sh: [] };
        list.splice(list.findIndex(x => x.id === 'cu'), 0, item);
        addedProducts++;
      }
      const existingMetadata = item.shadeMeta || {};
      item.b = brands.get(p.brand_id); item.n = p.name;
      item.priceValue = p.price_jpy; item.price = p.price_jpy === null ? '' : `¥${p.price_jpy.toLocaleString('ja-JP')}`;
      item.releaseDate = p.release_date_jp;
      item.sourceUrl = safeUrl(p.source_url); item.verifiedAt = p.verified_at;
      item.evidence = tables.popularity_evidence.filter(e => e.product_id === p.id).map(e => ({ ...e, source_url: safeUrl(e.source_url) }));
      item.tag = item.evidence.some(e => e.evidence_type === 'award') ? '受賞歴あり' : item.evidence.length ? 'ランキング掲載歴あり' : '';
      item.shadeMeta = existingMetadata;
      for (const s of shades.values()) {
        if (s.product_id !== p.id) continue;
        // Name-only shades have their immutable ID as an internal lookup key.
        const code = s.shade_code || `@${s.id}`;
        const index = item.sh.findIndex(x => x[0] === code);
        const old = index < 0 ? null : item.sh[index];
        const color = colors.get(s.id) || (old && isColor(old[2]) ? old[2] : null);
        const row = [code, s.name || '', color];
        item.shadeMeta[code] = { id: s.id, code: s.shade_code || '', sourceUrl: safeUrl(s.source_url), legacyColor: !colors.has(s.id) && !!color };
        if (index < 0) { item.sh.push(row); addedShades++; } else item.sh[index] = row;
      }
      if (!item.sh.length) throw new Error('Product without shades');
      item.c = item.sh.find(s => isColor(s[2]))?.[2] || null;
    }
    return { data: result, addedProducts, addedShades };
  }
  const api = { merge, isColor, safeUrl, escape };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Catalog = api;
})(typeof globalThis === 'object' ? globalThis : this);
