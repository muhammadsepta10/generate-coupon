import {TransformInterceptor} from '@common/interceptors/transform.interceptor';
import {Body, Controller, Get, Param, Post, Res, UseInterceptors} from '@nestjs/common';
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

    @Get("/generated/:project")
    listGeneratedCoupon(@Param("project") params: string) {
        return this.couponService.listGeneratedCoupon(params)
    }

    @Get("/download/:project/:filename")
    downloadCoupon(@Param("project") project: string, @Param("filename") filename: string, @Res() response) {
        const fileDownload = this.couponService.downloadPerItem(project, filename)
        console.log("fileDownload", fileDownload)
        response.sendFile(fileDownload)
    }

    @Get("/downloadAll/:project")
    async donwloadAll(@Param("project") project: string, @Res() response) {
        const fileDownload = await this.couponService.downloadAll(project)
        response.sendFile(fileDownload)
    }
}
