import { HelperModule } from '@common/helper/helper.module';
import { CouponDbModule } from '@database/database/mongo/coupon/coupon-db.module';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { CouponGateway } from './coupon.gateway';
import { DownloadTokenService } from './download-token.service';
import { AppConfigModule } from '@common/config/app-config/app-config.module';

/**
 * Web-only module: controllers, service, WebSocket gateway.
 * No Bull processors — those run in the worker process.
 */
@Module({
  imports: [
    CouponDbModule,
    HelperModule,
    AppConfigModule,
    BullModule.registerQueue(
      { name: 'coupon' },
      { name: 'coupon2' },
      { name: 'bulk-qr' },
      { name: 'generate-qr' },
      { name: 'merge-image' },
      { name: 'post-process-qr' },
    ),
  ],
  controllers: [CouponController],
  providers: [CouponService, CouponGateway, DownloadTokenService],
})
export class CouponWebModule {}
