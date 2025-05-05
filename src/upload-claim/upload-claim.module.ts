import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadClaimController } from './upload-claim.controller';
import { UploadClaimService } from './upload-claim.service';
import { UploadClaim, UploadClaimSchema } from './schemas/upload-claim.schema';
import { UserUploadStats, UserUploadStatsSchema } from './schemas/user-upload-stats.schema';
import { ImageUploadModule } from '../image-upload/image-upload.module';
import { VideoUploadModule } from '../video-upload/video-upload.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadClaim.name, schema: UploadClaimSchema },
      { name: UserUploadStats.name, schema: UserUploadStatsSchema },
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