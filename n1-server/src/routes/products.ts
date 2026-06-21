import { Request, Response } from 'express';
import { db, type ProductRow, type PushChange } from '../db.js';

// POST /api/products/sync
export function handleSyncProducts(req: Request, res: Response): void {
  const { after } = req.body as { after?: string };

  let stmt;
  if (after) {
    stmt = db.prepare(
      'SELECT * FROM products WHERE updatedAt >= ? ORDER BY updatedAt ASC'
    );
  } else {
    stmt = db.prepare(
      'SELECT * FROM products WHERE isDeleted = 0 ORDER BY updatedAt ASC'
    );
  }

  const rows = after
    ? (stmt.all(after) as ProductRow[])
    : (stmt.all() as ProductRow[]);

  res.json({
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      barcode: row.barcode ?? undefined,
      category: row.category,
      unit: row.unit,
      imageUri: row.imageUri ?? undefined,
      isDeleted: row.isDeleted,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    })),
    serverTime: new Date().toISOString(),
  });
}

// POST /api/products/push
export function handlePushProducts(req: Request, res: Response): void {
  const { changes } = req.body as { changes: PushChange[] };

  if (!Array.isArray(changes)) {
    res.status(400).json({ error: 'changes must be an array' });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO products (id, name, price, barcode, category, unit, imageUri, isDeleted, createdAt, updatedAt)
     VALUES (@id, @name, @price, @barcode, @category, @unit, @imageUri, @isDeleted, COALESCE((SELECT createdAt FROM products WHERE id = @id), @updatedAt), @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       price = excluded.price,
       barcode = excluded.barcode,
       category = excluded.category,
       unit = excluded.unit,
       imageUri = excluded.imageUri,
       isDeleted = excluded.isDeleted,
       updatedAt = excluded.updatedAt`
  );

  const tx = db.transaction(() => {
    let count = 0;
    for (const change of changes) {
      upsert.run({
        id: change.id,
        name: change.name,
        price: change.price,
        barcode: change.barcode ?? null,
        category: change.category,
        unit: change.unit,
        imageUri: change.imageUri ?? null,
        isDeleted: change.isDeleted,
        updatedAt: change.updatedAt,
      });
      count++;
    }
    return count;
  });

  const count = tx();
  res.json({ ok: true, count });
}
