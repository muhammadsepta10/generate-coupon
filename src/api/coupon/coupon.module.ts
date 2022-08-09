import {HelperModule} from '@common/helper/helper.module';
import {CouponDbModule} from '@database/database/mongo/coupon/coupon-db.module';
import {BullModule} from '@nestjs/bull';
import {Module} from '@nestjs/common';
import {CouponController} from './coupon.controller';
import {CouponProcess} from './coupon.process';
import {CouponService} from './coupon.service';

@Module({
  imports: [CouponDbModule,
    HelperModule,
    BullModule.registerQueue({
      name: "coupon",
    })],
  controllers: [CouponController],
  providers: [CouponService, CouponProcess]
})
export class CouponModule {}
