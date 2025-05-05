import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UploadClaim } from '../../upload-claim/schemas/upload-claim.schema';

export type MuxUploadStatus = 'waiting' | 'processing' | 'completed' | 'errored' | 'cancelled';
export type MuxAssetStatus = 'preparing' | 'ready' | 'errored' | 'deleted';

@Schema({ timestamps: true })
export class VideoAsset extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  profileName: string;

  @Prop()
  originalFilename?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  duration?: number;

  @Prop()
  resolution?: string;

  @Prop()
  aspectRatio?: string;

  @Prop()
  muxUploadId?: string;

  @Prop()
  muxUploadStatus?: MuxUploadStatus;

  @Prop()
  muxUploadUrl?: string;

  @Prop()
  muxAssetId?: string;

  @Prop()
  muxAssetStatus?: MuxAssetStatus;

  @Prop()
  muxPlaybackId?: string;

  @Prop({ type: Object })
  muxAssetData?: Record<string, any>;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  gifThumbnailUrl?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  uploadParams?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'UploadClaim' })
  claim?: UploadClaim;

  @Prop({ default: [] })
  tags: string[];

  @Prop({ default: false })
  isPublic: boolean;

  @Prop({ type: Object })
  metaData?: Record<string, any>;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop()
  status?: string;

  @Prop({ default: 'private' })
  accessLevel?: string;

  @Prop({
    type: Object,
    default: () => ({})
  })
  muxInfo?: {
    uploadId?: string;
    assetId?: string;
    playbackId?: string;
  };
}

export const VideoAssetSchema = SchemaFactory.createForClass(VideoAsset);

// Indexes
VideoAssetSchema.index({ userId: 1, profileName: 1 });
VideoAssetSchema.index({ muxUploadId: 1 });
VideoAssetSchema.index({ muxAssetId: 1 });
VideoAssetSchema.index({ createdAt: -1 });