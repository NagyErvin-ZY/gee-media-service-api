import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from "@gpe/backend-common/dist/shared/config"
import config from './config';
import { WinstonModule } from 'nest-winston';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot(config),
    WinstonModule.forRoot(config.logging.winston),
    MongooseModule.forRoot(config.db.mongo.connectionString),
    MediaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
