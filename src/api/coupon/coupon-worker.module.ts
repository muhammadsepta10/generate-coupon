import { HelperModule } from '@common/helper/helper.module';
import { CouponDbModule } from '@database/database/mongo/coupon/coupon-db.module';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import {
  BulkQr,
  CouponProcess,
  CouponProcess2,
  GenerateQr,
  MergeImage,
  PostProcessQr,
} from './coupon.process';

/**
 * Worker-only module: Bull processors only.
 * No controllers, no gateway, no WebSocket — just job processing.
 */
@Module({
  imports: [
    CouponDbModule,
    HelperModule,
    BullModule.registerQueue(
      { name: 'coupon' },
      { name: 'coupon2' },
      { name: 'bulk-qr' },
      { name: 'generate-qr' },
      { name: 'merge-image' },
      { name: 'post-process-qr' },
    ),
  ],
  providers: [
    CouponProcess,
    CouponProcess2,
    BulkQr,
    GenerateQr,
    PostProcessQr,
    MergeImage,
  ],
})
export class CouponWorkerModule {}
