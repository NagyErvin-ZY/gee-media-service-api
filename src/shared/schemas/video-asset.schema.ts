import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UploadClaim } from '../../backend-for-frontend/upload-claim/schemas/upload-claim.schema';
import { IImageAsset, IVideoAsset, MuxUploadStatus, ModerationStatus } from '@gpe/backend-common/dist/schema/media';
import { VideoAssetCreatedWebhookEvent, VideoAssetErroredWebhookEvent, VideoAssetReadyWebhookEvent } from '@mux/mux-node/resources/webhooks';
import { VideoAssetErroredEvent } from '@gpe/backend-common/dist/shared/kafka/events';

@Schema({ timestamps: true })
export class VideoAsset extends Document implements IVideoAsset {
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
  passTroughUploadID?: string;

  @Prop()
  muxDirectUploadId?: string;

  @Prop({
    type: String,
    enum: ["not-started", "preparing", "ready", "errored"],
    default: 'not-started'
    
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

  @Prop({ type: String })
  claimId?: string;

  @Prop({
    type: Object,
    default: () => ({})
  })
  muxInfo?: VideoAssetCreatedWebhookEvent['data'] & VideoAssetReadyWebhookEvent['data'] & VideoAssetErroredWebhookEvent['data'];
}

export const VideoAssetSchema = SchemaFactory.createForClass(VideoAsset);

// Indexes
VideoAssetSchema.index({ userId: 1, profileName: 1 });
VideoAssetSchema.index({ passTroughUploadID: 1 });
VideoAssetSchema.index({ muxDirectUploadId: 1 });
VideoAssetSchema.index({ muxAssetId: 1 });
VideoAssetSchema.index({ claimId: 1 });
VideoAssetSchema.index({ createdAt: -1 });