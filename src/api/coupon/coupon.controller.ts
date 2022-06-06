import {TransformInterceptor} from '@common/interceptors/transform.interceptor';
import {Body, Controller, Post, UseInterceptors} from '@nestjs/common';
import {generateCouponDTO} from './coupon.dto';
import {CouponService} from './coupon.service';

@Controller('api/coupon')
@UseInterceptors(TransformInterceptor)
export class CouponController {
    constructor(
        private couponService: CouponService
    ) {

    }

    @Post("/generate")
    generate(@Body() params: generateCouponDTO) {
        // console.log("params", params)
        return this.couponService.generateCoupon(params)
    }
}
