import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import config from './config';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Set up validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Configure CORS if needed
  app.enableCors();

  // Set up Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GPE Media Service')
    .setDescription('API for uploading and managing media files')
    .setVersion('1.0')
    .addTag('media')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(config.server.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
