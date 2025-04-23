import { Injectable, Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import { AwsS3Service } from '../aws/aws-s3.service';
import { Observable, map, switchMap, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ImageProcessor } from './utils/image-processor.util';
import { ImageOptions } from './interfaces/image-options.interface';
import { UploadResult } from './interfaces/upload-result.interface';
import config from '../config';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly awsS3Service: AwsS3Service) {
    this.logger.log('MediaService initialized');
  }

  /**
   * Upload an image with processing
   * @param file The image file
   * @param options The processing options
   * @returns Observable with upload result
   */
  uploadImage(file: Express.Multer.File, options: ImageOptions): Observable<UploadResult> {
    this.logger.log(`Starting image upload process: filename=${file.originalname}, mimetype=${file.mimetype}, size=${file.size} bytes`);
    this.logger.debug(`Upload options: ${JSON.stringify(options)}`);
    
    // Validate mime type
    if (!config.media.allowedMimeTypes.includes(file.mimetype)) {
      const errorMsg = `File type ${file.mimetype} not allowed. Allowed types: ${config.media.allowedMimeTypes.join(', ')}`;
      this.logger.warn(errorMsg);
      throw new UnsupportedMediaTypeException(errorMsg);
    }

    // Generate a UUID for the file name
    const fileName = `${uuidv4()}.webp`;
    const filePath = `images/${fileName}`;
    this.logger.log(`Generated file path for S3: ${filePath}`);

    // Process the image
    this.logger.log('Starting image processing');
    return ImageProcessor.processImage(file.buffer, options).pipe(
      tap(result => {
        this.logger.log(`Image processing completed: width=${result.info.width}px, height=${result.info.height}px, size=${result.buffer.length} bytes`);
      }),
      
      // Upload the processed image to S3
      switchMap(({ buffer, info }) => {
        this.logger.log(`Uploading processed image to S3: path=${filePath}, size=${buffer.length} bytes`);
        return this.awsS3Service.uploadFile(filePath, buffer, 'image/webp').pipe(
          map((url) => {
            const result = {
              url,
              fileSize: buffer.length,
              width: info.width,
              height: info.height,
              format: 'webp',
            };
            this.logger.log(`Upload successful: url=${url}, width=${info.width}px, height=${info.height}px, size=${buffer.length} bytes`);
            return result;
          })
        );
      })
    );
  }
}