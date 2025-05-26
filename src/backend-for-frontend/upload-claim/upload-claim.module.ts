import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadClaimController } from './upload-claim.controller';
import { UploadClaimService } from './upload-claim.service';
import { UploadClaim, UploadClaimSchema } from './schemas/upload-claim.schema';
import { UserUploadStats, UserUploadStatsSchema } from './schemas/user-upload-stats.schema';
import { ImageUploadModule } from '../image-upload/image-upload.module';
import { VideoUploadModule } from '../video-upload/video-upload.module';
import { ModerationModule } from '../../core/moderation/moderation.module';
import { ImageAsset, ImageAssetSchema } from '../../shared/schemas/image-asset.schema';
import { VideoAsset, VideoAssetSchema } from '../../shared/schemas/video-asset.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadClaim.name, schema: UploadClaimSchema },
      { name: UserUploadStats.name, schema: UserUploadStatsSchema },
      { name: ImageAsset.name, schema: ImageAssetSchema },
      { name: VideoAsset.name, schema: VideoAssetSchema },
    ]),
    forwardRef(() => ImageUploadModule),
    forwardRef(() => VideoUploadModule),
    ModerationModule,
  ],
  controllers: [UploadClaimController],
  providers: [UploadClaimService],
  exports: [UploadClaimService],
})
export class UploadClaimModule {}