import { Test, TestingModule } from '@nestjs/testing';
import { CouponDbService } from './coupon-db.service';

describe('CouponDbService', () => {
  let service: CouponDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponDbService],
    }).compile();

    service = module.get<CouponDbService>(CouponDbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
