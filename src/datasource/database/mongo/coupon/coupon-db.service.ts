import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { CouponsModel } from './interfaces/model.coupon.interface';
import { DBModel, DownloadLinkModel } from './interfaces/model.interface';
import { DownloadLinkDocument } from './models/download-link.entity';

@Injectable()
export class CouponDbService {
  constructor(
    @Inject('COUPONS_MODEL') private couponModel: CouponsModel,
    @Inject('DOWNLOAD_LINK_MODEL')
    private downloadLinkModel: Model<DownloadLinkDocument>,
  ) {}

  getModels(): DBModel {
    return {
      Coupons: this.couponModel,
    };
  }

  getDownloadLinkModel(): DownloadLinkModel {
    return this.downloadLinkModel;
  }
}
