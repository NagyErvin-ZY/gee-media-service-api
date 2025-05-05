import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class UserUploadStats extends Document {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  profileName: string;

  @Prop({ type: [Date], default: [] })
  uploadDates: Date[];
}

export const UserUploadStatsSchema = SchemaFactory.createForClass(UserUploadStats);