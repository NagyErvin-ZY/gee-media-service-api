import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RetrivalController } from './retrival.controller';
import { RetrivalService } from './retrival.service';
import { ImageAsset, ImageAssetSchema } from '../../shared/schemas/image-asset.schema';
import { VideoAsset, VideoAssetSchema } from '../../shared/schemas/video-asset.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImageAsset.name, schema: ImageAssetSchema },
      { name: VideoAsset.name, schema: VideoAssetSchema },
    ]),
  ],
  controllers: [RetrivalController],
  providers: [RetrivalService]
})
export class RetrivalModule {}
