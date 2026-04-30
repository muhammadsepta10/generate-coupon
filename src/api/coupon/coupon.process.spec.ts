// coupon.process.spec.ts
import { CouponProcess2 } from './coupon.process';
describe('persistCoupons - duplicate handling', () => {
  let processor: CouponProcess2;
  let mockInsertMany: jest.Mock;

  beforeEach(() => {
    // Mock Mongoose insertMany
    mockInsertMany = jest.fn();

    const mockCouponModel = {
      insertMany: mockInsertMany,
    };

    processor = new CouponProcess2({
      getModels: () => ({
        Coupons: {
          Coupons: mockCouponModel,
        },
      }),
    } as any);
  });

  it('harus exclude kode yang duplicate dari inserted list', async () => {
    const chunk = ['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD'];

    // Simulasi MongoDB E11000: BBBBB (index 1) adalah duplicate
    const bulkWriteError = {
      code: 11000,
      writeErrors: [{ index: 1, code: 11000 }],
      result: {
        nInserted: 3, // hanya 3 yang berhasil
        insertedIds: {
          0: 'AAAAA',
          // 1 tidak ada (duplicate)
          2: 'CCCCC',
          3: 'DDDDD',
        },
      },
    };

    mockInsertMany.mockRejectedValueOnce(bulkWriteError);

    const { inserted, duplicates } = await (processor as any).persistCoupons(
      chunk,
      'test-project',
    );

    console.log('inserted:', inserted);
    console.log('duplicates:', duplicates);

    // ✅ Assertions
    expect(inserted).not.toContain('BBBBB'); // duplicate tidak boleh masuk
    expect(duplicates).toContain('BBBBB');
    expect(inserted).toHaveLength(3);
    expect(duplicates).toHaveLength(1);
  });

  it('harus detect silent failure jika nInserted tidak match', async () => {
    const chunk = ['AAAAA', 'BBBBB', 'CCCCC'];

    // Simulasi: writeErrors kosong tapi nInserted hanya 1
    // → ada silent failure (2 kode tidak inserted, tidak dilaporkan)
    const bulkWriteError = {
      code: 11000,
      writeErrors: [],
      result: {
        nInserted: 1, // harusnya 3, tapi hanya 1
      },
    };

    mockInsertMany.mockRejectedValueOnce(bulkWriteError);

    const { inserted, duplicates } = await (processor as any).persistCoupons(
      chunk,
      'test-project',
    );

    // Dengan fix mismatch detection: semua harus di-reject untuk di-retry
    expect(inserted).toHaveLength(0);
    expect(duplicates).toHaveLength(3); // semua masuk rejected untuk retry
  });
});
