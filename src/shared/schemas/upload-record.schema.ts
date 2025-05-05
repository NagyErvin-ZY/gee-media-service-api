import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UploadClaim } from '../../upload-claim/schemas/upload-claim.schema';

export type MediaType = 'image' | 'video' | 'document' | 'audio' | 'other';
export type ModerationStatus = 'approved' | 'rejected' | 'pending' | 'skipped';

@Schema({ timestamps: true })
export class UploadRecord extends Document {
  @Prop({ 
    type: String, 
    ref: UploadClaim.name, 
    required: true,
    index: true
  })
  claim: string;

  @Prop({ 
    required: true,
    index: true
  })
  userId: string;

  @Prop({
    required: true,
    enum: ['image', 'video', 'document', 'audio', 'other'],
    index: true
  })
  mediaType: MediaType;

  @Prop({ 
    required: true,
    index: true
  })
  profileName: string;

  @Prop()
  originalFilename: string;

  @Prop()
  fileSize: number;

  @Prop()
  mimeType: string;

  @Prop()
  fileExtension: string;

  @Prop()
  storageUrl: string;

  @Prop()
  storageKey: string;

  @Prop()
  storageProvider: string;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  duration?: number; // For video/audio in seconds

  @Prop()
  format?: string;

  @Prop({
    enum: ['approved', 'rejected', 'pending', 'skipped'],
    default: 'pending',
    index: true
  })
  moderationStatus: ModerationStatus;

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

  @Prop({ 
    default: false,
    index: true 
  })
  isPublic: boolean;

  @Prop({ default: Date.now })
  uploadedAt: Date;

  @Prop({ type: [String], index: true })
  tags: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;

  @Prop()
  processingDurationMs?: number; // Time it took to process the upload
}

export const UploadRecordSchema = SchemaFactory.createForClass(UploadRecord);