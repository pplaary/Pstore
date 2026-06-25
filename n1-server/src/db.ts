import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = new Database(path.join(DATA_DIR, 'n1.db'));
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
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

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updatedAt);

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

  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_photos_item_id ON item_photos(item_id);
`);

export type ProductRow = {
  id: string;
  name: string;
  price: number;
  barcode: string | null;
  category: string;
  unit: string;
  imageUri: string | null;
  isDeleted: number;
  createdAt: string;
  updatedAt: string;
};

export type PushChange = {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  category: string;
  unit: string;
  imageUri?: string;
  isDeleted: number;
  updatedAt: string;
};

export type ItemRow = {
  id: number;
  name: string;
  category: string;
  location: string;
  description: string;
  price: number | null;
  acquired_at: string | null;
  warranty_to: string | null;
  barcode: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ItemTagRow = {
  id: number;
  item_id: number;
  key: string;
  value: string;
};

export type ItemPhotoRow = {
  id: number;
  item_id: number;
  uri: string;
  is_cover: number;
  created_at: string;
};

export { db };
