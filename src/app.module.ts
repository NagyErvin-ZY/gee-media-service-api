import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from "@gpe/backend-common/dist/shared/config";
import { MongooseModule } from '@nestjs/mongoose';
import config from './config';
import { WinstonModule } from 'nest-winston';
import { ImageUploadModule } from './backend-for-frontend/image-upload/image-upload.module';
import { VideoUploadModule } from './backend-for-frontend/video-upload/video-upload.module';
import { UploadClaimModule } from './backend-for-frontend/upload-claim/upload-claim.module';
import { ModerationModule } from './core/moderation/moderation.module';
import { RetrivalModule } from './core/retrival/retrival.module';
import { EventsModule } from './core/events/events.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    ConfigModule.forRoot(config),
    MongooseModule.forRoot(config.db.mongo.connectionString),
    WinstonModule.forRoot(config.logging.winston),

    MulterModule.register({
      storage: memoryStorage(),
    }),
    ImageUploadModule,
    VideoUploadModule,
    UploadClaimModule,
    ModerationModule,
    RetrivalModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
