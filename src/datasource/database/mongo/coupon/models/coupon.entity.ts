import {Prop, raw, Schema, SchemaFactory} from '@nestjs/mongoose';
import {Document, ObjectId, Schema as MongooseSchema} from 'mongoose';

export type CouponsDocument = Coupons & Document;

@Schema({timestamps: true})
export class Coupons {
    @Prop({required: true, unique: true})
    coupon: string;

    @Prop({required: true, default: ""})
    project: string;

    @Prop({required: true, default: 0})
    prizeId: number;

    @Prop({required: true, default: 1})
    status: number;
}

export const CouponsSchema = SchemaFactory.createForClass(Coupons);
