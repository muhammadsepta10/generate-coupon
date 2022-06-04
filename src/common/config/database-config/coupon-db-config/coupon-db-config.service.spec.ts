import { Test, TestingModule } from '@nestjs/testing';
import { CouponDbConfigService } from './coupon-db-config.service';

describe('CouponDbConfigService', () => {
  let service: CouponDbConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponDbConfigService],
    }).compile();

    service = module.get<CouponDbConfigService>(CouponDbConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
