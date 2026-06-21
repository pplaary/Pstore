import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/data';
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

export { db };
