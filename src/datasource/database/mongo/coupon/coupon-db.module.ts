import {CouponDbConfigModule} from '@common/config/database-config/coupon-db-config/coupon-db-config.module';
import {Module} from '@nestjs/common';
import {databaseProviders} from './coupon-db.providers';
import {CouponDbService} from './coupon-db.service';
import {baseModelProviders} from './models/model.base.providers';

@Module({
  imports: [CouponDbConfigModule],
  providers: [CouponDbService, CouponDbService, ...baseModelProviders, ...databaseProviders],
  exports: [CouponDbService, ...baseModelProviders, ...databaseProviders]

})
export class CouponDbModule {}
