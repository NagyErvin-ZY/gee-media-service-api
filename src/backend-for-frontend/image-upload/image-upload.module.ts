import { Module, MiddlewareConsumer, RequestMethod, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImageAsset, ImageAssetSchema } from '../../shared/schemas/image-asset.schema';
import { ImageUploadController } from './controllers/image-upload.controller';
import { ImageProcessorService } from './services/image-processor.service';
import { ImageUploadService } from './services/image-upload.service';
import { ModerationModule } from '../../core/moderation/moderation.module';
import { UploadClaimModule } from '../upload-claim/upload-claim.module';
import { S3Module } from '@gpe/backend-common/dist/aws/s3';
import config from 'src/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImageAsset.name, schema: ImageAssetSchema },
    ]),
    S3Module.register({
      bucket: config.aws.services.s3.bucket,
      urlPrefix: config.aws.services.s3.urlPrefix,
      region: config.aws.services.s3.region,
    }),
    ModerationModule,
    forwardRef(() => UploadClaimModule), // Use forwardRef to break circular dependency
  ],
  controllers: [ImageUploadController],
  providers: [
    ImageUploadService,
    ImageProcessorService
  ],
  exports: [ImageUploadService, ImageProcessorService],
})
export class ImageUploadModule { }