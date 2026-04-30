import { HelperModule } from '@common/helper/helper.module';
import { CouponDbModule } from '@database/database/mongo/coupon/coupon-db.module';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import {
  BulkQr,
  CouponProcess,
  CouponProcess2,
  GenerateQr,
  MergeImage,
  PostProcessQr,
} from './coupon.process';
import { CouponService } from './coupon.service';
import { CouponGateway } from './coupon.gateway';
import { DownloadTokenService } from './download-token.service';
import { AppConfigModule } from '@common/config/app-config/app-config.module';

@Module({
  imports: [
    CouponDbModule,
    HelperModule,
    AppConfigModule,
    BullModule.registerQueue({
      name: 'coupon',
    }),
    BullModule.registerQueue({
      name: 'coupon2',
    }),
    BullModule.registerQueue({
      name: 'bulk-qr',
    }),
    BullModule.registerQueue({
      name: 'generate-qr',
    }),
    BullModule.registerQueue({
      name: 'merge-image',
    }),
    BullModule.registerQueue({
      name: 'post-process-qr',
    }),
  ],
  controllers: [CouponController],
  providers: [
    CouponService,
    CouponGateway,
    DownloadTokenService,
    CouponProcess,
    CouponProcess2,
    BulkQr,
    GenerateQr,
    PostProcessQr,
    MergeImage,
  ],
})
export class CouponModule {}
