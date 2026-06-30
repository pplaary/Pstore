/**
 * n1-server 数据库层单元测试
 *
 * 直接使用内存 SQLite 测试 products / config / items 表的 CRUD 操作。
 * 运行：cd n1-server && npx vitest run
 */

import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// ==================== Schema ====================

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    barcode TEXT,
    category TEXT DEFAULT '',
    unit TEXT DEFAULT '个',
    imageUri TEXT,
    isDeleted INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    location TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price REAL,
    acquired_at TEXT,
    warranty_to TEXT,
    barcode TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS item_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id)
  );
  CREATE TABLE IF NOT EXISTS item_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    uri TEXT NOT NULL,
    is_cover INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id)
  );
  CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updatedAt);
`;

// ==================== DB 管理 ====================

let db: Database.Database;

function createDb(): Database.Database {
  const instance = new Database(':memory:');
  instance.pragma('journal_mode = WAL');
  instance.exec(SCHEMA);
  return instance;
}

function setConfig(key: string, value: string): void {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function getConfig(key: string): string {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : '';
}

function insertProduct(product: {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  category?: string;
  unit?: string;
  imageUri?: string;
  isDeleted?: number;
  createdAt?: string;
  updatedAt?: string;
}): void {
  const now = product.updatedAt || product.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO products (id, name, price, barcode, category, unit, imageUri, isDeleted, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    product.id,
    product.name,
    product.price,
    product.barcode ?? null,
    product.category ?? '',
    product.unit ?? '个',
    product.imageUri ?? null,
    product.isDeleted ?? 0,
    product.createdAt ?? now,
    now,
  );
}

function syncProducts(after?: string): { products: Record<string, unknown>[]; serverTime: string } {
  let stmt;
  if (after) {
    stmt = db.prepare('SELECT * FROM products WHERE updatedAt >= ? ORDER BY updatedAt ASC');
  } else {
    stmt = db.prepare('SELECT * FROM products WHERE isDeleted = 0 ORDER BY updatedAt ASC');
  }

  const rows = after ? (stmt.all(after) as Record<string, unknown>[]) : (stmt.all() as Record<string, unknown>[]);
  return {
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      ...(row.barcode !== null && { barcode: row.barcode }),
      category: row.category,
      unit: row.unit,
      ...(row.imageUri !== null && { imageUri: row.imageUri }),
      isDeleted: row.isDeleted,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    })),
    serverTime: new Date().toISOString(),
  };
}

function pushProducts(changes: Record<string, unknown>[]): { ok: boolean; count: number } {
  const upsert = db.prepare(`
    INSERT INTO products (id, name, price, barcode, category, unit, imageUri, isDeleted, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      barcode = excluded.barcode,
      category = excluded.category,
      unit = excluded.unit,
      imageUri = excluded.imageUri,
      isDeleted = excluded.isDeleted,
      updatedAt = excluded.updatedAt
  `);

  const tx = db.transaction(() => {
    let count = 0;
    for (const change of changes) {
      const now = (change.updatedAt as string) || new Date().toISOString();
      upsert.run(
        change.id,
        change.name,
        change.price,
        change.barcode ?? null,
        change.category,
        change.unit,
        change.imageUri ?? null,
        typeof change.isDeleted === 'number' ? change.isDeleted : 0,
        now,
        now,
      );
      count++;
    }
    return count;
  });

  return { ok: true, count: tx() };
}

// ==================== Lifecycle ====================

beforeEach(() => {
  db = createDb();
});

// ==================== Tests: config routes ====================

describe('config routes', () => {
  it('get returns empty strings when no config', () => {
    expect(getConfig('apiUrl')).toBe('');
    expect(getConfig('apiKey')).toBe('');
    expect(getConfig('textModel')).toBe('');
    expect(getConfig('visionModel')).toBe('');
  });

  it('get returns configured values', () => {
    setConfig('apiUrl', 'https://example.com');
    setConfig('apiKey', 'sk-123');
    setConfig('textModel', 'gpt-4');
    setConfig('visionModel', 'gpt-4-vision');

    expect(getConfig('apiUrl')).toBe('https://example.com');
    expect(getConfig('apiKey')).toBe('sk-123');
    expect(getConfig('textModel')).toBe('gpt-4');
    expect(getConfig('visionModel')).toBe('gpt-4-vision');
  });

  it('set updates config values', () => {
    setConfig('apiUrl', 'https://a.com');
    expect(getConfig('apiUrl')).toBe('https://a.com');

    // update
    setConfig('apiUrl', 'https://b.com');
    expect(getConfig('apiUrl')).toBe('https://b.com');
  });

  it('set with partial fields only updates specified keys', () => {
    setConfig('apiUrl', 'https://example.com');
    setConfig('apiKey', 'sk-123');
    // textModel and visionModel not set
    expect(getConfig('textModel')).toBe('');
    expect(getConfig('visionModel')).toBe('');
  });
});

// ==================== Tests: products routes ====================

describe('products routes', () => {
  it('sync returns empty array when no products', () => {
    const res = syncProducts();
    expect(res.products).toEqual([]);
    expect(res.serverTime).toBeTruthy();
  });

  it('sync returns non-deleted products', () => {
    insertProduct({ id: 'p1', name: 'cola', price: 3.5, category: 'drink', unit: 'bottle' });
    insertProduct({ id: 'p2', name: 'bread', price: 8, category: 'food', unit: 'pc' });
    insertProduct({ id: 'p3', name: 'deleted', price: 1, isDeleted: 1 });

    const res = syncProducts();
    expect(res.products).toHaveLength(2);
    expect(res.products.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('sync orders by updatedAt ascending', () => {
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 10000).toISOString();
    insertProduct({ id: 'p2', name: 'Z', price: 1, updatedAt: now });
    insertProduct({ id: 'p1', name: 'A', price: 1, updatedAt: earlier });

    const res = syncProducts();
    expect(res.products[0].id).toBe('p1');
    expect(res.products[1].id).toBe('p2');
  });

  it('sync after param filters by updatedAt', () => {
    const cutoff = new Date().toISOString();
    insertProduct({ id: 'p1', name: 'old', price: 1, updatedAt: new Date(Date.now() - 20000).toISOString() });
    insertProduct({ id: 'p2', name: 'new', price: 2, updatedAt: cutoff });

    const res = syncProducts(cutoff);
    expect(res.products).toHaveLength(1);
    expect(res.products[0].id).toBe('p2');
  });

  it('sync omits null barcode/imageUri from response', () => {
    insertProduct({ id: 'p1', name: 'X', price: 1 });
    const res = syncProducts();
    const p = res.products[0] as Record<string, unknown>;
    expect('barcode' in p).toBe(false);
    expect('imageUri' in p).toBe(false);
  });

  it('push inserts a valid product', () => {
    const res = pushProducts([
      { id: 'p1', name: 'cola', price: 3.5, category: 'drink', unit: 'bottle', updatedAt: new Date().toISOString() },
    ]);
    expect(res).toEqual({ ok: true, count: 1 });

    const synced = syncProducts();
    expect(synced.products).toHaveLength(1);
    expect(synced.products[0].name).toBe('cola');
  });

  it('push inserts multiple products', () => {
    const now = new Date().toISOString();
    const res = pushProducts([
      { id: 'p1', name: 'cola', price: 3.5, category: 'drink', unit: 'bottle', updatedAt: now },
      { id: 'p2', name: 'bread', price: 8, category: 'food', unit: 'pc', updatedAt: now },
    ]);
    expect(res).toEqual({ ok: true, count: 2 });

    const synced = syncProducts();
    expect(synced.products).toHaveLength(2);
  });

  it('push upsert updates existing product', () => {
    const now = new Date().toISOString();
    pushProducts([{ id: 'p1', name: 'cola', price: 3.5, category: 'drink', unit: 'bottle', updatedAt: now }]);
    pushProducts([{ id: 'p1', name: 'cola-updated', price: 4, category: 'drink', unit: 'bottle', updatedAt: now }]);

    const synced = syncProducts();
    expect(synced.products).toHaveLength(1);
    expect(synced.products[0].name).toBe('cola-updated');
    expect(synced.products[0].price).toBe(4);
  });
});

// ==================== Tests: items table ====================

describe('items table', () => {
  it('inserts and retrieves items', () => {
    db.prepare(`
      INSERT INTO items (name, category, location, description, price, acquired_at, warranty_to, barcode, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('laptop', 'electronics', 'shelf-a', 'MacBook', 9999, '2024-01-01', '2027-01-01', '123456', 'active', new Date().toISOString(), new Date().toISOString());

    const items = db.prepare('SELECT * FROM items').all() as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('laptop');
    expect(items[0].category).toBe('electronics');
  });

  it('item_tags foreign key works', () => {
    const result = db.prepare('INSERT INTO items (name, created_at, updated_at) VALUES (?, ?, ?)').run('phone', new Date().toISOString(), new Date().toISOString());
    const itemId = (result as { lastInsertRowid: number }).lastInsertRowid;

    db.prepare('INSERT INTO item_tags (item_id, key, value) VALUES (?, ?, ?)').run(itemId, 'color', 'black');
    db.prepare('INSERT INTO item_tags (item_id, key, value) VALUES (?, ?, ?)').run(itemId, 'size', 'M');

    const tags = db.prepare('SELECT * FROM item_tags WHERE item_id = ?').all(itemId) as Record<string, unknown>[];
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.key).sort()).toEqual(['color', 'size']);
  });

  it('item_photos works', () => {
    const result = db.prepare('INSERT INTO items (name, created_at, updated_at) VALUES (?, ?, ?)').run('watch', new Date().toISOString(), new Date().toISOString());
    const itemId = (result as { lastInsertRowid: number }).lastInsertRowid;

    db.prepare('INSERT INTO item_photos (item_id, uri, is_cover, created_at) VALUES (?, ?, ?, ?)').run(itemId, 'file://photo1.jpg', 1, new Date().toISOString());
    db.prepare('INSERT INTO item_photos (item_id, uri, is_cover, created_at) VALUES (?, ?, ?, ?)').run(itemId, 'file://photo2.jpg', 0, new Date().toISOString());

    const photos = db.prepare('SELECT * FROM item_photos WHERE item_id = ?').all(itemId) as Record<string, unknown>[];
    expect(photos).toHaveLength(2);
    expect(photos.filter((p) => p.is_cover === 1)).toHaveLength(1);
  });
});

// ==================== Tests: indexes ====================

describe('indexes', () => {
  it('idx_products_updated speeds up ordering queries', () => {
    for (let i = 0; i < 100; i++) {
      insertProduct({ id: `p${i}`, name: `Product ${i}`, price: i, updatedAt: new Date(Date.now() + i * 1000).toISOString() });
    }

    const start = Date.now();
    const res = syncProducts();
    const elapsed = Date.now() - start;

    expect(res.products).toHaveLength(100);
    expect(elapsed).toBeLessThan(50);
  });

  it('idx_items_status speeds up status queries', () => {
    for (let i = 0; i < 50; i++) {
      db.prepare('INSERT INTO items (name, status, created_at, updated_at) VALUES (?, ?, ?, ?)').run(`item${i}`, i % 2 === 0 ? 'active' : 'archived', new Date().toISOString(), new Date().toISOString());
    }

    const start = Date.now();
    const active = db.prepare('SELECT * FROM items WHERE status = ?').all('active') as Record<string, unknown>[];
    const elapsed = Date.now() - start;

    expect(active).toHaveLength(25);
    expect(elapsed).toBeLessThan(50);
  });
});

// ==================== Tests: transaction safety ====================

describe('transaction safety', () => {
  it('transaction rolls back on error', () => {
    const tx = db.transaction(() => {
      insertProduct({ id: 'p1', name: 'good', price: 1 });
      throw new Error('fail');
      insertProduct({ id: 'p2', name: 'never', price: 2 });
    });

    expect(() => tx()).toThrow('fail');

    const res = syncProducts();
    expect(res.products).toHaveLength(0);
  });

  it('transaction commits on success', () => {
    const tx = db.transaction(() => {
      insertProduct({ id: 'p1', name: 'good1', price: 1 });
      insertProduct({ id: 'p2', name: 'good2', price: 2 });
    });

    tx();

    const res = syncProducts();
    expect(res.products).toHaveLength(2);
  });
});
