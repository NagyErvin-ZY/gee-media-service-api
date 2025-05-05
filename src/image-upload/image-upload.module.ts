import { Module, MiddlewareConsumer, RequestMethod, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AwsModule } from '../aws/aws.module';
import { ImageAsset, ImageAssetSchema } from '../shared/schemas/image-asset.schema';
import { ImageUploadController } from './controllers/image-upload.controller';
import { ImageProcessorService } from './services/image-processor.service';
import { ImageUploadService } from './services/image-upload.service';
import { ModerationModule } from '../moderation/moderation.module';
import { ImageUploadMiddleware } from './middleware/image-upload.middleware';
import { UploadClaimModule } from '../upload-claim/upload-claim.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImageAsset.name, schema: ImageAssetSchema },
    ]),
    AwsModule,
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
export class ImageUploadModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ImageUploadMiddleware)
      .forRoutes(
        { path: 'v1/images/upload', method: RequestMethod.POST },
        { path: 'images/upload', method: RequestMethod.POST }
      );
  }
}