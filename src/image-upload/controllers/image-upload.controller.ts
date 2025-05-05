import {
  Controller,
  Post,
  Get,
  Query,
  Req,
  Logger,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { ImageUploadService } from '../services/image-upload.service';
import { UploadResponseDto } from '../../shared/dto/upload-response.dto';
import { ClaimBasedUploadDto } from '../dto/claim-based-upload.dto';
import {
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Observable, throwError, tap } from 'rxjs';
import { Request } from 'express';
import { WithDecodedUserJWT, UserID } from '@gpe/backend-common/dist/auth';

@ApiTags('images')
@Controller('images')
export class ImageUploadController {
  private readonly logger = new Logger(ImageUploadController.name);

  constructor(
    private readonly imageUploadService: ImageUploadService,
  ) {
    this.logger.log('ImageUploadController initialized');
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload and process an image using a claim' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'claimId', required: true, description: 'Claim ID for this upload' })
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
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image successfully uploaded and processed',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request or invalid claim' })
  @ApiResponse({ status: 403, description: 'Claim cannot be used or user not authorized' })
  @ApiResponse({ status: 415, description: 'Unsupported media type' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  uploadImageWithClaim(
    @Req() req: Request,
    @UserID() userId: string,
    @Query('claimId') claimId: string,
  ): Observable<UploadResponseDto> {
    this.logger.log(`Received claim-based image upload request: claimId=${claimId}`);
    
    // The file is attached to the request by our middleware
    const file = req.file as Express.Multer.File;
    
    if (!file) {
      this.logger.warn('No file found in request. This should have been caught by middleware.');
      return throwError(() => new BadRequestException('No file provided'));
    }
    
    this.logger.log(`Processing claim-based request for file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    
    return this.imageUploadService.uploadImageWithClaim(file, claimId, userId).pipe(
      tap(result => {
        this.logger.log(`Claim-based upload completed successfully: url=${result.url}, size=${result.fileSize} bytes`);
      })
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get user image upload history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of records to return' })
  @ApiQuery({ name: 'skip', required: false, type: Number, description: 'Number of records to skip (for pagination)' })
  @ApiResponse({
    status: 200,
    description: 'User upload history retrieved successfully',
  })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async getUserUploads(
    @UserID() userId: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    this.logger.log(`Getting image upload history for user ${userId}`);
    return this.imageUploadService.getUserUploads(userId, limit, skip);
  }

  @Get('record/:id')
  @ApiOperation({ summary: 'Get a specific image upload record by ID' })
  @ApiParam({
    name: 'id',
    description: 'ID of the upload record',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload record retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Upload record not found' })
  @ApiBearerAuth()
  @WithDecodedUserJWT()
  async getUploadRecord(@Param('id') recordId: string) {
    this.logger.log(`Getting image upload record with ID: ${recordId}`);
    const record = await this.imageUploadService.getRecordById(recordId);
    
    if (!record) {
      throw new BadRequestException(`Upload record with ID ${recordId} not found`);
    }
    
    return record;
  }
}