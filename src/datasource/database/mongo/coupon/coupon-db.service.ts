import {Inject, Injectable} from '@nestjs/common';
import {CouponsModel} from './interfaces/model.coupon.interface';
import {DBModel} from './interfaces/model.interface';

@Injectable()
export class CouponDbService {
    constructor(
        @Inject("COUPONS_MODEL") private couponModel: CouponsModel
    ) {}

    getModels(): DBModel {
        return {
            Coupons: this.couponModel
        }
    }
}
