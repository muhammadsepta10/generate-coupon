// src/api/coupon/coupon.process.unit.spec.ts

// Mock semua decorator NestJS SEBELUM import apapun
jest.mock('@nestjs/bull', () => ({
  Processor: () => () => {},
  Process: () => () => {},
  InjectQueue: () => () => {},
}));

jest.mock('app-root-path', () => ({
  path: '/tmp/test-app-root',
}));

// Import SETELAH mock
import { CouponProcess2 } from './coupon.process';

// ── Helper: buat mock CouponDbService ──────────────────────────────────────
function makeMockDb(insertManyFn: jest.Mock) {
  return {
    getModels: () => ({
      Coupons: {
        Coupons: {
          insertMany: insertManyFn,
        },
      },
    }),
  };
}

// ── Helper: akses private method ──────────────────────────────────────────
function callPersist(
  processor: CouponProcess2,
  codes: string[],
  project = 'test-project',
) {
  return (processor as any).persistCoupons(codes, project);
}

// ─────────────────────────────────────────────────────────────────────────
describe('CouponProcess2 — persistCoupons', () => {
  let insertMany: jest.Mock;
  let processor: CouponProcess2;

  beforeEach(() => {
    insertMany = jest.fn();
    processor = new CouponProcess2(makeMockDb(insertMany) as any);
  });

  // ── TEST 1 ───────────────────────────────────────────────────────────────
  it('TEST 1: duplicate di tengah chunk — tidak masuk inserted', async () => {
    insertMany.mockRejectedValueOnce({
      code: 11000,
      writeErrors: [{ index: 1 }],
      result: { nInserted: 3 },
    });

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
      'DDDDD',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).not.toContain('BBBBB');
    expect(duplicates).toContain('BBBBB');
    expect(inserted).toHaveLength(3);
    expect(duplicates).toHaveLength(1);
  });

  // ── TEST 2 ───────────────────────────────────────────────────────────────
  it('TEST 2: silent failure — nInserted mismatch, semua di-reject', async () => {
    insertMany.mockRejectedValueOnce({
      code: 11000,
      writeErrors: [],
      result: { nInserted: 1 },
    });

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).toHaveLength(0);
    expect(duplicates).toHaveLength(3);
  });

  // ── TEST 3 ───────────────────────────────────────────────────────────────
  it('TEST 3: happy path — semua inserted', async () => {
    insertMany.mockResolvedValueOnce([
      { _id: 'AAAAA' },
      { _id: 'BBBBB' },
      { _id: 'CCCCC' },
    ]);

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).toHaveLength(3);
    expect(duplicates).toHaveLength(0);
  });

  // ── TEST 4 ───────────────────────────────────────────────────────────────
  it('TEST 4: writeErrors ada + nInserted mismatch — semua di-reject', async () => {
    insertMany.mockRejectedValueOnce({
      code: 11000,
      writeErrors: [{ index: 1 }],
      result: { nInserted: 2 }, // harusnya 4
    });

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
      'DDDDD',
      'EEEEE',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).toHaveLength(0);
    expect(duplicates).toHaveLength(5);
  });

  // ── TEST 5 ───────────────────────────────────────────────────────────────
  it('TEST 5: nInserted null — fallback ke failedIndexes', async () => {
    insertMany.mockRejectedValueOnce({
      code: 11000,
      writeErrors: [{ index: 2 }],
      result: {}, // nInserted tidak ada
    });

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
      'DDDDD',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).not.toContain('CCCCC');
    expect(duplicates).toContain('CCCCC');
    expect(inserted).toHaveLength(3);
  });

  // ── TEST 6 ───────────────────────────────────────────────────────────────
  it('TEST 6: semua duplicate', async () => {
    insertMany.mockRejectedValueOnce({
      code: 11000,
      writeErrors: [{ index: 0 }, { index: 1 }, { index: 2 }],
      result: { nInserted: 0 },
    });

    const { inserted, duplicates } = await callPersist(processor, [
      'AAAAA',
      'BBBBB',
      'CCCCC',
    ]);

    console.log('inserted:', inserted, '| duplicates:', duplicates);
    expect(inserted).toHaveLength(0);
    expect(duplicates).toHaveLength(3);
  });
});
