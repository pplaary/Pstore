import { db } from '../db';
import type { QueryResponseStyle } from './types';

export interface ItemRecord {
  id: number;
  name: string;
  category: string | null;
  location: string | null;
  description: string | null;
  price: number | null;
  acquired_at: string | null;
  warranty_to: string | null;
  barcode: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToItem(row: ItemRecord) {
  return {
    ...row,
    category: row.category || '',
    location: row.location || '',
    description: row.description || '',
    acquired_at: row.acquired_at || '',
    warranty_to: row.warranty_to || '',
    barcode: row.barcode || '',
    status: row.status || 'active',
    price: row.price || 0,
  };
}

export type ItemType = ReturnType<typeof rowToItem>;

export function normalizeExpiringDays(value: unknown) {
  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  return 30;
}

export function normalizeQueryResponseStyle(value: unknown): QueryResponseStyle {
  return value === 'detailed' ? 'detailed' : 'concise';
}

export function getDateBoundaries(expiringDays = 30) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const future = new Date(today);
  future.setDate(future.getDate() + expiringDays);
  const in30daysStr = future.toISOString().slice(0, 10);

  return { todayStr, in30daysStr };
}

export function getItemWarrantyState(
  item: ItemType,
  todayStr: string,
  in30daysStr: string,
) {
  if (!item.warranty_to) {
    return 'unknown' as const;
  }

  if (item.warranty_to < todayStr) {
    return 'expired' as const;
  }

  if (item.warranty_to <= in30daysStr) {
    return 'expiring' as const;
  }

  return 'ok' as const;
}

export function normalizeItemDraftPayload(parsed: Record<string, unknown>) {
  return {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    category: typeof parsed.category === 'string' ? parsed.category : '',
    location: typeof parsed.location === 'string' ? parsed.location : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    price: typeof parsed.price === 'string' ? parsed.price : '',
    acquired_at: typeof parsed.acquired_at === 'string' ? parsed.acquired_at : '',
    warranty_to: typeof parsed.warranty_to === 'string' ? parsed.warranty_to : '',
    barcode: typeof parsed.barcode === 'string' ? parsed.barcode : '',
    status: typeof parsed.status === 'string' ? parsed.status : 'active',
  };
}

export function validateImageDataUrl(image: unknown): { mimeType: string; dataUrl: string } | null {
  if (typeof image !== 'string') return null;
  const match = image.match(/^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,/i);
  if (!match) return null;
  return { mimeType: match[1], dataUrl: image };
}

export function getDynamicCategories() {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT category
        FROM items
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category ASC
      `,
    )
    .all() as { category: string }[];

  return rows.map((r) => r.category);
}

export function getAllItems() {
  const rows = db
    .prepare('SELECT * FROM items ORDER BY id ASC')
    .all() as ItemRecord[];
  return rows.map(rowToItem);
}
