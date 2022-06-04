import {HelperModule} from '@common/helper/helper.module';
import {CouponDbModule} from '@database/database/mongo/coupon/coupon-db.module';
import {Module} from '@nestjs/common';
import {CouponController} from './coupon.controller';
import {CouponService} from './coupon.service';

@Module({
  imports: [CouponDbModule, HelperModule],
  controllers: [CouponController],
  providers: [CouponService]
})
export class CouponModule {}
