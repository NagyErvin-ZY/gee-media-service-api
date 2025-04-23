import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AwsModule } from '../aws/aws.module';
import { FileUploadMiddleware } from './middleware/file-upload.middleware';

@Module({
  imports: [AwsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(FileUploadMiddleware)
      .forRoutes({ path: '/upload/*', method: RequestMethod.POST });
  }
}