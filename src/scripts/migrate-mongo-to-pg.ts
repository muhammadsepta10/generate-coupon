/**
 * One-time migration script: MongoDB coupons schema update
 *
 * Migrates from old schema:
 *   { _id: ObjectId, coupon: "ABC123", project: "X", prizeId: 0, status: 1 }
 * To new schema (coupon code as _id):
 *   { _id: "ABC123", project: "X", prizeId: 0, status: 1 }
 *
 * Strategy: Write to temp collection `coupons_new`, then atomic rename-swap.
 * Old data preserved as `coupons_old_backup` until manually dropped.
 *
 * Usage:
 *   yarn migrate:coupons
 *   # or
 *   ts-node -r tsconfig-paths/register src/scripts/migrate-mongo-to-pg.ts
 *
 * Prerequisites:
 *   - MongoDB must be running with coupon data
 *   - App must be STOPPED (no concurrent writes during rename)
 *   - .env.development must have COUPON_DB_URL
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env before anything else
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env'
    : `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: resolve(__dirname, '../../', envFile) });

import { createConnection as mongoConnect } from 'mongoose';

const BATCH_SIZE = 10_000;

async function main() {
  const mongoUrl = process.env.COUPON_DB_URL;

  if (!mongoUrl) {
    console.error('COUPON_DB_URL is not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  const conn = await mongoConnect(mongoUrl);
  await conn.asPromise(); // wait for connection to be fully established
  const db = conn.db;

  const oldCollection = db.collection('coupons');
  const newCollectionName = 'coupons_new';

  // Check if coupons_new already exists (previous interrupted run?)
  const existingCollections = await db
    .listCollections({ name: newCollectionName })
    .toArray();
  if (existingCollections.length > 0) {
    console.warn(
      `Collection "${newCollectionName}" already exists. Dropping it to restart migration...`,
    );
    await db.dropCollection(newCollectionName);
  }

  const newCollection = db.collection(newCollectionName);

  const totalDocs = await oldCollection.countDocuments();
  console.log(
    `Total documents in old collection: ${totalDocs.toLocaleString()}`,
  );

  if (totalDocs === 0) {
    console.log('No documents to migrate.');
    await conn.close();
    return;
  }

  let migrated = 0;
  let duplicates = 0;
  const startTime = Date.now();

  // Use cursor for memory-efficient streaming
  const cursor = oldCollection.find({}).batchSize(BATCH_SIZE);

  let batch: {
    _id: string;
    project: string;
    prizeId: number;
    status: number;
  }[] = [];

  for await (const doc of cursor) {
    const couponCode = doc.coupon;
    if (!couponCode) {
      console.warn(`Skipping doc ${doc._id} — missing coupon field`);
      continue;
    }
    batch.push({
      _id: couponCode,
      project: doc.project || '',
      prizeId: doc.prizeId ?? 0,
      status: doc.status ?? 1,
    });

    if (batch.length >= BATCH_SIZE) {
      const result = await insertBatch(newCollection, batch);
      migrated += result.inserted;
      duplicates += result.duplicates;
      logProgress(migrated, duplicates, totalDocs, startTime);
      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const result = await insertBatch(newCollection, batch);
    migrated += result.inserted;
    duplicates += result.duplicates;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nMigration phase 1 complete: ${migrated.toLocaleString()} inserted, ${duplicates.toLocaleString()} duplicates skipped, ${elapsed}s elapsed`,
  );

  // Verify counts
  const newCount = await newCollection.countDocuments();
  console.log(
    `New collection count: ${newCount.toLocaleString()} (expected: ${(
      totalDocs - duplicates
    ).toLocaleString()})`,
  );

  // Atomic rename-swap
  console.log('\nPerforming atomic rename-swap...');
  console.log('  coupons → coupons_old_backup');
  await db.renameCollection('coupons', 'coupons_old_backup');
  console.log('  coupons_new → coupons');
  await db.renameCollection(newCollectionName, 'coupons');

  console.log('\n✅ Migration complete!');
  console.log('  - New "coupons" collection uses _id = coupon code (string)');
  console.log('  - Old data preserved in "coupons_old_backup"');
  console.log('  - To free space later: db.coupons_old_backup.drop()');

  // Verify new collection indexes (should only have _id)
  const indexes = await db.collection('coupons').indexes();
  console.log('\nIndexes on new "coupons" collection:');
  indexes.forEach((idx) =>
    console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`),
  );

  await conn.close();
}

async function insertBatch(
  collection: any,
  batch: { _id: string; project: string; prizeId: number; status: number }[],
): Promise<{ inserted: number; duplicates: number }> {
  if (!batch.length) return { inserted: 0, duplicates: 0 };

  try {
    const result = await collection.insertMany(batch, { ordered: false });
    return { inserted: result.insertedCount, duplicates: 0 };
  } catch (err: any) {
    if (err?.code === 11000 || err?.writeErrors) {
      const failedCount = (err.writeErrors || []).length;
      const insertedCount = batch.length - failedCount;
      return { inserted: insertedCount, duplicates: failedCount };
    }
    throw err;
  }
}

function logProgress(
  migrated: number,
  duplicates: number,
  total: number,
  startTime: number,
) {
  const pct = ((migrated / total) * 100).toFixed(1);
  const elapsed = (Date.now() - startTime) / 1000;
  const speed = elapsed > 0 ? Math.round(migrated / elapsed) : 0;
  const remaining = total - migrated - duplicates;
  const eta = speed > 0 ? Math.round(remaining / speed) : 0;
  process.stdout.write(
    `\r  Migrated: ${migrated.toLocaleString()}/${total.toLocaleString()} (${pct}%) | ${speed.toLocaleString()} docs/sec | ETA: ${eta}s | dupes: ${duplicates.toLocaleString()}`,
  );
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
