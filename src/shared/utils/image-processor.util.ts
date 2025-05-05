import * as sharp from 'sharp';
import { ImageOptions, ResolutionOption } from '../interfaces/image-options.interface';
import { BadRequestException, Logger } from '@nestjs/common';
import { from, Observable, switchMap, map, catchError, throwError } from 'rxjs';
import config from '../../config';

export class ImageProcessor {
  private static readonly logger = new Logger('ImageProcessor');

  /**
   * Process an image with the given options
   * @param buffer Image buffer
   * @param options Processing options
   * @returns Observable with processed image buffer and metadata
   */
  static processImage(
    buffer: Buffer,
    options: ImageOptions,
  ): Observable<{ buffer: Buffer; info: sharp.OutputInfo }> {
    this.logger.log(`Processing image with options: ${JSON.stringify(options)}, original size: ${buffer.length} bytes`);
    
    // Create a sharp instance
    const image = sharp(buffer);
    
    // Remove EXIF and other metadata
    image.withMetadata({ exif: {} });
    this.logger.debug('Removed EXIF metadata from image');

    return from(image.metadata()).pipe(
      switchMap((metadata) => {
        this.logger.log(`Original image metadata: width=${metadata.width}px, height=${metadata.height}px, format=${metadata.format}`);
        
        // Aspect ratio check (retryable error)
        if (options.aspectRatio && metadata.width && metadata.height) {
          const actualRatio = metadata.width / metadata.height;
          const [num, denom] = options.aspectRatio.split(':').map(Number);
          if (num && denom) {
            const expectedRatio = num / denom;
            const allowedDeviation = options.allowedDeviation ?? 0.075; // 7.5% default
            const ratioDiff = Math.abs(actualRatio - expectedRatio) / expectedRatio;
            if (ratioDiff > allowedDeviation) {
              const errorMsg = `Aspect ratio ${actualRatio.toFixed(3)} does not match required ${options.aspectRatio} (allowed deviation ${allowedDeviation * 100}%)`;
              this.logger.warn(errorMsg);
              return throwError(() => new BadRequestException(errorMsg));
            }
          }
        }

        // Validate minimum dimensions if required
        if (
          (options.minWidth && metadata.width && metadata.width < options.minWidth) ||
          (options.minHeight && metadata.height && metadata.height < options.minHeight)
        ) {
          const errorMsg = `Image dimensions too small. Minimum required: ${options.minWidth ?? 'any'}x${
            options.minHeight ?? 'any'
          }. Provided: ${metadata.width}x${metadata.height}`;
          this.logger.warn(errorMsg);
          return throwError(
            () => new BadRequestException(errorMsg),
          );
        }

        // Calculate resize dimensions if needed
        const shouldResize =
          (options.maxWidth && metadata.width && metadata.width > options.maxWidth) ||
          (options.maxHeight && metadata.height && metadata.height > options.maxHeight);

        if (shouldResize) {
          this.logger.log(`Resizing image to fit within: ${options.maxWidth ?? 'any'}x${options.maxHeight ?? 'any'}`);
          image.resize({
            width: options.maxWidth,
            height: options.maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
          });
        } else {
          this.logger.log('No resizing needed, image dimensions are within limits');
        }

        // Convert to WebP with specified or default quality
        const quality = options.quality ?? config.media.defaultQuality;
        this.logger.log(`Converting image to WebP format with quality: ${quality}`);
        image.webp({
          quality: quality,
          effort: 6, // Higher compression effort
        });

        // Get the processed buffer
        this.logger.debug('Getting processed buffer from Sharp');
        return from(image.toBuffer({ resolveWithObject: true })).pipe(
          map((result) => {
            // Sharp may return either { buffer, info } or { data, info }
            // Normalize the result to always have buffer property with correct type
            const buffer = ('buffer' in result ? result.buffer : result.data) as Buffer;
            this.logger.log(`Image processing completed. Result size: ${buffer.length} bytes, format: ${result.info.format}`);
            return {
              buffer: buffer,
              info: result.info
            };
          })
        );
      }),
      catchError((error) => {
        if (error instanceof BadRequestException) {
          this.logger.warn(`Bad request during image processing: ${error.message}`);
          return throwError(() => error);
        }
        this.logger.error(`Error processing image: ${error.message}`, error.stack);
        return throwError(() => new BadRequestException(`Error processing image: ${error.message}`));
      }),
    );
  }

  /**
   * Process an image at a specific resolution
   * @param buffer Original image buffer
   * @param resolution Resolution options
   * @returns Observable with processed image buffer and metadata
   */
  static processImageAtResolution(
    buffer: Buffer,
    resolution: ResolutionOption,
  ): Observable<{ buffer: Buffer; info: sharp.OutputInfo }> {
    this.logger.log(`Processing image at resolution: ${JSON.stringify(resolution)}`);
    
    // Create a sharp instance
    const image = sharp(buffer);
    
    // Remove EXIF and other metadata
    image.withMetadata({ exif: {} });

    return from(image.metadata()).pipe(
      switchMap((metadata) => {
        this.logger.log(`Original image metadata: width=${metadata.width}px, height=${metadata.height}px, format=${metadata.format}`);
        
        // Resize to the specified dimensions
        this.logger.log(`Resizing image to: ${resolution.width}x${resolution.height}`);
        image.resize({
          width: resolution.width,
          height: resolution.height,
          fit: 'inside',
          withoutEnlargement: true,
        });

        // Convert to WebP with specified or default quality
        const quality = resolution.quality ?? config.media.defaultQuality;
        this.logger.log(`Converting to WebP format with quality: ${quality}`);
        image.webp({
          quality: quality,
          effort: 6, // Higher compression effort
        });

        // Get the processed buffer
        return from(image.toBuffer({ resolveWithObject: true })).pipe(
          map((result) => {
            const buffer = ('buffer' in result ? result.buffer : result.data) as Buffer;
            this.logger.log(`Resolution processing completed. Result size: ${buffer.length} bytes, dimensions: ${result.info.width}x${result.info.height}`);
            return {
              buffer: buffer,
              info: result.info
            };
          })
        );
      }),
      catchError((error) => {
        this.logger.error(`Error processing image resolution: ${error.message}`, error.stack);
        return throwError(() => new BadRequestException(`Error processing image resolution: ${error.message}`));
      }),
    );
  }
}