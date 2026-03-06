import { Module } from '@nestjs/common';
import { HelperModule } from './common/helper/helper.module';
import { CouponDbConfigModule } from './common/config/database-config/coupon-db-config/coupon-db-config.module';
import { MainDbModule } from './datasource/database/mysql/main-db/main-db.module';
import { CouponDbModule } from './datasource/database/mongo/coupon/coupon-db.module';
import { AppConfigModule } from '@common/config/app-config/app-config.module';
import { CouponWorkerModule } from './api/coupon/coupon-worker.module';
import { BullModule } from '@nestjs/bull';

/**
 * Worker process module: Bull processors only.
 * No HTTP, no WebSocket, no static files — just job processing on a separate event loop.
 */
@Module({
  imports: [
    AppConfigModule,
    HelperModule,
    CouponDbConfigModule,
    MainDbModule,
    CouponDbModule,
    CouponWorkerModule,
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class WorkerModule {}
