import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
  HttpStatus,
  Req,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { UploadImageDto } from './dto/upload-image.dto';
import { UploadResponseDto } from './dto/upload-response.dto';
import {
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable, throwError, tap } from 'rxjs';
import { Request } from 'express';

@ApiTags('media')
@Controller('upload')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {
    this.logger.log('MediaController initialized');
  }

  @Post('image')
  @ApiOperation({ summary: 'Upload and process an image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image successfully uploaded and processed',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 415, description: 'Unsupported media type' })
  uploadImage(
    @Req() req: Request,
    @Query() uploadImageDto: UploadImageDto,
  ): Observable<UploadResponseDto> {
    this.logger.log(`Received image upload request with query params: ${JSON.stringify(uploadImageDto)}`);
    
    // The file is attached to the request by our middleware
    const file = req.file as Express.Multer.File;
    
    if (!file) {
      this.logger.warn('No file found in request. This should have been caught by middleware.');
      // Return an observable with error instead of undefined
      return throwError(() => new BadRequestException('No file provided'));
    }
    
    this.logger.log(`Processing request for file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    
    return this.mediaService.uploadImage(file, uploadImageDto).pipe(
      tap(result => {
        this.logger.log(`Upload completed successfully: url=${result.url}, size=${result.fileSize} bytes`);
      })
    );
  }
}