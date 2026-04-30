import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CouponsDocument = Coupons & Document;

@Schema({ timestamps: true, _id: false })
export class Coupons {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true, default: '' })
  project: string;

  @Prop({ required: true, default: 0 })
  prizeId: number;

  @Prop({ required: true, default: 1 })
  status: number;
}

export const CouponsSchema = SchemaFactory.createForClass(Coupons);
