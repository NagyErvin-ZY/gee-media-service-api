import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { KafkaConsumerService } from '@gpe/backend-common/dist/shared/kafka/consumer';
import { KafkaProducerService } from '@gpe/backend-common/dist/shared/kafka/producer';
import { UploadClaimModule } from 'src/backend-for-frontend/upload-claim/upload-claim.module';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoAsset, VideoAssetSchema } from 'src/shared/schemas/video-asset.schema';

@Module({
  imports: [UploadClaimModule, MongooseModule.forFeature([
    { name: VideoAsset.name, schema: VideoAssetSchema },
  ])],
  providers: [EventsService, KafkaConsumerService, KafkaProducerService]
})
export class EventsModule { }
