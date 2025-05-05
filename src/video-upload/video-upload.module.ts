import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AwsModule } from '../aws/aws.module';
import { UploadRecord, UploadRecordSchema } from '../shared/schemas/upload-record.schema';
import { VideoAsset, VideoAssetSchema } from '../shared/schemas/video-asset.schema';
import { VideoUploadController } from './controllers/video-upload.controller';
import { VideoProcessorService } from './services/video-processor.service';
import { VideoUploadService } from './services/video-upload.service';
import { ModerationModule } from '../moderation/moderation.module';
import { UploadClaimModule } from '../upload-claim/upload-claim.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadRecord.name, schema: UploadRecordSchema },
      { name: VideoAsset.name, schema: VideoAssetSchema },
    ]),
    AwsModule,
    ModerationModule,
    forwardRef(() => UploadClaimModule), // Use forwardRef to break circular dependency
  ],
  controllers: [VideoUploadController],
  providers: [VideoUploadService, VideoProcessorService],
  exports: [VideoUploadService, VideoProcessorService],
})
export class VideoUploadModule {}