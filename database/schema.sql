-- Portable base schema for PostgreSQL/Supabase or local SQLite.
-- Applying this file creates empty tables; it does not collect product data.
CREATE TABLE brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    official_url TEXT
);

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('brow', 'cheek', 'eye', 'lip')),
    product_type TEXT,
    price_tier TEXT CHECK (price_tier IN ('budget', 'midrange', 'prestige')),
    price_jpy INTEGER CHECK (price_jpy >= 0),
    price_basis TEXT,
    release_date_jp DATE,
    sales_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (sales_status IN ('active', 'discontinued', 'unknown')),
    cosme_product_id TEXT UNIQUE,
    source_url TEXT NOT NULL,
    verified_at TIMESTAMP NOT NULL,
    UNIQUE (brand_id, name, category)
);

CREATE TABLE shades (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    shade_code TEXT,
    name TEXT,
    release_date_jp DATE,
    is_limited BOOLEAN,
    finish TEXT,
    source_url TEXT NOT NULL,
    verified_at TIMESTAMP NOT NULL
);

-- A palette shade can contain several colors. Missing color measurements
-- must remain NULL; do not invent colors from product names.
CREATE TABLE shade_colors (
    id TEXT PRIMARY KEY,
    shade_id TEXT NOT NULL REFERENCES shades(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    color_hex TEXT CHECK (color_hex IS NULL OR
        (length(color_hex) = 7 AND substr(color_hex, 1, 1) = '#')),
    color_source_url TEXT,
    color_method TEXT CHECK (color_method IN
        ('official_value', 'swatch_estimate', 'manual_calibration')),
    opacity REAL CHECK (opacity BETWEEN 0 AND 1),
    UNIQUE (shade_id, position),
    CHECK (color_hex IS NULL OR
        (color_source_url IS NOT NULL AND color_method IS NOT NULL))
);

-- Awards and rankings are evidence, not interchangeable popularity scores.
-- Compare ranks only within the same source category, period and list.
CREATE TABLE popularity_evidence (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    source_name TEXT NOT NULL DEFAULT '@cosme',
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('ranking', 'award')),
    list_name TEXT NOT NULL,
    source_category TEXT NOT NULL,
    rank INTEGER CHECK (rank > 0),
    award_name TEXT,
    period_label TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    source_url TEXT NOT NULL,
    observed_at TIMESTAMP NOT NULL,
    CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
    CHECK ((evidence_type = 'ranking' AND rank IS NOT NULL)
        OR (evidence_type = 'award' AND award_name IS NOT NULL))
);

CREATE INDEX products_category_price ON products(category, price_jpy);
CREATE INDEX products_category_release ON products(category, release_date_jp);
CREATE INDEX shades_product ON shades(product_id);
CREATE INDEX evidence_product ON popularity_evidence(product_id);
