import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from "@gpe/backend-common/dist/shared/config";
import { MongooseModule } from '@nestjs/mongoose';
import config from './config';
import { WinstonModule } from 'nest-winston';
import { ImageUploadModule } from './image-upload/image-upload.module';
import { VideoUploadModule } from './video-upload/video-upload.module';
import { UploadClaimModule } from './upload-claim/upload-claim.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot(config),
    MongooseModule.forRoot(config.db.mongo.connectionString),
    WinstonModule.forRoot(config.logging.winston),
    ImageUploadModule,
    VideoUploadModule,
    UploadClaimModule,
    ModerationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
