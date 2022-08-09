import {Module} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {HelperModule} from './common/helper/helper.module';
import {CouponDbConfigModule} from './common/config/database-config/coupon-db-config/coupon-db-config.module';
import {MainDbModule} from './datasource/database/mysql/main-db/main-db.module';
import {CouponDbModule} from './datasource/database/mongo/coupon/coupon-db.module';
import {AppConfigModule} from '@common/config/app-config/app-config.module';
import {CouponModule} from './api/coupon/coupon.module';
import {BullModule} from '@nestjs/bull';


@Module({
  imports: [
    AppConfigModule,
    HelperModule,
    CouponDbConfigModule,
    MainDbModule,
    CouponDbModule,
    CouponModule,
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    })
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
