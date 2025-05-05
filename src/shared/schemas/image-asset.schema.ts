// filepath: /Users/erwin/Documents/dev/gpe/gpe-media-service/src/shared/schemas/image-asset.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UploadClaim } from '../../upload-claim/schemas/upload-claim.schema';

export type ModerationStatus = 'approved' | 'rejected' | 'pending' | 'skipped';

@Schema({ timestamps: true })
export class ImageAsset extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  profileName: string;

  @Prop()
  originalFilename?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  mimeType?: string;

  @Prop()
  fileExtension?: string;
  
  @Prop()
  width?: number;

  @Prop()
  height?: number;
  
  @Prop()
  format?: string;

  @Prop()
  storageUrl?: string;

  @Prop()
  storageKey?: string;

  @Prop({ default: 's3' })
  storageProvider?: string;

  @Prop({
    enum: ['approved', 'rejected', 'pending', 'skipped'],
    default: 'pending'
  })
  moderationStatus?: ModerationStatus;

  @Prop({ type: MongooseSchema.Types.Mixed })
  moderationDetails?: {
    checkedAt?: Date;
    violations?: Array<{
      name: string;
      confidence: number;
      parentName?: string;
    }>;
    extractedText?: string;
    textModerationResult?: boolean;
  };

  @Prop({ type: String })
  claimId?: string;

  @Prop({ default: [] })
  tags: string[];

  @Prop({ default: false })
  isPublic: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metaData?: Record<string, any>;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ default: 'private' })
  accessLevel?: string;

  @Prop()
  processingDurationMs?: number; // Time it took to process the upload
  
  @Prop({ type: Object })
  resizedVersions?: {
    thumbnail?: {
      url: string;
      width: number;
      height: number;
      storageKey: string;
    };
    small?: {
      url: string;
      width: number;
      height: number;
      storageKey: string;
    };
    medium?: {
      url: string;
      width: number;
      height: number;
      storageKey: string;
    };
    [key: string]: {
      url: string;
      width: number;
      height: number;
      storageKey: string;
    } | undefined;
  };
}

export const ImageAssetSchema = SchemaFactory.createForClass(ImageAsset);

// Indexes
ImageAssetSchema.index({ userId: 1, profileName: 1 });
ImageAssetSchema.index({ claimId: 1 });
ImageAssetSchema.index({ createdAt: -1 });
ImageAssetSchema.index({ storageKey: 1 });
ImageAssetSchema.index({ isPublic: 1 });
ImageAssetSchema.index({ tags: 1 });
ImageAssetSchema.index({ moderationStatus: 1 });