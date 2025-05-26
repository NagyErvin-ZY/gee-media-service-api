import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ClaimStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
  MODERATION_REJECTED = 'moderation_rejected',
  READY = 'ready',
}

// Define a separate schema for file metadata
class FileMetadata {
  @Prop()
  originalName?: string;

  @Prop()
  size?: number;

  @Prop()
  mimeType?: string;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  format?: string;
}

@Schema({ timestamps: true })
export class UploadClaim extends Document {
  @Prop({ required: true, index: true })
  claimId: string;

  @Prop({ required: true, index: true })
  claimRequestorUserId: string;

  @Prop({ required: true })
  uploadProfile: string;

  @Prop({ required: true, enum: ClaimStatus })
  status: ClaimStatus;

  @Prop()
  reason?: string;

  @Prop()
  fileUrl?: string;

  @Prop()
  moderationMessage?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  fileMetadata?: FileMetadata;

  @Prop({ default: Date.now })
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

@Schema({ timestamps: true })
export class UserUploadStats extends Document {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  profileName: string;

  @Prop({ type: [Date], default: [] })
  uploadDates: Date[];
}

export const UploadClaimSchema = SchemaFactory.createForClass(UploadClaim);
export const UserUploadStatsSchema = SchemaFactory.createForClass(UserUploadStats);