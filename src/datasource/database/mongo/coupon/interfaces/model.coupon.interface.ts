import { Model } from 'mongoose';
import { CouponsDocument } from '../models/coupon.entity';

export interface CouponsModel {
  Coupons: Model<CouponsDocument>;
}
