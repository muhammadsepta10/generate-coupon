import { TransformInterceptor } from "@common/interceptors/transform.interceptor";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import {
  compareCsvAndQrDTO,
  GenerateBulkQr,
  generateCouponDTO,
  postProcessImageBulkDTO,
  PostProcessQrPerFileDTO,
  SplitCsvAndQrDTO,
} from "./coupon.dto";
import { CouponService } from "./coupon.service";

@Controller("api/coupon")
@UseInterceptors(TransformInterceptor)
export class CouponController {
  constructor(private couponService: CouponService) {}

  @Post("/generate")
  generate(@Body() params: generateCouponDTO) {
    // console.log("params", params)
    return this.couponService.generateCoupon(params);
  }

  @Get("/generated/:project")
  listGeneratedCoupon(@Param("project") params: string) {
    return this.couponService.listGeneratedCoupon(params);
  }

  @Post("/post-test")
  postProcessTest(@Body() param: PostProcessQrPerFileDTO) {
    return this.couponService.postProcessQrPerFile(param);
  }

  @Post("/split")
  splitCsvAndQr(@Body() params: SplitCsvAndQrDTO) {
    return this.couponService.splitCsvAndQr(params);
  }

  @Get("/verif/qr")
  verificationQr(@Query() param: postProcessImageBulkDTO) {
    return this.couponService.verificationQr(param);
  }

  @Post("/post-process-image/bulk")
  postProcessImageBulk(@Body() param: postProcessImageBulkDTO) {
    return this.couponService.postProcessImageBulk(param);
  }

  @Get("/compare")
  compareCsvAndQr(@Query() param: compareCsvAndQrDTO) {
    return this.couponService.checkCsvAndQr(param);
  }

  @Get("/download/:project/:filename")
  downloadCoupon(
    @Param("project") project: string,
    @Param("filename") filename: string,
    @Res() response,
  ) {
    const fileDownload = this.couponService.downloadPerItem(project, filename);
    console.log("fileDownload", fileDownload);
    response.sendFile(fileDownload);
  }

  @Get("/downloadAll/:project")
  async donwloadAll(@Param("project") project: string, @Res() response) {
    const fileDownload = await this.couponService.downloadAll(project);
    response.sendFile(fileDownload);
  }

  @Post("/bulk-qr")
  generateBulkQr(@Body() param: GenerateBulkQr) {
    return this.couponService.generateBulkQr(param);
  }
}
