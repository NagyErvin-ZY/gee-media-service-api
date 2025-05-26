import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoAsset, VideoAssetSchema } from '../../shared/schemas/video-asset.schema';
import { VideoUploadController } from './controllers/video-upload.controller';
import { VideoProcessorService } from './services/video-processor.service';
import { VideoUploadService } from './services/video-upload.service';
import { ModerationModule } from '../../core/moderation/moderation.module';
import { UploadClaimModule } from '../upload-claim/upload-claim.module';
import { S3Module } from '@gpe/backend-common/dist/aws/s3';
import config from 'src/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoAsset.name, schema: VideoAssetSchema },
    ]),
    S3Module.register({
      bucket: config.aws.services.s3.bucket,
      urlPrefix: config.aws.services.s3.urlPrefix,
      region: config.aws.services.s3.region,
    }),
    ModerationModule,
    forwardRef(() => UploadClaimModule), // Use forwardRef to break circular dependency
  ],
  controllers: [VideoUploadController],
  providers: [VideoUploadService, VideoProcessorService],
  exports: [VideoUploadService, VideoProcessorService],
})
export class VideoUploadModule { }