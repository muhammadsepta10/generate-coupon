import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { path as appRoot } from 'app-root-path';
import {
  compareCsvAndQrDTO,
  GenerateBulkQr,
  generateCouponDTO,
  postProcessImageBulkDTO,
  PostProcessQrDTO,
  PostProcessQrPerFileDTO,
  SplitCsvAndQrDTO,
  QrPreviewDTO,
  ListQrOutputDTO,
  DownloadQrDTO,
  DownloadPostProcessDTO,
} from './coupon.dto';
import { CouponService } from './coupon.service';
import { CouponGateway } from './coupon.gateway';
import * as fs from 'node:fs';

@Controller('api/coupon')
@UseInterceptors(TransformInterceptor)
export class CouponController {
  constructor(
    private couponService: CouponService,
    private couponGateway: CouponGateway,
  ) {}

  @Post('/generate')
  generate(@Body() params: generateCouponDTO) {
    // console.log("params", params)
    return this.couponService.generateCoupon(params);
  }

  @Get('/generated/:project')
  listGeneratedCoupon(@Param('project') params: string) {
    return this.couponService.listGeneratedCoupon(params);
  }

  @Post('/post-test')
  postProcessTest(@Body() param: PostProcessQrDTO) {
    return this.couponService.postProcessQrPerFile(param);
  }

  @Post('/post-process-qr')
  queuePostProcess(@Body() param: PostProcessQrPerFileDTO) {
    return this.couponService.queuePostProcessFolder(param);
  }

  @Post('/split')
  splitCsvAndQr(@Body() params: SplitCsvAndQrDTO) {
    return this.couponService.splitCsvAndQr(params);
  }

  @Post('/preview/qr')
  previewQr(@Body() param: QrPreviewDTO) {
    return this.couponService.generateQrPreviewImage(param);
  }

  @Post('/preview/merge')
  previewMerge(@Body() param: PostProcessQrDTO) {
    return this.couponService.previewMergeImage(param);
  }

  @Get('/verif/qr')
  verificationQr(@Query() param: postProcessImageBulkDTO) {
    return this.couponService.verificationQr(param);
  }

  @Get('/qr/list')
  listGeneratedQr(@Query() param: ListQrOutputDTO) {
    return this.couponService.listGeneratedQrOutputs(param);
  }

  @Post('/post-process-image/bulk')
  postProcessImageBulk(@Body() param: postProcessImageBulkDTO) {
    return this.couponService.postProcessImageBulk(param);
  }

  @Get('/compare')
  compareCsvAndQr(@Query() param: compareCsvAndQrDTO) {
    return this.couponService.checkCsvAndQr(param);
  }

  @Get('/download/:project/:filename')
  downloadCoupon(
    @Param('project') project: string,
    @Param('filename') filename: string,
    @Res() response,
  ) {
    const fileDownload = this.couponService.downloadPerItem(project, filename);
    console.log('fileDownload', fileDownload);
    response.sendFile(fileDownload);
  }

  @Get('/downloadAll/:project')
  async donwloadAll(@Param('project') project: string, @Res() response) {
    const fileDownload = await this.couponService.downloadAll(project);
    response.sendFile(fileDownload);
  }

  @Get('/projects/overview')
  projectOverview() {
    return this.couponService.getProjectOverview();
  }

  @Get('/qr/download')
  async downloadQr(@Query() param: DownloadQrDTO, @Res() response) {
    const fileDownload = await this.couponService.downloadGeneratedQr(param);
    response.sendFile(fileDownload);
  }

  @Get('/post-process/download')
  async downloadPostProcess(
    @Query() param: DownloadPostProcessDTO,
    @Res() response,
  ) {
    const fileDownload = await this.couponService.downloadPostProcess(param);
    response.sendFile(fileDownload);
  }

  @Post('/bulk-qr')
  generateBulkQr(@Body() param: GenerateBulkQr) {
    return this.couponService.generateBulkQr(param);
  }

  // ─── File Upload ──────────────────────────────────────────

  @Post('/upload/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(appRoot, 'public', 'assets', 'logos');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e4);
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return {
      filename: file.filename,
      path: `/assets/logos/${file.filename}`,
      fullPath: `public/assets/logos/${file.filename}`,
    };
  }

  @Post('/upload/background')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(appRoot, 'public', 'assets', 'backgrounds');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e4);
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadBackground(@UploadedFile() file: Express.Multer.File) {
    return {
      filename: file.filename,
      path: `/assets/backgrounds/${file.filename}`,
      fullPath: `public/assets/backgrounds/${file.filename}`,
    };
  }

  // ─── Folder Listing ──────────────────────────────────────

  @Get('/folders/csv')
  async listCsvFolders() {
    return this.couponService.listCsvFolders();
  }

  @Get('/folders/qr')
  async listQrFolders() {
    return this.couponService.listQrFolders();
  }

  /** Get first coupon code from the first CSV file in a folder */
  @Get('/csv/sample')
  async getCsvSample(@Query('folder') folder: string) {
    return this.couponService.getCsvSampleLine(folder);
  }

  /** Get first QR image path from a QR folder */
  @Get('/qr/sample')
  async getQrSample(@Query('folder') folder: string) {
    return this.couponService.getQrSampleFile(folder);
  }

  @Get('/files/logos')
  async listLogos() {
    return this.couponService.listUploadedFiles('logos');
  }

  @Get('/files/backgrounds')
  async listBackgrounds() {
    return this.couponService.listUploadedFiles('backgrounds');
  }

  // ─── Active Jobs ──────────────────────────────────────────

  @Get('/jobs/active')
  getActiveJobs() {
    return this.couponGateway.getActiveJobs();
  }
}
