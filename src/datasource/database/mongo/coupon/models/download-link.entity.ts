import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DownloadLinkDocument = DownloadLink & Document;

@Schema({ timestamps: true })
export class DownloadLink {
  @Prop({ required: true, unique: true, index: true })
  linkId: string;

  @Prop({ required: true })
  project: string;

  @Prop({ required: true, enum: ['csv', 'qr', 'post-process'] })
  fileType: string;

  @Prop()
  path: string;

  @Prop()
  zipName: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;
}

export const DownloadLinkSchema = SchemaFactory.createForClass(DownloadLink);

// TTL index: MongoDB automatically deletes expired documents
DownloadLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
