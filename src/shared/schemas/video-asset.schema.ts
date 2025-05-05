import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UploadClaim } from '../../upload-claim/schemas/upload-claim.schema';

export type MuxUploadStatus = 'waiting' | 'processing' | 'complete' | 'failed' | 'cancelled';

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
  muxDirectUploadId?: string;

  @Prop({ 
    type: String,
    enum: ['waiting', 'processing', 'complete', 'failed', 'cancelled'],
    default: 'waiting'
  })
  muxUploadStatus?: MuxUploadStatus;

  @Prop()
  muxAssetId?: string;

  @Prop({ 
    type: String,
    enum: ['preparing', 'ready', 'errored', 'deleted'],
    default: 'preparing'
  })
  status?: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  gifThumbnailUrl?: string;

  @Prop()
  playbackUrl?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  customParams?: Record<string, any>;

  @Prop({ type: String })
  claimId?: string;

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

  @Prop({ default: 'private' })
  accessLevel?: string;

  @Prop({
    type: Object,
    default: () => ({})
  })
  muxInfo?: {
    assetId?: string;
    playbackId?: string;
    hlsPlaybackUrl?: string;
    mp4PlaybackUrl?: string;
    thumbnailUrl?: string;
    animatedGifUrl?: string;
    posterUrl?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    createdAt?: string;
    tracks?: any[];
  };
}

export const VideoAssetSchema = SchemaFactory.createForClass(VideoAsset);

// Indexes
VideoAssetSchema.index({ userId: 1, profileName: 1 });
VideoAssetSchema.index({ muxUploadId: 1 });
VideoAssetSchema.index({ muxDirectUploadId: 1 });
VideoAssetSchema.index({ muxAssetId: 1 });
VideoAssetSchema.index({ claimId: 1 });
VideoAssetSchema.index({ createdAt: -1 });