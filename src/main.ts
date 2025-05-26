import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import config from './config';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable the built-in body parser
    logger: ['log', 'error', 'warn', 'debug', 'verbose'], // Enable all log levels
  });
  
  // Set up custom body parsers
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
  
  // Set up validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Configure CORS if needed
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Set up Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GPE Media Service')
    .setDescription('API for uploading and managing media files')
    .setVersion('1.0')
    // Updated tags to reflect new module structure
    .addTag('images', 'Image upload and management')
    .addTag('videos', 'Video upload and management')
    .addTag('upload-claim', 'Upload claim management')
    .addTag('retrieval', 'Media asset retrieval')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    }
  });

  await app.listen(config.server.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
