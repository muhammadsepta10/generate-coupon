import { Model } from 'mongoose';
import { CouponsModel } from './model.coupon.interface';
import { DownloadLinkDocument } from '../models/download-link.entity';

export interface DBModel {
  Coupons: CouponsModel;
}

export type DownloadLinkModel = Model<DownloadLinkDocument>;
